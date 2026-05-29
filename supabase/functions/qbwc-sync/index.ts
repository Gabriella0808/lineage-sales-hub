// QuickBooks Web Connector SOAP endpoint
// Implements the QBWebConnectorSvc interface: serverVersion, clientVersion,
// authenticate, sendRequestXML, receiveResponseXML, closeConnection,
// connectionError, getLastError. Pulls customers + invoices from QB Desktop
// (read-only) and upserts into qb_customers / qb_invoices / qb_invoice_lines.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const QBWC_USER = Deno.env.get("QBWC_USERNAME") ?? "";
const QBWC_PASS = Deno.env.get("QBWC_PASSWORD") ?? "";

// Session state — kept in DB so it survives between SOAP calls
type SessionStep = "customers" | "invoices" | "done";
interface Session { ticket: string; step: SessionStep; iterator?: string; total: number; }

// ---------- SOAP / XML helpers ----------
const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const QBWC_NS = "http://developer.intuit.com/";

function soapEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
<soap:Body>${body}</soap:Body></soap:Envelope>`;
}

function soapResponse(method: string, inner: string): string {
  return soapEnvelope(`<${method}Response xmlns="${QBWC_NS}">${inner}</${method}Response>`);
}

// Cheap tag extractor — works for the small, well-formed XML QBWC sends.
function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}
function tagAll(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1].trim());
}
function detectMethod(body: string): string | null {
  const m = body.match(/<(?:\w+:)?(serverVersion|clientVersion|authenticate|sendRequestXML|receiveResponseXML|closeConnection|connectionError|getLastError)\b/i);
  return m ? m[1] : null;
}
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- qbXML request builders ----------
function qbxmlCustomerQuery(iterator?: string): string {
  const iterAttr = iterator
    ? `iterator="Continue" iteratorID="${iterator}"`
    : `iterator="Start"`;
  return `<?xml version="1.0"?><?qbxml version="13.0"?>
<QBXML><QBXMLMsgsRq onError="continueOnError">
<CustomerQueryRq requestID="1" ${iterAttr}>
<MaxReturned>100</MaxReturned>
<ActiveStatus>All</ActiveStatus>
</CustomerQueryRq>
</QBXMLMsgsRq></QBXML>`;
}

function qbxmlInvoiceQuery(iterator?: string): string {
  const iterAttr = iterator
    ? `iterator="Continue" iteratorID="${iterator}"`
    : `iterator="Start"`;
  // Pull last 2 years of invoices on each sync — tune as needed
  const from = new Date();
  from.setFullYear(from.getFullYear() - 2);
  const fromStr = from.toISOString().slice(0, 10);
  return `<?xml version="1.0"?><?qbxml version="13.0"?>
<QBXML><QBXMLMsgsRq onError="continueOnError">
<InvoiceQueryRq requestID="1" ${iterAttr}>
<MaxReturned>50</MaxReturned>
<ModifiedDateRangeFilter><FromModifiedDate>${fromStr}</FromModifiedDate></ModifiedDateRangeFilter>
<IncludeLineItems>true</IncludeLineItems>
</InvoiceQueryRq>
</QBXMLMsgsRq></QBXML>`;
}

// ---------- Response parsers ----------
function parseCustomersResponse(xml: string) {
  const rets = tagAll(xml, "CustomerRet");
  return rets.map((r) => {
    const billAddr = tag(r, "BillAddress");
    const shipAddr = tag(r, "ShipAddress");
    const flat = (a: string | null) =>
      a ? [tag(a, "Addr1"), tag(a, "Addr2"), tag(a, "City"), tag(a, "State"), tag(a, "PostalCode")].filter(Boolean).join(", ") : null;
    return {
      list_id: tag(r, "ListID")!,
      name: tag(r, "Name") ?? "Unknown",
      company_name: tag(r, "CompanyName"),
      email: tag(r, "Email"),
      phone: tag(r, "Phone"),
      bill_address: flat(billAddr),
      ship_address: flat(shipAddr),
      balance: parseFloat(tag(r, "Balance") ?? "0"),
      is_active: (tag(r, "IsActive") ?? "true").toLowerCase() === "true",
      last_synced_at: new Date().toISOString(),
    };
  });
}

function parseInvoicesResponse(xml: string) {
  const rets = tagAll(xml, "InvoiceRet");
  const invoices: Record<string, unknown>[] = [];
  const lines: Record<string, unknown>[] = [];
  for (const r of rets) {
    const txnId = tag(r, "TxnID")!;
    invoices.push({
      txn_id: txnId,
      ref_number: tag(r, "RefNumber"),
      customer_list_id: (() => { const c = tag(r, "CustomerRef"); return c ? tag(c, "ListID") : null; })(),
      customer_name: (() => { const c = tag(r, "CustomerRef"); return c ? tag(c, "FullName") : null; })(),
      txn_date: tag(r, "TxnDate"),
      due_date: tag(r, "DueDate"),
      subtotal: parseFloat(tag(r, "Subtotal") ?? "0"),
      tax: parseFloat(tag(r, "SalesTaxTotal") ?? "0"),
      total: parseFloat(tag(r, "AppliedAmount") ?? tag(r, "Subtotal") ?? "0"),
      balance_remaining: parseFloat(tag(r, "BalanceRemaining") ?? "0"),
      memo: tag(r, "Memo"),
      is_paid: (tag(r, "IsPaid") ?? "false").toLowerCase() === "true",
      last_synced_at: new Date().toISOString(),
    });
    const lineRets = tagAll(r, "InvoiceLineRet");
    lineRets.forEach((lr, idx) => {
      const itemRef = tag(lr, "ItemRef");
      lines.push({
        invoice_txn_id: txnId,
        line_number: idx + 1,
        item_name: itemRef ? tag(itemRef, "FullName") : null,
        description: tag(lr, "Desc"),
        quantity: parseFloat(tag(lr, "Quantity") ?? "0"),
        rate: parseFloat(tag(lr, "Rate") ?? "0"),
        amount: parseFloat(tag(lr, "Amount") ?? "0"),
      });
    });
  }
  return { invoices, lines };
}

// ---------- Session helpers (stored in qbwc_sync_log) ----------
async function startSession(ticket: string): Promise<Session> {
  await supabase.from("qbwc_sync_log").insert({
    ticket, action: "session_start", status: "running",
    message: JSON.stringify({ step: "customers", total: 0 }),
  });
  return { ticket, step: "customers", total: 0 };
}

async function loadSession(ticket: string): Promise<Session | null> {
  const { data } = await supabase
    .from("qbwc_sync_log").select("message")
    .eq("ticket", ticket).eq("action", "session_start").maybeSingle();
  if (!data) return null;
  try {
    const s = JSON.parse(data.message as string);
    return { ticket, step: s.step, iterator: s.iterator, total: s.total ?? 0 };
  } catch { return null; }
}

async function saveSession(s: Session) {
  await supabase.from("qbwc_sync_log").update({
    message: JSON.stringify({ step: s.step, iterator: s.iterator, total: s.total }),
  }).eq("ticket", s.ticket).eq("action", "session_start");
}

async function endSession(ticket: string, total: number) {
  await supabase.from("qbwc_sync_log").update({
    status: "ok", finished_at: new Date().toISOString(), rows_processed: total,
  }).eq("ticket", ticket).eq("action", "session_start");
}

// ---------- Method handlers ----------
function hServerVersion() {
  return soapResponse("serverVersion", `<serverVersionResult>1.0</serverVersionResult>`);
}
function hClientVersion() {
  // Empty string = accept any QBWC version
  return soapResponse("clientVersion", `<clientVersionResult></clientVersionResult>`);
}

async function hAuthenticate(body: string): Promise<string> {
  const user = tag(body, "strUserName") ?? "";
  const pass = tag(body, "strPassword") ?? "";
  if (!QBWC_USER || !QBWC_PASS || user !== QBWC_USER || pass !== QBWC_PASS) {
    return soapResponse("authenticate",
      `<authenticateResult><string></string><string>nvu</string></authenticateResult>`);
  }
  const ticket = crypto.randomUUID();
  await startSession(ticket);
  // Empty 2nd string = use currently open company file
  return soapResponse("authenticate",
    `<authenticateResult><string>${ticket}</string><string></string></authenticateResult>`);
}

async function hSendRequestXML(body: string): Promise<string> {
  const ticket = tag(body, "ticket") ?? "";
  const session = await loadSession(ticket);
  if (!session) return soapResponse("sendRequestXML", `<sendRequestXMLResult></sendRequestXMLResult>`);
  let request = "";
  if (session.step === "customers") request = qbxmlCustomerQuery(session.iterator);
  else if (session.step === "invoices") request = qbxmlInvoiceQuery(session.iterator);
  else request = "";
  return soapResponse("sendRequestXML",
    `<sendRequestXMLResult>${escapeXml(request)}</sendRequestXMLResult>`);
}

async function hReceiveResponseXML(body: string): Promise<string> {
  const ticket = tag(body, "ticket") ?? "";
  const responseXML = tag(body, "response") ?? "";
  const session = await loadSession(ticket);
  if (!session) return soapResponse("receiveResponseXML", `<receiveResponseXMLResult>100</receiveResponseXMLResult>`);

  // Find iteratorRemainingCount + iteratorID at the *Rs level
  const rsMatch = responseXML.match(/<(CustomerQueryRs|InvoiceQueryRs)\b([^>]*)>/i);
  const attrs = rsMatch?.[2] ?? "";
  const remaining = parseInt(/iteratorRemainingCount="(\d+)"/.exec(attrs)?.[1] ?? "0", 10);
  const iteratorID = /iteratorID="([^"]+)"/.exec(attrs)?.[1];

  let rowsThisBatch = 0;
  try {
    if (session.step === "customers") {
      const rows = parseCustomersResponse(responseXML);
      if (rows.length > 0) {
        const { error } = await supabase.from("qb_customers").upsert(rows, { onConflict: "list_id" });
        if (error) throw error;
        rowsThisBatch = rows.length;
      }
    } else if (session.step === "invoices") {
      const { invoices, lines } = parseInvoicesResponse(responseXML);
      if (invoices.length > 0) {
        const { error: e1 } = await supabase.from("qb_invoices").upsert(invoices, { onConflict: "txn_id" });
        if (e1) throw e1;
        // Replace lines for these invoices
        const txnIds = invoices.map((i) => i.txn_id as string);
        await supabase.from("qb_invoice_lines").delete().in("invoice_txn_id", txnIds);
        if (lines.length > 0) {
          const { error: e2 } = await supabase.from("qb_invoice_lines").insert(lines);
          if (e2) throw e2;
        }
        rowsThisBatch = invoices.length;
      }
    }
  } catch (err) {
    console.error("Sync error:", err);
    await supabase.from("qbwc_sync_log").insert({
      ticket, action: session.step, status: "error",
      message: (err as Error).message,
    });
    return soapResponse("receiveResponseXML", `<receiveResponseXMLResult>-1</receiveResponseXMLResult>`);
  }

  session.total += rowsThisBatch;

  // Advance iterator / step
  if (remaining > 0 && iteratorID) {
    session.iterator = iteratorID;
  } else {
    session.iterator = undefined;
    if (session.step === "customers") session.step = "invoices";
    else if (session.step === "invoices") session.step = "done";
  }
  await saveSession(session);

  // Progress: 100 when done, else estimate
  let percent = 0;
  if (session.step === "done") percent = 100;
  else if (session.step === "invoices" && !session.iterator) percent = 50;
  else if (session.step === "invoices") percent = 75;
  else percent = 25;

  return soapResponse("receiveResponseXML", `<receiveResponseXMLResult>${percent}</receiveResponseXMLResult>`);
}

async function hCloseConnection(body: string): Promise<string> {
  const ticket = tag(body, "ticket") ?? "";
  const session = await loadSession(ticket);
  if (session) await endSession(ticket, session.total);
  return soapResponse("closeConnection",
    `<closeConnectionResult>Sync complete. ${session?.total ?? 0} records processed.</closeConnectionResult>`);
}

function hConnectionError() {
  return soapResponse("connectionError", `<connectionErrorResult>done</connectionErrorResult>`);
}
function hGetLastError() {
  return soapResponse("getLastError", `<getLastErrorResult></getLastErrorResult>`);
}

// ---------- WSDL (served on GET) ----------
const WSDL = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:tns="http://developer.intuit.com/" targetNamespace="http://developer.intuit.com/">
<wsdl:types><xsd:schema targetNamespace="http://developer.intuit.com/"/></wsdl:types>
<wsdl:service name="QBWebConnectorSvc"><wsdl:port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap"><soap:address location="REPLACE_WITH_URL"/></wsdl:port></wsdl:service>
</wsdl:definitions>`;

// ---------- HTTP entry ----------
Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return new Response(WSDL, { headers: { "Content-Type": "text/xml" } });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await req.text();
  const method = detectMethod(body);
  let xml: string;
  try {
    switch (method) {
      case "serverVersion":      xml = hServerVersion(); break;
      case "clientVersion":      xml = hClientVersion(); break;
      case "authenticate":       xml = await hAuthenticate(body); break;
      case "sendRequestXML":     xml = await hSendRequestXML(body); break;
      case "receiveResponseXML": xml = await hReceiveResponseXML(body); break;
      case "closeConnection":    xml = await hCloseConnection(body); break;
      case "connectionError":    xml = hConnectionError(); break;
      case "getLastError":       xml = hGetLastError(); break;
      default:
        return new Response("Unknown SOAP method", { status: 400 });
    }
  } catch (err) {
    console.error("QBWC handler error:", err);
    xml = soapEnvelope(`<soap:Fault><faultcode>Server</faultcode><faultstring>${escapeXml((err as Error).message)}</faultstring></soap:Fault>`);
  }
  return new Response(xml, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
});
