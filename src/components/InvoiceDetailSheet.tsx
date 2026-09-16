import { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  format, startOfDay, startOfMonth, endOfMonth, subMonths,
} from "date-fns";
import Papa from "papaparse";
import { ChevronRight, Download, Printer } from "lucide-react";
import { isBookingVisibleDate, BOOKINGS_VISIBLE_FROM } from "@/utils/bookingCutoff";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/hooks/usePortalData";

// ── Open Sales Orders (backlog) — matches get_open_sales_order_lines RPC ──────

export interface OpenOrderLine {
  guid_order:          string;
  order_number:        string | null;
  order_date:           string | null;
  requested_ship_date:  string | null;
  customer_id:          string | null;
  dealer_name:          string | null;
  rep_id:               string | null;
  rep_name:             string | null;
  fulfillment_type:     string | null;
  warehouse:             string | null;
  sku:                   string | null;
  description:           string | null;
  product_class:         string | null;
  brand_category:        string | null;
  qty_ordered:            number;
  qty_shipped:            number;
  qty_open:               number;
  unit_price:             number;
  line_discount_pct:      number;
  net_open_amount:        number;
}

type FetchOpenOrdersFn = (params: { limit: number; offset: number }) => Promise<OpenOrderLine[]>;

// ── Shared line type (matches v_portal_dealer_rep_reporting_lines columns) ────

export interface ViewLine {
  metric_type:      string;
  transaction_date: string;
  dealer_name:      string | null;
  customer_id:      string | null;
  rep_name:         string | null;
  rep_id:           string | null;
  sku:              string | null;
  description:      string | null;
  brand_category:   string | null;
  product_class:    string | null;
  amount:           number;
  invoice_number:   string | null;
  invoice_type:     string | null;
  fulfillment_type?: string | null;
}

type FetchFn = (params: { limit: number; offset: number }) => Promise<ViewLine[]>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupBy: "dealer" | "rep" | "territory";
  rowKey: string;      // customer_id (dealer) | rep_id (canonical) | territory_name
  rowLabel: string;
  from: Date;
  to: Date;
  compareFrom?: Date;
  compareTo?: Date;
  viewLines: ViewLine[];
  metric: "bookings" | "invoices";
  repAcIdToCanonical?: Map<string, string>;
  /**
   * RPC mode: factory that creates a fetch function for any date range.
   * When provided, all detail lines are loaded lazily via RPC instead of
   * filtering the in-memory viewLines.
   */
  makeFetchLines?: (from: Date, to: Date) => FetchFn;
  primaryBookingsAmt?: number;
  primaryInvoicedAmt?: number;
  /**
   * RPC mode only: fetches the current open-sales-order backlog for this
   * rep/dealer. Not date-scoped — open orders are a live snapshot,
   * independent of the report's date range. When provided, the "Lines" stat
   * card is replaced with a clickable "Open Sales Orders" card.
   */
  makeFetchOpenOrders?: FetchOpenOrdersFn;
}

type PeriodPreset = "report" | "today" | "yesterday" | "this_month" | "last_month" | "custom";

const BOOKING_CUTOFF = new Date(BOOKINGS_VISIBLE_FROM + "T00:00:00");
const BATCH = 500;

// Maps Acctivate product_class short codes → human-readable collection names.
// Only furniture collection codes belong here — non-collection codes (Closeouts, QC,
// Returns, Lamps sub-classes, etc.) are intentionally excluded so they never appear
// as sidebar collection names.
const COLLECTION_DISPLAY: Record<string, string> = {
  // Sea Winds
  ISLAMORA: "Islamorada",
  CREDENZA: "Credenza",
  SUNHAVEN: "Sun Haven",
  MONBLANC: "Monaco",       // Monaco Blanc finish
  MONBLEU:  "Monaco",       // Monaco Bleu finish
  OCEANISL: "Ocean Isle",
  PICKET:   "Picket Fence",
  SURFSIDE: "Surfside",
  CMAYDRIF: "Cape May",     // Cape May Driftwood finish
  MIRAMAR:  "Miramar",
  MAUI:     "Maui",
  MONTEREY: "Monterey",
  CABBED:   "Cabinet Beds",
  // Finn & Lou
  CHATMAPL: "Chatham Maple",
  CHATMIDN: "Chatham Midnight",
  GENEVA:   "Geneva",
  HYDEPARK: "Hyde Park",
  MHVDARK:  "MHV Dark",
  MHVLIGHT: "MHV Light",
  PTBREEZE: "Point Breeze",
  RIOVISTA: "Rio Vista",
  // Lux
  LUXCOAST: "Lux Coast",
  LUXTRANS: "Lux Transitional",
  LUXTRAD:  "Lux Traditional",
};

// The complete set of known furniture collection display names.
// Used as a strict allowlist: only product_class values in this set are accepted as
// human-readable names from the updated sync format. Everything else (Lamps Coastal,
// Lamps Traditional, Closeouts, Quality Control, Returns, etc.) is blocked and falls
// to description inference or the brand-level fallback.
const KNOWN_COLLECTION_NAMES = new Set<string>([
  ...Object.values(COLLECTION_DISPLAY),
  "Manhattan Valley", // MHV sub-brand; Acctivate short code not yet confirmed
]);

// Canonical collection roster, by brand — the same collection identities
// already accepted by toCollectionDisplayName/KNOWN_COLLECTION_NAMES above
// (there is no separate product/collection master table in this portal;
// this hardcoded set, grouped here by brand for the first time, IS the
// canonical source the rest of the UI already treats as ground truth).
// Used to seed the Collection breakdown so every known collection appears
// even with zero transactions for the selected rep/dealer/date range —
// never derived from transaction rows alone.
const COLLECTION_ROSTER: Record<string, string[]> = {
  "Sea Winds": [
    "Islamorada", "Credenza", "Sun Haven", "Monaco", "Ocean Isle",
    "Picket Fence", "Surfside", "Cape May", "Miramar", "Maui",
    "Monterey", "Cabinet Beds",
  ],
  "Finn & Lou": [
    "Chatham Maple", "Chatham Midnight", "Geneva", "Hyde Park",
    "MHV Dark", "MHV Light", "Point Breeze", "Rio Vista", "Manhattan Valley",
  ],
  "Lux": ["Lux Coast", "Lux Transitional", "Lux Traditional"],
};

function toCollectionDisplayName(productClass: string | null): string | null {
  if (!productClass?.trim()) return null;
  const trimmed = productClass.trim();
  const upper   = trimmed.toUpperCase();
  // Explicit short code → display name (legacy sync format)
  if (COLLECTION_DISPLAY[upper]) return COLLECTION_DISPLAY[upper];
  // Human-readable description from updated sync — only accept if it's a known collection.
  // This blocks non-collection product classes (Lamps Coastal, Closeouts, Returns, etc.)
  // from appearing as sidebar collection names.
  if (KNOWN_COLLECTION_NAMES.has(trimmed)) return trimmed;
  return null;
}

// Description-based inference — TRANSITIONAL FALLBACK only.
// Many rows still have null/empty product_class because they were synced before
// ProductClass.Description was added to the pull scripts. Once the VM sync reruns,
// product_class will be populated directly from Acctivate and these patterns become
// a no-op. All names here are confirmed Acctivate ProductClass display names.
const COLLECTION_FROM_DESC: Array<[RegExp, string]> = [
  // Sea Winds
  [/\bislamorada\b/i,      "Islamorada"],
  [/\bsurfside\b/i,        "Surfside"],
  [/\bmiramar\b/i,         "Miramar"],
  [/\bmaui\b/i,            "Maui"],
  [/\bocean\s+isles?\b/i,  "Ocean Isle"],
  [/\bmonaco\b/i,          "Monaco"],
  [/\bcape\s+may\b/i,      "Cape May"],
  [/\bmonterey\b/i,        "Monterey"],
  [/\bsun\s+haven\b/i,     "Sun Haven"],
  [/\bcredenza\b/i,        "Credenza"],
  [/\bcabinet\s+bed/i,     "Cabinet Beds"],
  [/\bpicket\b/i,          "Picket Fence"],
  // Finn & Lou
  [/manhattan\s+valley/i,  "Manhattan Valley"],
  [/chatham\s+midnight/i,  "Chatham Midnight"],
  [/chatham\s+maple/i,     "Chatham Maple"],
  [/\bchatham\b/i,         "Chatham Maple"],
  [/\bpoint\s+breeze\b/i,  "Point Breeze"],
  [/\bhyde\s+park\b/i,     "Hyde Park"],
  [/\bgeneva\b/i,          "Geneva"],
  [/\brio\s+vista\b/i,     "Rio Vista"],
  [/\bmhv[\s-]*dark\b/i,   "MHV Dark"],
  [/\bmhv[\s-]*light\b/i,  "MHV Light"],
  // Lux
  [/\blux\s+coast\b/i,     "Lux Coast"],
  [/lux\s+trans/i,         "Lux Transitional"],
  [/lux\s+trad/i,          "Lux Traditional"],
];

function inferCollectionFromDesc(desc: string | null): string | null {
  if (!desc?.trim()) return null;
  for (const [re, name] of COLLECTION_FROM_DESC) {
    if (re.test(desc)) return name;
  }
  return null;
}

// Resolve the Level-2 collection label for a line.
// Primary source: product_class from Acctivate (populated by the VM sync scripts).
// Fallback: description-based inference using confirmed Acctivate collection names —
// active only while product_class is absent in legacy-synced rows.
// Brand fallback: if neither source resolves a specific collection, use the brand
// itself (e.g. Lux bookings whose descriptions lack a sub-collection prefix).
function resolveCollection(l: ViewLine): string | null {
  const fromClass = toCollectionDisplayName(l.product_class);
  if (fromClass) return fromClass;
  const fromDesc = inferCollectionFromDesc(l.description);
  if (fromDesc) return fromDesc;
  // Lux items may have descriptions without a sub-collection prefix until VM sync reruns.
  const bc = l.brand_category?.trim();
  if (bc === "Lux") return "Lux";
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesRow(
  l: ViewLine, groupBy: Props["groupBy"], rowKey: string,
  repAcIdToCanonical?: Map<string, string>,
): boolean {
  if (rowKey === "" || rowKey === "Unassigned") return false;
  if (groupBy === "dealer") {
    const cid = (l.customer_id ?? "").trim().toLowerCase();
    return cid ? cid === rowKey : (l.dealer_name ?? "").trim().toLowerCase() === rowKey;
  }
  if (groupBy === "rep") {
    const repAcId = (l.rep_id ?? "").trim().toLowerCase();
    const canonical = (repAcId && repAcIdToCanonical?.get(repAcId)) ?? (l.rep_name ?? "");
    return canonical === rowKey || repAcId === rowKey.trim().toLowerCase();
  }
  return false;
}

function filterLines(
  viewLines: ViewLine[], groupBy: Props["groupBy"], rowKey: string,
  fromMs: number, toMs: number, metricType: string,
  repAcIdToCanonical?: Map<string, string>,
): ViewLine[] {
  return viewLines.filter((l) => {
    if (l.metric_type !== metricType) return false;
    if (metricType === "bookings" && !isBookingVisibleDate(l.transaction_date)) return false;
    const ms = new Date(l.transaction_date + "T00:00:00").getTime();
    if (Number.isNaN(ms) || ms < fromMs || ms > toMs) return false;
    return matchesRow(l, groupBy, rowKey, repAcIdToCanonical);
  });
}

function sumAmount(lines: ViewLine[]): number {
  return lines.reduce((s, l) => s + Number(l.amount), 0);
}

// Non-sales brand categories to exclude from groupings
const EXCLUDED_BRAND_CATS = new Set([
  "freighto", "tariff", "salestax", "ccfee",
  "freight", "tax", "surcharge", "qc",
]);

// ── Hierarchy ─────────────────────────────────────────────────────────────────
//
// Level 1: brand_category  (e.g. "Sea Winds", "Finn & Lou", "Lux")
// Level 2: product_class   (e.g. "Chatham Maple", "Hyde Park") — null for bookings
// Level 3: sku             (e.g. "B23336-DAPGREY")
// Level 4: individual ViewLine records (invoice #, date, dealer, rep, amount)

type SkuEntry   = { sku: string; desc: string; total: number; lines: ViewLine[] };
type ClassEntry = { key: string; label: string | null; total: number; skus: SkuEntry[] };
type BrandEntry = { key: string; label: string; total: number; classes: ClassEntry[] };

function buildHierarchy(lines: ViewLine[]): BrandEntry[] {
  type SkuMap   = Map<string, SkuEntry>;
  type ClassMap = Map<string, { total: number; skuMap: SkuMap; label: string | null }>;
  const brandMap = new Map<string, { total: number; classMap: ClassMap }>();

  // Seed every known brand/collection from the roster first, at $0/0 lines,
  // so the breakdown is collection-roster-driven rather than transaction-
  // driven — a collection with no activity this period still appears, it
  // just has nothing to merge into it below.
  for (const [brandKey, collections] of Object.entries(COLLECTION_ROSTER)) {
    const classMap: ClassMap = new Map();
    for (const label of collections) {
      classMap.set(label, { total: 0, skuMap: new Map(), label });
    }
    brandMap.set(brandKey, { total: 0, classMap });
  }

  for (const l of lines) {
    const bcRaw = l.brand_category?.trim();
    // Excluded codes (freight/tax/tariff/surcharge/qc/ccfee) are never real
    // brand sales — always skip those regardless of metric type.
    if (bcRaw && EXCLUDED_BRAND_CATS.has(bcRaw.toLowerCase())) continue;
    // A blank/null brand_category on an invoiced line is legacy/historical
    // data missing brand attribution — bucket it as "Historical Invoice"
    // (same label SalesReporting.tsx's summary uses) instead of silently
    // dropping it, so this total still reconciles with the header total
    // above, which sums ALL matching lines regardless of brand_category.
    // Bookings lines with no brand_category are excluded, unchanged.
    const brandKey = bcRaw || (l.metric_type === "invoiced" ? "Historical Invoice" : null);
    if (!brandKey) continue;
    if (!brandMap.has(brandKey)) brandMap.set(brandKey, { total: 0, classMap: new Map() });
    const brand = brandMap.get(brandKey)!;
    brand.total += Number(l.amount);

    // Level 2: collection name — from product_class first, description fallback, else null.
    // Map key = display label so DB-sourced and description-inferred lines for the same
    // collection merge into one group.
    const classLabel = resolveCollection(l);
    const classMapKey = classLabel ?? "\x00"; // "\x00" = sentinel for "no collection"
    if (!brand.classMap.has(classMapKey)) {
      brand.classMap.set(classMapKey, { total: 0, skuMap: new Map(), label: classLabel });
    }
    const cls = brand.classMap.get(classMapKey)!;
    cls.total += Number(l.amount);

    const skuKey = l.sku ?? "—";
    if (!cls.skuMap.has(skuKey)) {
      cls.skuMap.set(skuKey, { sku: skuKey, desc: l.description ?? skuKey, total: 0, lines: [] });
    }
    const skuEntry = cls.skuMap.get(skuKey)!;
    skuEntry.total += Number(l.amount);
    skuEntry.lines.push(l);
  }

  return Array.from(brandMap.entries())
    // "Historical Invoice" (null-brand_category invoiced lines) is not shown
    // as its own expandable row here — it's not a real brand. Its dollar
    // amount is still included in the header/grand total (computed
    // separately, straight from the raw lines), and surfaced as a small
    // "unclassified" note near that total so the numbers still reconcile
    // for anyone comparing the total against the visible rows.
    .filter(([brandKey]) => brandKey !== "Historical Invoice")
    .map(([brandKey, bv]): BrandEntry => ({
      key: brandKey,
      label: brandKey,
      total: bv.total,
      classes: Array.from(bv.classMap.entries())
        .map(([ck, cv]): ClassEntry => ({
          key: `${brandKey}::${ck}`,
          label: cv.label,
          total: cv.total,
          skus: Array.from(cv.skuMap.values()).sort((a, b) => b.total - a.total),
        }))
        // Collections with revenue first (descending), then $0 collections
        // alphabetically below them.
        .sort((a, b) => {
          if (a.total > 0 && b.total > 0) return b.total - a.total;
          if (a.total > 0) return -1;
          if (b.total > 0) return 1;
          return (a.label ?? "").localeCompare(b.label ?? "");
        }),
    }))
    .sort((a, b) => b.total - a.total);
}


function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

// ── Open Sales Orders — grouped by Sales Order ─────────────────────────────────

type OpenOrderEntry = {
  guid_order:   string;
  order_number: string;
  order_date:   string | null;
  dealer_name:  string;
  customer_id:  string | null;
  rep_name:     string;
  total:        number;
  lines:        OpenOrderLine[];
};

function buildOpenOrdersHierarchy(lines: OpenOrderLine[]): OpenOrderEntry[] {
  const map = new Map<string, OpenOrderEntry>();
  for (const l of lines) {
    if (!map.has(l.guid_order)) {
      map.set(l.guid_order, {
        guid_order:   l.guid_order,
        order_number: l.order_number ?? l.guid_order,
        order_date:   l.order_date,
        dealer_name:  l.dealer_name ?? l.customer_id ?? "Unknown",
        customer_id:  l.customer_id,
        rep_name:     l.rep_name ?? "Unassigned",
        total:        0,
        lines:        [],
      });
    }
    const entry = map.get(l.guid_order)!;
    entry.total += Number(l.net_open_amount);
    entry.lines.push(l);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function sumOpenAmount(lines: OpenOrderLine[]): number {
  return lines.reduce((s, l) => s + Number(l.net_open_amount), 0);
}

// ── Print / PDF ───────────────────────────────────────────────────────────────

const PRINT_STYLE = `
  body{font-family:system-ui,sans-serif;font-size:11px;margin:20px;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1{font-size:15px;margin:0 0 2px}p{margin:0 0 12px;color:#555}
  table{width:100%;border-collapse:collapse}
  th,td{padding:3px 6px;text-align:left;border-bottom:1px solid #eee}
  th{font-weight:600;border-bottom:2px solid #ccc;background:#f9f9f9}
  .brand-row{background-color:#d0d0d0 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .class-row{background-color:#ebebeb !important;color:#333;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .so-row{background-color:#ebebeb !important;color:#333;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sku-row td{color:#333}
  .line-row td{font-size:10px;color:#666;border-bottom:1px dotted #ddd}
  .amt{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:600;border-top:2px solid #ccc}
  .summary{margin:0 0 14px;border:1px solid #ddd;border-radius:4px;padding:8px 12px;display:flex;gap:24px;flex-wrap:wrap}
  .summary div{font-size:11px}
  .summary strong{display:block;font-size:13px;margin-top:2px}
`;

function summaryBlockHtml(summary: Array<[string, string]>): string {
  return `<div class="summary">${summary.map(([k, v]) => `<div>${k}<strong>${v}</strong></div>`).join("")}</div>`;
}

// Row/table markup for the Open Sales Orders section appended onto the
// metric-detail export (generatePrintHTML), so a dealer/rep's open backlog
// always travels with their CSV/PDF exports.
function openOrdersTableHtml(orders: OpenOrderEntry[], total: number): string {
  let rows = "";
  for (const so of orders) {
    rows += `<tr class="so-row"><td colspan="6"><strong>${so.order_number}</strong> — ${so.dealer_name} (${so.rep_name})${so.order_date ? ` · ${so.order_date}` : ""}</td><td class="amt"><strong>${formatCurrency(so.total)}</strong></td></tr>`;
    for (const l of so.lines) {
      rows += `<tr class="line-row"><td style="padding-left:12px;font-family:monospace;font-size:10px">${l.sku ?? "—"}</td><td>${l.description ?? ""}</td><td>${l.brand_category ?? ""}</td><td>${l.warehouse ?? l.fulfillment_type ?? ""}</td><td class="amt">${Number(l.qty_ordered).toLocaleString()}</td><td class="amt">${Number(l.qty_open).toLocaleString()}</td><td class="amt">${formatCurrency(Number(l.net_open_amount))}</td></tr>`;
    }
  }
  return `<table>
<thead><tr><th>SKU</th><th>Product</th><th>Brand</th><th>Warehouse</th><th class="amt">Ordered</th><th class="amt">Open Qty</th><th class="amt">Open Value</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="6">Total</td><td class="amt">${formatCurrency(total)}</td></tr></tfoot>
</table>`;
}

function generatePrintHTML(
  rowLabel: string, metric: string,
  fromDate: Date, toDate: Date,
  hierarchy: BrandEntry[], grandTotal: number,
  summary: Array<[string, string]>,
  groupBy: "dealer" | "rep" | "territory",
  openOrders: OpenOrderEntry[] = [], openOrdersTotal = 0,
) {
  const dateRange = `${format(fromDate, "MMM d, yyyy")} – ${format(toDate, "MMM d, yyyy")}`;
  // Mirrors LineDetailTable's on-screen column logic: show Dealer unless
  // this drawer is already scoped to one dealer (redundant), show Rep
  // unless it's already scoped to one rep — same reasoning, so the PDF's
  // per-line column never just repeats the name already in the title.
  const showDealer = groupBy !== "dealer";
  const showRep    = groupBy !== "rep";
  const totalCols  = 4 + (showDealer ? 1 : 0) + (showRep ? 1 : 0); // indent + Date + Invoice/Order + [Dealer] + [Rep] + Amount
  const preAmtCols = totalCols - 1;

  let rows = "";
  for (const brand of hierarchy) {
    rows += `<tr class="brand-row"><td colspan="${preAmtCols}"><strong>${brand.label}</strong></td><td class="amt"><strong>${formatCurrency(brand.total)}</strong></td></tr>`;
    for (const cls of brand.classes) {
      if (cls.label) {
        rows += `<tr class="class-row"><td></td><td colspan="${preAmtCols - 1}" style="padding-left:12px"><em>${cls.label}</em></td><td class="amt">${formatCurrency(cls.total)}</td></tr>`;
      }
      for (const sku of cls.skus) {
        const indent = cls.label ? 24 : 12;
        const skuLabel = sku.desc !== sku.sku
          ? `<span style="font-family:monospace;font-size:10px">${sku.sku}</span> — ${sku.desc}`
          : `<span style="font-family:monospace;font-size:10px">${sku.sku}</span>`;
        rows += `<tr class="sku-row"><td></td><td colspan="${preAmtCols - 1}" style="padding-left:${indent}px">${skuLabel}</td><td class="amt">${formatCurrency(sku.total)}</td></tr>`;
        for (const line of [...sku.lines].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))) {
          rows += `<tr class="line-row"><td></td><td style="padding-left:${indent + 12}px">${line.transaction_date}</td><td>${line.invoice_number ?? "—"}</td>`;
          if (showDealer) rows += `<td>${line.dealer_name ?? line.customer_id ?? "—"}</td>`;
          if (showRep)    rows += `<td>${line.rep_name ?? "—"}</td>`;
          rows += `<td class="amt">${formatCurrency(Number(line.amount))}</td></tr>`;
        }
      }
    }
  }
  const openOrdersSection = openOrders.length > 0
    ? `<h1 style="font-size:13px;margin:22px 0 2px">Open Sales Orders</h1>
<p>Current backlog as of the latest Acctivate sync</p>
${openOrdersTableHtml(openOrders, openOrdersTotal)}`
    : "";
  const headerCols = `<th></th><th>Date</th><th>Invoice/Order</th>${showDealer ? "<th>Dealer</th>" : ""}${showRep ? "<th>Rep</th>" : ""}<th class="amt">Amount</th>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>${rowLabel} — ${metric} — ${dateRange}</title>
<style>${PRINT_STYLE}</style></head>
<body>
<h1>${rowLabel}</h1>
<p>${metric.charAt(0).toUpperCase() + metric.slice(1)} · ${dateRange}</p>
${summaryBlockHtml(summary)}
<table>
<thead><tr>${headerCols}</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="${preAmtCols}">Total</td><td class="amt">${formatCurrency(grandTotal)}</td></tr></tfoot>
</table>
${openOrdersSection}
</body></html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoiceDetailSheet({
  open, onOpenChange, groupBy, rowKey, rowLabel,
  from, to, compareFrom, compareTo, viewLines, repAcIdToCanonical,
  makeFetchLines, metric, primaryBookingsAmt, primaryInvoicedAmt,
  makeFetchOpenOrders,
}: Props) {
  // ── Period filter ─────────────────────────────────────────────────────────────
  const [preset,     setPreset]     = useState<PeriodPreset>("report");
  const [customFrom, setCustomFrom] = useState<Date>(from);
  const [customTo,   setCustomTo]   = useState<Date>(to);

  // Accordion open state — 3 independent levels
  const [expandedBrands,  setExpandedBrands]  = useState<Set<string>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [expandedSkus,    setExpandedSkus]    = useState<Set<string>>(new Set());

  // Open Sales Orders — separate snapshot dataset, not date-scoped
  const [openOrderLines,      setOpenOrderLines]      = useState<OpenOrderLine[]>([]);
  const [loadingOpenOrders,   setLoadingOpenOrders]   = useState(false);
  const [showOpenOrdersDetail, setShowOpenOrdersDetail] = useState(false);
  const [expandedOpenOrders,  setExpandedOpenOrders]  = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setPreset("report");
      setCustomFrom(from);
      setCustomTo(to);
      setExpandedBrands(new Set());
      setExpandedClasses(new Set());
      setExpandedSkus(new Set());
      setShowOpenOrdersDetail(false);
      setExpandedOpenOrders(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !makeFetchOpenOrders) {
      if (!open) setOpenOrderLines([]);
      return;
    }
    let cancelled = false;
    setLoadingOpenOrders(true);
    setOpenOrderLines([]);
    (async () => {
      const acc: OpenOrderLine[] = [];
      let offset = 0;
      while (true) {
        const rows = await makeFetchOpenOrders({ limit: BATCH, offset });
        if (cancelled) return;
        acc.push(...rows);
        if (rows.length < BATCH) break;
        offset += BATCH;
      }
      setOpenOrderLines(acc);
      setLoadingOpenOrders(false);
    })().catch(() => { if (!cancelled) setLoadingOpenOrders(false); });
    return () => { cancelled = true; };
  }, [open, makeFetchOpenOrders]);

  const openOrdersTotal     = useMemo(() => sumOpenAmount(openOrderLines), [openOrderLines]);
  const openOrdersHierarchy = useMemo(() => buildOpenOrdersHierarchy(openOrderLines), [openOrderLines]);
  const openOrdersCount     = openOrdersHierarchy.length;
  const openOrdersUnits     = useMemo(
    () => openOrderLines.reduce((s, l) => s + Number(l.qty_open), 0),
    [openOrderLines],
  );

  const today     = useMemo(() => startOfDay(new Date()), []);
  const yesterday = useMemo(() => startOfDay(new Date(Date.now() - 86400000)), []);

  const localFrom = useMemo<Date>(() => {
    switch (preset) {
      case "today":      return today;
      case "yesterday":  return yesterday;
      case "this_month": return startOfMonth(today);
      case "last_month": return startOfMonth(subMonths(today, 1));
      case "custom":     return customFrom;
      default:           return from;
    }
  }, [preset, from, today, yesterday, customFrom]);

  const localTo = useMemo<Date>(() => {
    switch (preset) {
      case "today":      return today;
      case "yesterday":  return yesterday;
      case "this_month": return endOfMonth(today);
      case "last_month": return endOfMonth(subMonths(today, 1));
      case "custom":     return customTo;
      default:           return to;
    }
  }, [preset, to, today, yesterday, customTo]);

  const effectiveFrom = (metric === "bookings" && localFrom < BOOKING_CUTOFF)
    ? BOOKING_CUTOFF : localFrom;
  const bookingRangeValid = metric !== "bookings" || localTo >= BOOKING_CUTOFF;

  // ── RPC mode — auto-load all lines ───────────────────────────────────────────
  const [allLines,        setAllLines]        = useState<ViewLine[]>([]);
  const [loadingAll,      setLoadingAll]      = useState(false);
  const [detailFetchError, setDetailFetchError] = useState<string | null>(null);
  const [retryNonce,      setRetryNonce]      = useState(0);
  const retryDetailFetch = () => setRetryNonce((n) => n + 1);

  const currentFetchFn = useMemo<FetchFn | undefined>(() => {
    if (!makeFetchLines || !bookingRangeValid) return undefined;
    return makeFetchLines(effectiveFrom, localTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeFetchLines, effectiveFrom.getTime(), localTo.getTime(), bookingRangeValid]);

  useEffect(() => {
    if (!open || !currentFetchFn) {
      if (!open) { setAllLines([]); setDetailFetchError(null); }
      return;
    }
    let cancelled = false;
    setLoadingAll(true);
    setDetailFetchError(null);
    setAllLines([]);
    (async () => {
      const acc: ViewLine[] = [];
      let offset = 0;
      while (true) {
        const rows = await currentFetchFn({ limit: BATCH, offset });
        if (cancelled) return;
        acc.push(...rows);
        if (rows.length < BATCH) break;
        offset += BATCH;
      }
      if (cancelled) return;
      setAllLines(acc);
      setLoadingAll(false);
    })().catch((err) => {
      if (cancelled) return;
      // Do not mask the error — log it for debugging and surface an explicit
      // retryable error state instead of silently leaving allLines empty
      // (which would otherwise render as a misleading "no data" message).
      console.error("[booking-detail] fetch failed:", err);
      setDetailFetchError(err instanceof Error ? err.message : String(err));
      setLoadingAll(false);
    });
    return () => { cancelled = true; };
  }, [open, currentFetchFn, retryNonce]);

  // ── Line mode (when makeFetchLines is absent) ─────────────────────────────────
  const localFromMs = startOfDay(effectiveFrom).getTime();
  const localToMs   = startOfDay(localTo).getTime();
  const compFromMs  = useMemo(() => compareFrom ? startOfDay(compareFrom).getTime() : 0, [compareFrom]);
  const compToMs    = useMemo(() => compareTo   ? startOfDay(compareTo).getTime()   : 0, [compareTo]);
  const hasCompare  = !!(compareFrom && compareTo) && !makeFetchLines;
  const compLabel: ReactNode = hasCompare
    ? <>vs {format(compareFrom!, "MMM d, yyyy")} – {format(compareTo!, "MMM d, yyyy")}</>
    : null;

  const activeMetricType = metric === "bookings" ? "bookings" : "invoiced";

  const primBookings = useMemo(() =>
    makeFetchLines ? [] : filterLines(viewLines, groupBy, rowKey, localFromMs, localToMs, "bookings", repAcIdToCanonical),
  [makeFetchLines, viewLines, groupBy, rowKey, localFromMs, localToMs, repAcIdToCanonical]);

  const primInvoiced = useMemo(() =>
    makeFetchLines ? [] : filterLines(viewLines, groupBy, rowKey, localFromMs, localToMs, "invoiced", repAcIdToCanonical),
  [makeFetchLines, viewLines, groupBy, rowKey, localFromMs, localToMs, repAcIdToCanonical]);

  const compBookings = useMemo(() =>
    hasCompare ? filterLines(viewLines, groupBy, rowKey, compFromMs, compToMs, "bookings", repAcIdToCanonical) : [],
  [viewLines, groupBy, rowKey, compFromMs, compToMs, hasCompare, repAcIdToCanonical]);

  const compInvoiced = useMemo(() =>
    hasCompare ? filterLines(viewLines, groupBy, rowKey, compFromMs, compToMs, "invoiced", repAcIdToCanonical) : [],
  [viewLines, groupBy, rowKey, compFromMs, compToMs, hasCompare, repAcIdToCanonical]);

  const primBookingsTotal = useMemo(() => sumAmount(primBookings), [primBookings]);
  const primInvoicedTotal = useMemo(() => sumAmount(primInvoiced), [primInvoiced]);
  const compBookingsTotal = useMemo(() => sumAmount(compBookings), [compBookings]);
  const compInvoicedTotal = useMemo(() => sumAmount(compInvoiced), [compInvoiced]);
  const compActive        = activeMetricType === "bookings" ? compBookings : compInvoiced;

  // Single source of truth for all breakdowns and exports
  const primActive = makeFetchLines
    ? allLines
    : (activeMetricType === "bookings" ? primBookings : primInvoiced);
  const grandTotal = useMemo(() => sumAmount(primActive), [primActive]);
  // Dollar total behind the lines buildHierarchy excludes from the visible
  // breakdown (invoiced lines with no brand_category) — surfaced as a small
  // note near the Line Detail total so it still visibly reconciles with
  // grandTotal above, even though there's no expandable row for it anymore.
  const unclassifiedTotal = useMemo(
    () => sumAmount(primActive.filter((l) => l.metric_type === "invoiced" && !l.brand_category?.trim())),
    [primActive],
  );

  // ── Stat card totals ──────────────────────────────────────────────────────────
  // CANONICAL SOURCE: in RPC mode, primaryBookingsAmt/primaryInvoicedAmt come
  // straight from the parent Dealer/Rep Reporting table's own already-fetched
  // get_sales_reporting_grouped_rows result (bookingRows/invoicedRows in
  // SalesReporting.tsx) — the exact same query that produces the KPI the user
  // sees in the report. The drawer's own detail-lines fetch (allLines) is a
  // SEPARATE RPC call used only to list/break down the qualifying rows; it
  // must never override the header total. Previously this preferred a
  // client-recomputed sum of allLines whenever that fetch had settled
  // (including as an empty array on any transient failure), which could
  // silently display $0 even though the parent's proven-correct total was
  // available the whole time. Fixed: the parent total is now authoritative,
  // full stop — the drawer can only ever agree with it or be visibly broken
  // (surfaced via detailRowsMismatch below), never silently show a different
  // number.
  // The parent total above is only valid for the "Same as report" period —
  // it's computed for the report's own date range, not whatever period the
  // user may have picked in this drawer's own Period selector. Once preset
  // is anything else, there's no parent total for that window to defer to,
  // so the freshly-fetched, already period-scoped detail lines (grandTotal)
  // become authoritative instead — same dataset that already drives the
  // Line Detail breakdown below, so the two stay in agreement.
  const isReportPeriod = preset === "report";
  const displayBookingsAmt = makeFetchLines
    ? (isReportPeriod ? primaryBookingsAmt : grandTotal)
    : primBookingsTotal;
  const displayInvoicedAmt = makeFetchLines
    ? (isReportPeriod ? primaryInvoicedAmt : grandTotal)
    : primInvoicedTotal;

  // The canonical total for whichever metric is active right now.
  const canonicalActiveTotal = metric === "bookings" ? displayBookingsAmt : displayInvoicedAmt;

  // Genuine divergence: the canonical (proven-correct, parent-sourced) total
  // says there IS qualifying activity, but the detail-lines fetch came back
  // empty after successfully completing (not erroring). This is never a
  // legitimate "no data" state — it means the detail RPC/query disagrees
  // with the total RPC and needs investigation, so it must never render the
  // "No detail found" message.
  const detailRowsMismatch = makeFetchLines
    ? (!loadingAll && !detailFetchError && allLines.length === 0
        && canonicalActiveTotal != null && Math.abs(canonicalActiveTotal) > 0.005)
    : false;

  const containerAmt = useMemo(
    () => primActive.reduce((s, l) => s + (l.fulfillment_type === "container" ? Number(l.amount) : 0), 0),
    [primActive],
  );
  const warehouseAmt = useMemo(
    () => primActive.reduce((s, l) => s + (l.fulfillment_type === "warehouse" ? Number(l.amount) : 0), 0),
    [primActive],
  );
  const hasFulfillmentData = useMemo(
    () => primActive.some((l) => l.fulfillment_type != null),
    [primActive],
  );
  function fmtFulfillPct(amt: number, total: number): string {
    if (!hasFulfillmentData || loadingAll) return "…";
    if (total <= 0) return "—";
    return `${((amt / total) * 100).toFixed(1)}%`;
  }

  // Genuine "nothing here" — excludes detailRowsMismatch (that's an error
  // state, not an empty one) and excludes the error/loading states, which
  // render their own messages below.
  const noData = makeFetchLines
    ? (!loadingAll && !detailFetchError && !detailRowsMismatch
        && allLines.length === 0 && (bookingRangeValid || metric !== "bookings"))
    : (primInvoiced.length === 0 && primBookings.length === 0);

  // ── Derived breakdowns — all from primActive ──────────────────────────────────
  const hierarchy  = useMemo(() => buildHierarchy(primActive), [primActive]);

  // ── Accordion helpers ─────────────────────────────────────────────────────────
  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const s = new Set(set);
    s.has(key) ? s.delete(key) : s.add(key);
    setSet(s);
  }

  // ── Exports ───────────────────────────────────────────────────────────────────
  const exportSummary: Array<[string, string]> = [
    [metric === "bookings" ? "Bookings" : "Invoiced",
      formatCurrency((metric === "bookings" ? displayBookingsAmt : displayInvoicedAmt) ?? 0)],
    ["% Container", fmtFulfillPct(containerAmt, grandTotal)],
    ["% Warehouse", fmtFulfillPct(warehouseAmt, grandTotal)],
    ["Open Sales Orders", formatCurrency(openOrdersTotal)],
  ];

  const exportCSV = () => {
    const summaryCsv = ["Summary", ...exportSummary.map(([k, v]) => `${k},${v}`), ""].join("\n");

    const rows = primActive.map((l) => ({
      Date:          l.transaction_date,
      "Invoice #":   l.invoice_number ?? "",
      Dealer:        l.dealer_name ?? "",
      "Customer ID": l.customer_id ?? "",
      Rep:           l.rep_name ?? "",
      SKU:           l.sku ?? "",
      Description:   l.description ?? "",
      Brand:         l.brand_category ?? "",
      Collection:    toCollectionDisplayName(l.product_class) ?? "",
      Amount:        Number(l.amount),
      Metric:        l.metric_type,
    }));
    const detailCsv = Papa.unparse(rows);

    // Open backlog always rides along with the metric-detail export, so the
    // file always matches everything shown in the drawer (Line Detail plus
    // Open Sales Orders), regardless of whether the Open SO section happens
    // to be expanded on screen right now.
    let openOrdersCsv = "";
    if (openOrderLines.length > 0) {
      const openRows = openOrderLines.map((l) => ({
        "Sales Order #":       l.order_number ?? "",
        Dealer:                l.dealer_name ?? "",
        "Customer ID":         l.customer_id ?? "",
        Rep:                   l.rep_name ?? "",
        "Order Date":          l.order_date ?? "",
        SKU:                   l.sku ?? "",
        Product:               l.description ?? "",
        "Ordered Qty":         Number(l.qty_ordered),
        "Remaining Qty":       Number(l.qty_open),
        "Unit Price":          Number(l.unit_price),
        "Remaining Open Value": Number(l.net_open_amount),
        Brand:                 l.brand_category ?? "",
        Warehouse:             l.warehouse ?? l.fulfillment_type ?? "",
      }));
      openOrdersCsv = "\n\nOpen Sales Orders\n" + Papa.unparse(openRows);
    }

    const csv  = summaryCsv + detailCsv + openOrdersCsv;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${rowLabel.replace(/\s+/g, "-")}_${metric}_${format(effectiveFrom, "yyyy-MM-dd")}_${format(localTo, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const html = generatePrintHTML(rowLabel, metric, effectiveFrom, localTo, hierarchy, grandTotal, exportSummary, groupBy, openOrdersHierarchy, openOrdersTotal);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{rowLabel}</SheetTitle>
          <SheetDescription>
            {metric === "bookings" ? "Bookings" : "Invoiced"} detail
            {hasCompare && (
              <span className="block text-[11px] mt-0.5">
                vs {format(compareFrom!, "MMM d, yyyy")} – {format(compareTo!, "MMM d, yyyy")}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* ── Period filter ── */}
        <div className="mt-4 p-3 bg-muted/40 rounded-lg space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Period</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as PeriodPreset)}
              className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="report">Same as report</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="custom">Custom</option>
            </select>
            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={format(customFrom, "yyyy-MM-dd")}
                  onChange={(e) => setCustomFrom(new Date(e.target.value + "T00:00:00"))}
                  className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <input
                  type="date"
                  value={format(customTo, "yyyy-MM-dd")}
                  onChange={(e) => setCustomTo(new Date(e.target.value + "T00:00:00"))}
                  className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {format(effectiveFrom, "MMM d, yyyy")} – {format(localTo, "MMM d, yyyy")}
            {metric === "bookings" && localFrom < BOOKING_CUTOFF && effectiveFrom !== localFrom && (
              <span className="ml-1 text-amber-600">(clamped to booking cutoff)</span>
            )}
          </p>
        </div>

        {/* ── Stat cards ── */}
        {makeFetchLines ? (
          <div className="mt-4 grid grid-cols-4 gap-2">
            <StatCard
              label={metric === "bookings" ? "Bookings" : "Invoiced"}
              value={metric === "bookings"
                ? (displayBookingsAmt != null ? formatCurrency(displayBookingsAmt) : (loadingAll ? "…" : "—"))
                : (displayInvoicedAmt != null ? formatCurrency(displayInvoicedAmt) : (loadingAll ? "…" : "—"))}
            />
            <StatCard
              label="% Container"
              value={fmtFulfillPct(containerAmt, grandTotal)}
            />
            <StatCard
              label="% Warehouse"
              value={fmtFulfillPct(warehouseAmt, grandTotal)}
            />
            {makeFetchOpenOrders ? (
              <Card
                role="button"
                tabIndex={0}
                onClick={() => setShowOpenOrdersDetail((v) => !v)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowOpenOrdersDetail((v) => !v); }}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    Open Sales Orders
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {loadingOpenOrders ? "…" : formatCurrency(openOrdersTotal)}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                    {loadingOpenOrders ? "" : `${openOrdersCount.toLocaleString()} open order${openOrdersCount !== 1 ? "s" : ""} · ${openOrdersUnits.toLocaleString()} units`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <StatCard label="Lines" value={loadingAll ? "…" : allLines.length.toLocaleString()} />
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatCard
              label="Invoiced"
              value={formatCurrency(primInvoicedTotal)}
              compValue={hasCompare ? formatCurrency(compInvoicedTotal) : undefined}
              compLabel={compLabel ?? undefined}
              delta={hasCompare ? pctDelta(primInvoicedTotal, compInvoicedTotal) : undefined}
            />
            <StatCard
              label="Bookings"
              value={localTo < BOOKING_CUTOFF ? "—" : formatCurrency(primBookingsTotal)}
              compValue={hasCompare ? (compareTo! < BOOKING_CUTOFF ? "—" : formatCurrency(compBookingsTotal)) : undefined}
              compLabel={compLabel ?? undefined}
              delta={hasCompare && localTo >= BOOKING_CUTOFF && compareTo! >= BOOKING_CUTOFF
                ? pctDelta(primBookingsTotal, compBookingsTotal) : undefined}
            />
            <StatCard
              label="% Container"
              value={fmtFulfillPct(containerAmt, grandTotal)}
            />
            <StatCard
              label="% Warehouse"
              value={fmtFulfillPct(warehouseAmt, grandTotal)}
            />
            <StatCard
              label="Lines"
              value={primActive.length.toLocaleString()}
              compValue={hasCompare ? compActive.length.toLocaleString() : undefined}
              compLabel={compLabel ?? undefined}
              delta={hasCompare ? pctDelta(primActive.length, compActive.length) : undefined}
            />
          </div>
        )}

        {/* ── Loading / error / empty — explicit states, never stuck ── */}
        {loadingAll && (
          <p className="mt-6 text-sm text-muted-foreground">Loading detail…</p>
        )}
        {!loadingAll && detailFetchError && (
          <div className="mt-6 flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">Unable to load booking detail.</p>
            <Button variant="outline" size="sm" onClick={retryDetailFetch}>Retry</Button>
          </div>
        )}
        {!loadingAll && !detailFetchError && detailRowsMismatch && (
          <div className="mt-6 flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">Unable to load booking detail.</p>
            <p className="text-xs text-muted-foreground">
              The summary total ({formatCurrency(canonicalActiveTotal ?? 0)}) does not match the
              fetched detail rows (0). This is a detail-fetch problem, not an empty period —
              retrying may resolve it.
            </p>
            <Button variant="outline" size="sm" onClick={retryDetailFetch}>Retry</Button>
          </div>
        )}
        {!loadingAll && !detailFetchError && !detailRowsMismatch && metric === "bookings" && !bookingRangeValid && (
          <p className="mt-6 text-sm text-muted-foreground">
            No booking data available before {format(BOOKING_CUTOFF, "MMM d, yyyy")}.
          </p>
        )}
        {/* ── Main content — collection-roster-driven, so it renders even
             when this rep/dealer has zero real lines in the period (every
             known collection still shows, at $0). Only genuinely blocked
             states (loading/error/mismatch/pre-cutoff) skip it entirely. ── */}
        {!loadingAll && !detailFetchError && !detailRowsMismatch && (bookingRangeValid || metric !== "bookings") && (
          <div className="mt-6 space-y-6">

            {noData && (
              <p className="text-sm text-muted-foreground">
                No {metric} lines recorded for this selection in the selected date range — showing the full
                collection breakdown below, all at $0.
              </p>
            )}

            {/* ── By Brand / Category — 4-level accordion ── */}
            {(hierarchy.length > 0 || unclassifiedTotal > 0) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Line Detail</h3>
                  <div className="text-right">
                    <span className="text-xs tabular-nums font-semibold text-muted-foreground">
                      {formatCurrency(grandTotal)}
                    </span>
                    {unclassifiedTotal > 0 && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        includes {formatCurrency(unclassifiedTotal)} unclassified (no brand on file)
                      </p>
                    )}
                  </div>
                </div>
                {hierarchy.length === 0 && (
                  <p className="text-xs text-muted-foreground border rounded-md p-3">
                    All activity in this selection is unclassified (no brand on file) — see note above.
                  </p>
                )}
                {hierarchy.length > 0 && (
                <div className="border rounded-md overflow-hidden divide-y">
                  {hierarchy.map((brand) => (
                    <div key={brand.key}>
                      {/* Level 1: Brand */}
                      <button
                        type="button"
                        onClick={() => toggle(expandedBrands, setExpandedBrands, brand.key)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-muted/40 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-150 ${expandedBrands.has(brand.key) ? "rotate-90" : ""}`} />
                          {brand.label}
                          <Badge variant="secondary" className="text-[9px] h-4 px-1 font-normal">
                            {brand.classes.reduce((s, c) => s + c.skus.length, 0)} SKUs
                          </Badge>
                        </span>
                        <span className="tabular-nums">{formatCurrency(brand.total)}</span>
                      </button>

                      {expandedBrands.has(brand.key) && (
                        <div className="bg-muted/10 divide-y">
                          {brand.classes.map((cls) => {
                            if (cls.label === null) {
                              // No product_class: render SKUs directly under brand (no class row)
                              return cls.skus.map((sku) => {
                                const skuKey = `${brand.key}::::${sku.sku}`;
                                return (
                                  <SkuAccordionRow
                                    key={skuKey}
                                    sku={sku}
                                    skuKey={skuKey}
                                    indent="pl-7"
                                    expandedSkus={expandedSkus}
                                    onToggle={() => toggle(expandedSkus, setExpandedSkus, skuKey)}
                                    groupBy={groupBy}
                                  />
                                );
                              });
                            }

                            // Has product_class: Level 2 class row → Level 3 SKU rows
                            return (
                              <div key={cls.key}>
                                <button
                                  type="button"
                                  onClick={() => toggle(expandedClasses, setExpandedClasses, cls.key)}
                                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition-colors"
                                >
                                  <span className="flex items-center gap-1.5 pl-5">
                                    <ChevronRight className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-150 ${expandedClasses.has(cls.key) ? "rotate-90" : ""}`} />
                                    {cls.label}
                                    <Badge variant="secondary" className="text-[9px] h-4 px-1 font-normal">
                                      {cls.skus.length}
                                    </Badge>
                                  </span>
                                  <span className="tabular-nums text-muted-foreground">{formatCurrency(cls.total)}</span>
                                </button>

                                {expandedClasses.has(cls.key) && (
                                  cls.skus.length === 0 ? (
                                    <p className="pl-14 pr-3 py-2 text-[11px] text-muted-foreground">
                                      No {metric === "bookings" ? "booking" : "invoice"} lines for this collection in the selected period.
                                    </p>
                                  ) : (
                                    <div className="bg-muted/20 divide-y">
                                      {cls.skus.map((sku) => {
                                        const skuKey = `${cls.key}::${sku.sku}`;
                                        return (
                                          <SkuAccordionRow
                                            key={skuKey}
                                            sku={sku}
                                            skuKey={skuKey}
                                            indent="pl-14"
                                            expandedSkus={expandedSkus}
                                            onToggle={() => toggle(expandedSkus, setExpandedSkus, skuKey)}
                                            groupBy={groupBy}
                                          />
                                        );
                                      })}
                                    </div>
                                  )
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Open Sales Orders drill-down — independent of booking/invoice
             detail state (loading/error/empty): a dealer or rep can have
             $0 in bookings or invoices for the period and still have open
             orders, so this must never be hidden by noData/detailFetchError
             from the booking/invoice side. ── */}
        {makeFetchOpenOrders && showOpenOrdersDetail && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Open Sales Orders</h3>
              <span className="text-xs tabular-nums font-semibold text-muted-foreground">
                {formatCurrency(openOrdersTotal)}
              </span>
            </div>
            {loadingOpenOrders ? (
              <p className="text-sm text-muted-foreground">Loading open sales orders…</p>
            ) : openOrderLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open sales orders for this selection.</p>
            ) : (
              <>
                <div className="flex gap-4 mb-2 text-[11px] text-muted-foreground">
                  <span><strong className="text-foreground">{openOrdersCount}</strong> open order{openOrdersCount !== 1 ? "s" : ""}</span>
                  <span><strong className="text-foreground">{openOrderLines.length}</strong> open line{openOrderLines.length !== 1 ? "s" : ""}</span>
                  <span><strong className="text-foreground">{openOrdersUnits.toLocaleString()}</strong> open units</span>
                </div>
                <div className="border rounded-md overflow-hidden divide-y">
                  {openOrdersHierarchy.map((so) => {
                    const isOpen = expandedOpenOrders.has(so.guid_order);
                    return (
                      <div key={so.guid_order}>
                        <button
                          type="button"
                          onClick={() => toggle(expandedOpenOrders, setExpandedOpenOrders, so.guid_order)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
                            <span className="font-mono font-medium">{so.order_number}</span>
                            <span className="truncate text-muted-foreground">{so.dealer_name}</span>
                            {groupBy !== "rep" && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1 font-normal flex-shrink-0">
                                {so.rep_name}
                              </Badge>
                            )}
                            {so.order_date && (
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">{so.order_date}</span>
                            )}
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 font-normal flex-shrink-0">
                              {so.lines.length} line{so.lines.length !== 1 ? "s" : ""}
                            </Badge>
                          </span>
                          <span className="tabular-nums flex-shrink-0 ml-2">{formatCurrency(so.total)}</span>
                        </button>
                        {isOpen && (
                          <div className="px-3 py-2 bg-background border-t overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="border-b text-muted-foreground">
                                  <th className="pb-1 text-left font-normal">SKU</th>
                                  <th className="pb-1 text-left font-normal">Product</th>
                                  <th className="pb-1 text-left font-normal">Brand</th>
                                  <th className="pb-1 text-left font-normal">Warehouse</th>
                                  <th className="pb-1 text-right font-normal">Ordered</th>
                                  <th className="pb-1 text-right font-normal">Open Qty</th>
                                  <th className="pb-1 text-right font-normal">Unit Price</th>
                                  <th className="pb-1 text-right font-normal">Open Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {so.lines.map((l, i) => (
                                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="py-1 font-mono">{l.sku ?? "—"}</td>
                                    <td className="py-1 max-w-[160px] truncate">{l.description ?? "—"}</td>
                                    <td className="py-1">{l.brand_category ?? "—"}</td>
                                    <td className="py-1">{l.warehouse ?? l.fulfillment_type ?? "—"}</td>
                                    <td className="py-1 text-right tabular-nums">{Number(l.qty_ordered).toLocaleString()}</td>
                                    <td className="py-1 text-right tabular-nums">{Number(l.qty_open).toLocaleString()}</td>
                                    <td className="py-1 text-right tabular-nums">{formatCurrency(Number(l.unit_price))}</td>
                                    <td className="py-1 text-right tabular-nums font-medium">
                                      {formatCurrency(Number(l.net_open_amount))}
                                      {Number(l.line_discount_pct) > 0 && (
                                        <span className="block text-[9px] font-normal text-muted-foreground/70 leading-tight">
                                          {Number(l.line_discount_pct) % 1 === 0 ? Number(l.line_discount_pct) : Number(l.line_discount_pct).toFixed(1)}% disc.
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Export buttons — always last, below Line Detail and (when
             expanded) Open Sales Orders, so the export always matches
             everything currently visible above it. ── */}
        {primActive.length > 0 && (
          <div className="flex gap-2 mt-6 pt-2 border-t">
            <button
              type="button"
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted/50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted/50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SkuAccordionRow({
  sku, skuKey, indent, expandedSkus, onToggle, groupBy,
}: {
  sku: SkuEntry;
  skuKey: string;
  indent: string;
  expandedSkus: Set<string>;
  onToggle: () => void;
  groupBy: Props["groupBy"];
}) {
  const isOpen = expandedSkus.has(skuKey);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors"
      >
        <span className={`flex items-center gap-1.5 ${indent} min-w-0`}>
          <ChevronRight className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
          <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">{sku.sku}</span>
          {sku.desc !== sku.sku && (
            <span className="truncate text-[11px] text-foreground/80">{sku.desc}</span>
          )}
          <Badge variant="secondary" className="text-[9px] h-4 px-1 font-normal flex-shrink-0">
            {sku.lines.length}
          </Badge>
        </span>
        <span className="tabular-nums flex-shrink-0 ml-2">{formatCurrency(sku.total)}</span>
      </button>
      {isOpen && (
        <div className="border-t bg-background">
          <LineDetailTable lines={sku.lines} groupBy={groupBy} />
        </div>
      )}
    </div>
  );
}

function LineDetailTable({ lines, groupBy }: { lines: ViewLine[]; groupBy: Props["groupBy"] }) {
  const sorted = [...lines].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  const showDealer = groupBy !== "dealer";
  const showRep    = groupBy !== "rep";
  const colSpanLabel = 2 + (showDealer ? 1 : 0) + (showRep ? 1 : 0);
  return (
    <div className="px-3 py-2">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-1 text-left font-normal">Date</th>
            <th className="pb-1 text-left font-normal">Invoice / Order</th>
            {showDealer && <th className="pb-1 text-left font-normal">Dealer</th>}
            {showRep    && <th className="pb-1 text-left font-normal">Rep</th>}
            <th className="pb-1 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
              <td className="py-1 whitespace-nowrap">{l.transaction_date}</td>
              <td className="py-1 font-mono text-[9px]">{l.invoice_number ?? "—"}</td>
              {showDealer && (
                <td className="py-1 max-w-[90px] truncate">
                  {l.dealer_name ?? l.customer_id ?? "—"}
                </td>
              )}
              {showRep && (
                <td className="py-1 max-w-[80px] truncate">{l.rep_name ?? "—"}</td>
              )}
              <td className="py-1 text-right tabular-nums whitespace-nowrap">{formatCurrency(Number(l.amount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="pt-1" colSpan={colSpanLabel}>
              {lines.length} line{lines.length !== 1 ? "s" : ""}
            </td>
            <td className="pt-1 text-right tabular-nums">
              {formatCurrency(lines.reduce((s, l) => s + Number(l.amount), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StatCard({ label, value, compValue, compLabel, delta }: {
  label: string; value: string; compValue?: string; compLabel?: ReactNode; delta?: number | null;
}) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {compValue !== undefined && (
        <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
          {compLabel ?? "vs"} {compValue}
          {delta !== null && delta !== undefined && (
            <span className={`ml-1 ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
            </span>
          )}
        </p>
      )}
    </CardContent></Card>
  );
}
