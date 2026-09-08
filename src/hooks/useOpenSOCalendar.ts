import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CalendarEventType = "open_so_ship" | "open_po_arrival" | "po_invoice_due";

export interface CalendarEvent {
  event_type: CalendarEventType;
  event_date: string | null;
  year: number | null;
  month: number | null;
  source_doc_number: string | null;
  customer_id: string | null;
  dealer_name: string | null;
  vendor_name: string | null;
  container_number: string | null;
  sku: string | null;
  description: string | null;
  qty: number;
  amount: number;
  warehouse: string | null;
  status: string | null;
  rep_name: string | null;
}

export interface MonthSummary {
  year: number;
  month: number;
  // Open SOs
  so_count: number;
  so_qty: number;
  so_amount: number;
  so_doc_count: number;
  // PO arrivals
  po_arrival_count: number;
  po_arrival_qty: number;
  po_arrival_amount: number;
  po_arrival_doc_count: number;
  // PO invoices
  po_invoice_count: number;
  po_invoice_qty: number;
  po_invoice_amount: number;
  po_invoice_doc_count: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function useOpenSOCalendar(year: number) {
  const [events, setEvents]   = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);

      // Fetch events for the given year, plus events with no year (Unscheduled)
      const { data, error: err } = await (supabase as any)
        .from("v_portal_inventory_calendar_events")
        .select("*")
        .or(`year.eq.${year},year.is.null`);

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const rows: CalendarEvent[] = ((data ?? []) as any[]).map((r) => ({
        event_type:        r.event_type            as CalendarEventType,
        event_date:        r.event_date            ?? null,
        year:              r.year  != null ? Number(r.year)  : null,
        month:             r.month != null ? Number(r.month) : null,
        source_doc_number: r.source_doc_number     ?? null,
        customer_id:       r.customer_id           ?? null,
        dealer_name:       r.dealer_name           ?? null,
        vendor_name:       r.vendor_name           ?? null,
        container_number:  r.container_number      ?? null,
        sku:               r.sku                   ?? null,
        description:       r.description           ?? null,
        qty:               toNum(r.qty),
        amount:            toNum(r.amount),
        warehouse:         r.warehouse             ?? null,
        status:            r.status                ?? null,
        rep_name:          r.rep_name              ?? null,
      }));

      setEvents(rows);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [year]);

  const monthSummaries = useMemo<MonthSummary[]>(() => {
    const map = new Map<string, MonthSummary>();
    const upsert = (y: number, m: number): MonthSummary => {
      const key = `${y}-${m}`;
      if (!map.has(key)) map.set(key, {
        year: y, month: m,
        so_count: 0, so_qty: 0, so_amount: 0, so_doc_count: 0,
        po_arrival_count: 0, po_arrival_qty: 0, po_arrival_amount: 0, po_arrival_doc_count: 0,
        po_invoice_count: 0, po_invoice_qty: 0, po_invoice_amount: 0, po_invoice_doc_count: 0,
      });
      return map.get(key)!;
    };

    const soDocs     = new Map<string, Set<string>>();
    const poArrDocs  = new Map<string, Set<string>>();
    const poInvDocs  = new Map<string, Set<string>>();

    for (const e of events) {
      const y = e.year ?? year;
      const m = e.month ?? 0; // 0 = Unscheduled
      const key = `${y}-${m}`;
      const s = upsert(y, m);
      const doc = e.source_doc_number ?? "?";

      if (e.event_type === "open_so_ship") {
        s.so_count++;
        s.so_qty    += e.qty;
        s.so_amount += e.amount;
        if (!soDocs.has(key)) soDocs.set(key, new Set());
        soDocs.get(key)!.add(doc);
        s.so_doc_count = soDocs.get(key)!.size;
      } else if (e.event_type === "open_po_arrival") {
        s.po_arrival_count++;
        s.po_arrival_qty    += e.qty;
        s.po_arrival_amount += e.amount;
        if (!poArrDocs.has(key)) poArrDocs.set(key, new Set());
        poArrDocs.get(key)!.add(doc);
        s.po_arrival_doc_count = poArrDocs.get(key)!.size;
      } else if (e.event_type === "po_invoice_due") {
        s.po_invoice_count++;
        s.po_invoice_qty    += e.qty;
        s.po_invoice_amount += e.amount;
        if (!poInvDocs.has(key)) poInvDocs.set(key, new Set());
        poInvDocs.get(key)!.add(doc);
        s.po_invoice_doc_count = poInvDocs.get(key)!.size;
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
  }, [events, year]);

  const yearTotals = useMemo(() => ({
    so_amount:         monthSummaries.filter(m => m.month > 0).reduce((s, m) => s + m.so_amount, 0),
    so_qty:            monthSummaries.filter(m => m.month > 0).reduce((s, m) => s + m.so_qty, 0),
    po_arrival_amount: monthSummaries.filter(m => m.month > 0).reduce((s, m) => s + m.po_arrival_amount, 0),
    po_arrival_qty:    monthSummaries.filter(m => m.month > 0).reduce((s, m) => s + m.po_arrival_qty, 0),
    po_invoice_amount: monthSummaries.filter(m => m.month > 0).reduce((s, m) => s + m.po_invoice_amount, 0),
    po_invoice_qty:    monthSummaries.filter(m => m.month > 0).reduce((s, m) => s + m.po_invoice_qty, 0),
  }), [monthSummaries]);

  return { events, loading, error, syncedAt, monthSummaries, yearTotals };
}
