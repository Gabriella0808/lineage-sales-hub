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
import { formatCurrency } from "@/hooks/usePortalData";

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
}

type PeriodPreset = "report" | "today" | "yesterday" | "this_month" | "last_month" | "custom";

const BOOKING_CUTOFF = new Date(BOOKINGS_VISIBLE_FROM + "T00:00:00");
const BATCH = 500;

// Maps Acctivate product_class codes → human-readable collection names.
// These codes come from acctivate_invoice_lines_2026_direct.product_class.
// Fall back to the raw value if the code is not in the map (e.g. already readable).
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
  CMAYDRIF: "Cape May",     // Cape May Driftwood finish (was wrongly "Coastal Drifter")
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
  // Misc / Allowances / QC
  CLOSEOUT: "Closeouts",
  ECOMMALL: "E-Comm Allowance",
  QCFACTOR: "Quality Control",
  QCFREIGH: "Quality Control",
  QCINTERN: "Quality Control",
  RETURN:   "Return",
};

function toCollectionDisplayName(productClass: string | null): string | null {
  if (!productClass?.trim()) return null;
  const trimmed = productClass.trim();
  const upper   = trimmed.toUpperCase();
  // Explicit code → display name mapping (legacy short codes from sync)
  if (COLLECTION_DISPLAY[upper]) return COLLECTION_DISPLAY[upper];
  // Human-readable value from an updated sync (has spaces or mixed case) — use it directly
  if (trimmed.includes(" ") || trimmed !== upper) return trimmed;
  // Unknown all-caps code — don't show a cryptic code; let description inference handle it
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
  // Misc
  [/\bcloseo?uts?\b/i,     "Closeouts"],
  [/quality\s+control/i,   "Quality Control"],
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

function isSalesBrandCat(bc: string | null): boolean {
  if (!bc || bc.trim() === "") return false;
  return !EXCLUDED_BRAND_CATS.has(bc.toLowerCase().trim());
}

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

  for (const l of lines) {
    if (!isSalesBrandCat(l.brand_category)) continue;

    const brandKey = l.brand_category!;
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
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}


function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

// ── Print / PDF ───────────────────────────────────────────────────────────────

function generatePrintHTML(
  rowLabel: string, metric: string,
  fromDate: Date, toDate: Date,
  hierarchy: BrandEntry[], grandTotal: number,
) {
  const dateRange = `${format(fromDate, "MMM d, yyyy")} – ${format(toDate, "MMM d, yyyy")}`;
  let rows = "";
  for (const brand of hierarchy) {
    rows += `<tr class="brand-row"><td colspan="5"><strong>${brand.label}</strong></td><td class="amt"><strong>${formatCurrency(brand.total)}</strong></td></tr>`;
    for (const cls of brand.classes) {
      if (cls.label) {
        rows += `<tr class="class-row"><td></td><td colspan="4" style="padding-left:12px"><em>${cls.label}</em></td><td class="amt">${formatCurrency(cls.total)}</td></tr>`;
      }
      for (const sku of cls.skus) {
        const indent = cls.label ? 24 : 12;
        rows += `<tr class="sku-row"><td></td><td style="padding-left:${indent}px;font-family:monospace;font-size:10px" colspan="2">${sku.sku}</td><td colspan="2">${sku.desc !== sku.sku ? sku.desc : ""}</td><td class="amt">${formatCurrency(sku.total)}</td></tr>`;
        for (const line of [...sku.lines].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))) {
          rows += `<tr class="line-row"><td></td><td></td><td style="padding-left:${indent + 12}px">${line.transaction_date}</td><td>${line.invoice_number ?? "—"}</td><td>${line.rep_name ?? line.dealer_name ?? ""}</td><td class="amt">${formatCurrency(Number(line.amount))}</td></tr>`;
        }
      }
    }
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>${rowLabel} — ${metric} — ${dateRange}</title>
<style>
  body{font-family:system-ui,sans-serif;font-size:11px;margin:20px;color:#111}
  h1{font-size:15px;margin:0 0 2px}p{margin:0 0 12px;color:#555}
  table{width:100%;border-collapse:collapse}
  th,td{padding:3px 6px;text-align:left;border-bottom:1px solid #eee}
  th{font-weight:600;border-bottom:2px solid #ccc;background:#f9f9f9}
  .brand-row{background:#f3f3f3}
  .class-row{color:#555}
  .sku-row td{color:#333}
  .line-row td{font-size:10px;color:#666;border-bottom:1px dotted #ddd}
  .amt{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:600;border-top:2px solid #ccc}
</style></head>
<body>
<h1>${rowLabel}</h1>
<p>${metric.charAt(0).toUpperCase() + metric.slice(1)} · ${dateRange}</p>
<table>
<thead><tr><th></th><th>Date</th><th>Invoice/Order</th><th>Description</th><th>Rep / Dealer</th><th class="amt">Amount</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="5">Total</td><td class="amt">${formatCurrency(grandTotal)}</td></tr></tfoot>
</table>
</body></html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoiceDetailSheet({
  open, onOpenChange, groupBy, rowKey, rowLabel,
  from, to, compareFrom, compareTo, viewLines, repAcIdToCanonical,
  makeFetchLines, metric, primaryBookingsAmt, primaryInvoicedAmt,
}: Props) {
  // ── Period filter ─────────────────────────────────────────────────────────────
  const [preset,     setPreset]     = useState<PeriodPreset>("report");
  const [customFrom, setCustomFrom] = useState<Date>(from);
  const [customTo,   setCustomTo]   = useState<Date>(to);

  // Accordion open state — 3 independent levels
  const [expandedBrands,  setExpandedBrands]  = useState<Set<string>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [expandedSkus,    setExpandedSkus]    = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setPreset("report");
      setCustomFrom(from);
      setCustomTo(to);
      setExpandedBrands(new Set());
      setExpandedClasses(new Set());
      setExpandedSkus(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
  const [allLines,   setAllLines]   = useState<ViewLine[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  const currentFetchFn = useMemo<FetchFn | undefined>(() => {
    if (!makeFetchLines || !bookingRangeValid) return undefined;
    return makeFetchLines(effectiveFrom, localTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeFetchLines, effectiveFrom.getTime(), localTo.getTime(), bookingRangeValid]);

  useEffect(() => {
    if (!open || !currentFetchFn) {
      if (!open) setAllLines([]);
      return;
    }
    let cancelled = false;
    setLoadingAll(true);
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
      setAllLines(acc);
      setLoadingAll(false);
    })().catch(() => { if (!cancelled) setLoadingAll(false); });
    return () => { cancelled = true; };
  }, [open, currentFetchFn]);

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

  // ── Stat card totals ──────────────────────────────────────────────────────────
  const lazyTotal        = (makeFetchLines && !loadingAll) ? sumAmount(allLines) : null;
  const displayBookingsAmt = makeFetchLines && metric === "bookings" && lazyTotal !== null
    ? lazyTotal : (makeFetchLines ? primaryBookingsAmt : primBookingsTotal);
  const displayInvoicedAmt = makeFetchLines && metric === "invoices" && lazyTotal !== null
    ? lazyTotal : (makeFetchLines ? primaryInvoicedAmt : primInvoicedTotal);

  const noData = makeFetchLines
    ? (!loadingAll && allLines.length === 0 && (bookingRangeValid || metric !== "bookings"))
    : (primInvoiced.length === 0 && primBookings.length === 0);

  // ── Derived breakdowns — all from primActive ──────────────────────────────────
  const hierarchy  = useMemo(() => buildHierarchy(primActive), [primActive]);
  const grandTotal = useMemo(() => sumAmount(primActive),       [primActive]);

  // ── Accordion helpers ─────────────────────────────────────────────────────────
  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const s = new Set(set);
    s.has(key) ? s.delete(key) : s.add(key);
    setSet(s);
  }

  // ── Exports ───────────────────────────────────────────────────────────────────
  const exportCSV = () => {
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
    const csv  = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${rowLabel.replace(/\s+/g, "-")}_${metric}_${format(effectiveFrom, "yyyy-MM-dd")}_${format(localTo, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const html = generatePrintHTML(rowLabel, metric, effectiveFrom, localTo, hierarchy, grandTotal);
    const win  = window.open("", "_blank", "width=900,height=700");
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
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatCard label="Invoiced"
              value={displayInvoicedAmt != null ? formatCurrency(displayInvoicedAmt) : (loadingAll ? "…" : "—")} />
            <StatCard label="Bookings"
              value={displayBookingsAmt != null ? formatCurrency(displayBookingsAmt) : (loadingAll ? "…" : "—")} />
            <StatCard label="Lines" value={loadingAll ? "…" : allLines.length.toLocaleString()} />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
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
              label="Lines"
              value={primActive.length.toLocaleString()}
              compValue={hasCompare ? compActive.length.toLocaleString() : undefined}
              compLabel={compLabel ?? undefined}
              delta={hasCompare ? pctDelta(primActive.length, compActive.length) : undefined}
            />
          </div>
        )}

        {/* ── Loading / empty ── */}
        {loadingAll && (
          <p className="mt-6 text-sm text-muted-foreground">Loading detail…</p>
        )}
        {!loadingAll && metric === "bookings" && !bookingRangeValid && (
          <p className="mt-6 text-sm text-muted-foreground">
            No booking data available before {format(BOOKING_CUTOFF, "MMM d, yyyy")}.
          </p>
        )}
        {!loadingAll && bookingRangeValid && noData && (
          <p className="mt-6 text-sm text-muted-foreground">
            No {metric} detail found for this selection and date range.
          </p>
        )}

        {/* ── Main content ── */}
        {!loadingAll && !noData && (
          <div className="mt-6 space-y-6">

            {/* ── By Brand / Category — 4-level accordion ── */}
            {hierarchy.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">By Brand / Category</h3>
                  <span className="text-xs tabular-nums font-semibold text-muted-foreground">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
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
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Export buttons ── */}
            {primActive.length > 0 && (
              <div className="flex gap-2 pt-2 border-t">
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
