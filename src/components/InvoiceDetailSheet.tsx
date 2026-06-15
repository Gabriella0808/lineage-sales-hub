import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  formatCurrency,
  type DbDealer,
  type DbSalesRep,
  type DbTerritory,
  type DbProduct,
} from "@/hooks/usePortalData";

interface InvoiceLine {
  dealer_id: string | null;
  product_id: string | null;
  sku: string | null;
  product_name: string | null;
  invoice_date: string | null;
  invoice_acctivate_id: string | null;
  qty: number | null;
  unit_price: number | null;
  extended_price: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupBy: "dealer" | "rep" | "territory";
  rowKey: string;
  rowLabel: string;
  from: Date;
  to: Date;
  compareFrom?: Date;
  compareTo?: Date;
  dealers: DbDealer[];
  reps: DbSalesRep[];
  territories: DbTerritory[];
  products: DbProduct[];
}

export function InvoiceDetailSheet({
  open, onOpenChange, groupBy, rowKey, rowLabel,
  from, to, compareFrom, compareTo, dealers, reps, territories, products,
}: Props) {
  // Resolve dealer ids in scope
  const dealerIds = useMemo(() => {
    if (groupBy === "dealer") return rowKey === "__unassigned" ? [] : [rowKey];
    if (groupBy === "rep") {
      const target = rowKey === "__unassigned" ? null : rowKey;
      return dealers.filter((d) => (d.rep_id ?? null) === target).map((d) => d.id);
    }
    const target = rowKey === "__unassigned" ? null : rowKey;
    return dealers.filter((d) => (d.territory_id ?? null) === target).map((d) => d.id);
  }, [groupBy, rowKey, dealers]);

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");
  const cFromStr = compareFrom ? format(compareFrom, "yyyy-MM-dd") : null;
  const cToStr = compareTo ? format(compareTo, "yyyy-MM-dd") : null;
  const hasCompare = !!(cFromStr && cToStr);

  const compLabel = hasCompare
    ? format(compareFrom!, "yyyy") === format(compareTo!, "yyyy")
      ? format(compareFrom!, "yyyy")
      : `${format(compareFrom!, "yyyy")}–${format(compareTo!, "yyyy")}`
    : null;


  const fetchLines = async (fStr: string, tStr: string): Promise<InvoiceLine[]> => {
    const out: InvoiceLine[] = [];
    const chunkSize = 200;
    for (let i = 0; i < dealerIds.length; i += chunkSize) {
      const chunk = dealerIds.slice(i, i + chunkSize);
      let start = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("dealer_invoice_lines")
          .select("dealer_id, product_id, sku, product_name, invoice_date, invoice_acctivate_id, qty, unit_price, extended_price")
          .in("dealer_id", chunk)
          .gte("invoice_date", fStr)
          .lte("invoice_date", tStr)
          .range(start, start + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as InvoiceLine[];
        out.push(...batch);
        if (batch.length < pageSize) break;
        start += pageSize;
      }
    }
    return out;
  };

  const fetchHeaders = async (fStr: string, tStr: string) => {
    const out: { acctivate_id: string | null; total: number | null; branch: string | null }[] = [];
    const chunkSize = 200;
    for (let i = 0; i < dealerIds.length; i += chunkSize) {
      const chunk = dealerIds.slice(i, i + chunkSize);
      let start = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("dealer_invoices")
          .select("acctivate_id, total, branch")
          .in("dealer_id", chunk)
          .gte("invoice_date", fStr)
          .lte("invoice_date", tStr)
          .range(start, start + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as typeof out;
        out.push(...batch);
        if (batch.length < pageSize) break;
        start += pageSize;
      }
    }
    return out;
  };

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["invoice_detail", groupBy, rowKey, fromStr, toStr, dealerIds.join(",")],
    enabled: open && dealerIds.length > 0,
    queryFn: () => fetchLines(fromStr, toStr),
  });

  const { data: headers = [] } = useQuery({
    queryKey: ["invoice_headers_branch", groupBy, rowKey, fromStr, toStr, dealerIds.join(",")],
    enabled: open && dealerIds.length > 0,
    queryFn: () => fetchHeaders(fromStr, toStr),
  });

  const { data: compLines = [] } = useQuery({
    queryKey: ["invoice_detail_comp", groupBy, rowKey, cFromStr, cToStr, dealerIds.join(",")],
    enabled: open && hasCompare && dealerIds.length > 0,
    queryFn: () => fetchLines(cFromStr!, cToStr!),
  });

  const { data: compHeaders = [] } = useQuery({
    queryKey: ["invoice_headers_branch_comp", groupBy, rowKey, cFromStr, cToStr, dealerIds.join(",")],
    enabled: open && hasCompare && dealerIds.length > 0,
    queryFn: () => fetchHeaders(cFromStr!, cToStr!),
  });



  const productById = useMemo(() => {
    const m = new Map<string, DbProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);
  const dealerById = useMemo(() => {
    const m = new Map<string, DbDealer>();
    for (const d of dealers) m.set(d.id, d);
    return m;
  }, [dealers]);
  const repById = useMemo(() => {
    const m = new Map<string, DbSalesRep>();
    for (const r of reps) m.set(r.id, r);
    return m;
  }, [reps]);
  const territoryById = useMemo(() => {
    const m = new Map<string, DbTerritory>();
    for (const t of territories) m.set(t.id, t);
    return m;
  }, [territories]);

  const buildSummary = (arr: InvoiceLine[]) => {
    const bySku = new Map<string, { sku: string; name: string; qty: number; total: number; brand: string | null; collection: string | null }>();
    const byBrand = new Map<string, { qty: number; total: number }>();
    const byCollection = new Map<string, { qty: number; total: number }>();
    const byCategory = new Map<string, { qty: number; total: number }>();
    const byRep = new Map<string, { name: string; total: number }>();
    const byTerritory = new Map<string, { name: string; total: number }>();
    const byDealer = new Map<string, { name: string; total: number }>();
    const invoiceIds = new Set<string>();

    let totalQty = 0;
    let totalAmt = 0;

    for (const l of arr) {
      const ext = Number(l.extended_price ?? 0);
      const qty = Number(l.qty ?? 0);
      totalAmt += ext;
      totalQty += qty;
      if (l.invoice_acctivate_id) invoiceIds.add(l.invoice_acctivate_id);

      const p = l.product_id ? productById.get(l.product_id) : null;
      const sku = l.sku ?? p?.sku ?? "—";
      const name = l.product_name ?? p?.name ?? sku;
      const brand = p?.brand ?? null;
      const collection = p?.collection ?? null;
      const category = p?.category ?? null;

      const skuKey = sku;
      const isFeeLike = /tariff|surcharge|freight|shipping|pass[- ]?through/i.test(`${sku} ${name}`);
      if (!isFeeLike) {
        const sCur = bySku.get(skuKey) ?? { sku, name, qty: 0, total: 0, brand, collection };
        sCur.qty += qty; sCur.total += ext;
        bySku.set(skuKey, sCur);
      }

      const bKey = brand ?? "Unknown";
      const bCur = byBrand.get(bKey) ?? { qty: 0, total: 0 };
      bCur.qty += qty; bCur.total += ext;
      byBrand.set(bKey, bCur);

      const cKey = collection ?? "Unknown";
      const cCur = byCollection.get(cKey) ?? { qty: 0, total: 0 };
      cCur.qty += qty; cCur.total += ext;
      byCollection.set(cKey, cCur);

      const catKey = category ?? "Unknown";
      const catCur = byCategory.get(catKey) ?? { qty: 0, total: 0 };
      catCur.qty += qty; catCur.total += ext;
      byCategory.set(catKey, catCur);

      const dealer = l.dealer_id ? dealerById.get(l.dealer_id) : null;
      if (dealer) {
        const dCur = byDealer.get(dealer.id) ?? { name: dealer.name, total: 0 };
        dCur.total += ext;
        byDealer.set(dealer.id, dCur);

        if (dealer.rep_id) {
          const rep = repById.get(dealer.rep_id);
          const rKey = dealer.rep_id;
          const rCur = byRep.get(rKey) ?? { name: rep?.name ?? "—", total: 0 };
          rCur.total += ext;
          byRep.set(rKey, rCur);
        }
        if (dealer.territory_id) {
          const terr = territoryById.get(dealer.territory_id);
          const tKey = dealer.territory_id;
          const tCur = byTerritory.get(tKey) ?? { name: terr?.name ?? "—", total: 0 };
          tCur.total += ext;
          byTerritory.set(tKey, tCur);
        }
      }
    }

    const sortByTotal = <T extends { total: number }>(arr2: T[]) =>
      arr2.sort((a, b) => b.total - a.total);

    return {
      totalQty, totalAmt, invoiceCount: invoiceIds.size,
      bySku: sortByTotal(Array.from(bySku.values())),
      byBrand: sortByTotal(Array.from(byBrand.entries()).map(([name, v]) => ({ name, ...v }))),
      byCollection: sortByTotal(Array.from(byCollection.entries()).map(([name, v]) => ({ name, ...v }))),
      byCategory: sortByTotal(Array.from(byCategory.entries()).map(([name, v]) => ({ name, ...v }))),
      byRep: sortByTotal(Array.from(byRep.values())),
      byTerritory: sortByTotal(Array.from(byTerritory.values())),
      byDealer: sortByTotal(Array.from(byDealer.values())),
    };
  };

  const summary = useMemo(() => buildSummary(lines), [lines, productById, dealerById, repById, territoryById]);
  const compSummary = useMemo(() => hasCompare ? buildSummary(compLines) : null, [compLines, hasCompare, productById, dealerById, repById, territoryById]);

  const buildBranchSummary = (hs: typeof headers) => {
    const buckets = new Map<string, { total: number; count: number }>();
    let grand = 0;
    for (const h of hs) {
      const raw = (h.branch ?? "").trim();
      const lower = raw.toLowerCase();
      let label: string;
      if (lower.includes("container")) label = "Container";
      else if (lower.includes("warehouse")) label = "Warehouse";
      else if (lower.includes("direct")) label = "Direct Shipping";
      else label = raw || "Unknown";
      const v = Number(h.total) || 0;
      const cur = buckets.get(label) ?? { total: 0, count: 0 };
      cur.total += v; cur.count += 1;
      buckets.set(label, cur);
      grand += v;
    }
    const rows = Array.from(buckets.entries())
      .map(([label, v]) => ({ label, ...v, pct: grand > 0 ? v.total / grand : 0 }))
      .sort((a, b) => b.total - a.total);
    return { rows, grand };
  };

  const branchSummary = useMemo(() => buildBranchSummary(headers), [headers]);
  const compBranchSummary = useMemo(() => hasCompare ? buildBranchSummary(compHeaders) : null, [compHeaders, hasCompare]);

  const compBranchMap = useMemo(() => {
    const m = new Map<string, number>();
    if (compBranchSummary) for (const r of compBranchSummary.rows) m.set(r.label, r.total);
    return m;
  }, [compBranchSummary]);

  const toMap = (rows: { name?: string; label?: string; total: number }[] | undefined, keyField: "name" | "label" = "name") => {
    const m = new Map<string, number>();
    if (!rows) return m;
    for (const r of rows) {
      const k = (keyField === "name" ? (r as { name?: string }).name : (r as { label?: string }).label) ?? "";
      m.set(k, r.total);
    }
    return m;
  };

  const compMaps = useMemo(() => ({
    brand: toMap(compSummary?.byBrand, "name"),
    collection: toMap(compSummary?.byCollection, "name"),
    category: toMap(compSummary?.byCategory, "name"),
    rep: toMap(compSummary?.byRep, "name"),
    territory: toMap(compSummary?.byTerritory, "name"),
    dealer: toMap(compSummary?.byDealer, "name"),
  }), [compSummary]);


  const showDealerBreakdown = groupBy !== "dealer";
  const showRepBreakdown = groupBy !== "rep";
  const showTerritoryBreakdown = groupBy !== "territory";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{rowLabel}</SheetTitle>
          <SheetDescription>
            Invoice detail · {format(from, "MMM d, yyyy")} – {format(to, "MMM d, yyyy")}
            {hasCompare && (
              <span className="block text-[11px] mt-0.5">
                vs {format(compareFrom!, "MMM d, yyyy")} – {format(compareTo!, "MMM d, yyyy")}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatCard label="Invoiced" value={formatCurrency(summary.totalAmt)} compValue={compSummary ? formatCurrency(compSummary.totalAmt) : undefined} delta={compSummary ? pctDelta(summary.totalAmt, compSummary.totalAmt) : undefined} />
          <StatCard label="Invoices" value={summary.invoiceCount.toLocaleString()} compValue={compSummary ? compSummary.invoiceCount.toLocaleString() : undefined} delta={compSummary ? pctDelta(summary.invoiceCount, compSummary.invoiceCount) : undefined} />
          <StatCard label="Units" value={summary.totalQty.toLocaleString()} compValue={compSummary ? compSummary.totalQty.toLocaleString() : undefined} delta={compSummary ? pctDelta(summary.totalQty, compSummary.totalQty) : undefined} />
        </div>

        {isLoading && (
          <p className="mt-6 text-sm text-muted-foreground">Loading invoice detail…</p>
        )}

        {!isLoading && lines.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No invoice line items found for this selection.</p>
        )}

        {!isLoading && lines.length > 0 && (
          <div className="mt-6 space-y-6">
            {branchSummary.rows.length > 0 && (
              <Section title="By Branch" count={branchSummary.rows.length}>
                <table className="w-full text-xs">
                  <tbody>
                    {branchSummary.rows.map((b) => {
                      const cv = compBranchMap.get(b.label);
                      return (
                        <tr key={b.label} className="border-b last:border-0">
                          <td className="py-1.5">{b.label}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">{b.count.toLocaleString()} inv</td>
                          <td className="py-1.5 text-right tabular-nums">{(b.pct * 100).toFixed(1)}%</td>
                          <td className="py-1.5 text-right tabular-nums">{formatCurrency(b.total)}</td>
                          {hasCompare && (
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{cv !== undefined ? formatCurrency(cv) : "—"}</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Section>
            )}

            <div className="grid sm:grid-cols-2 gap-6">
              <Section title="By Brand" count={summary.byBrand.length}>
                <BreakdownList rows={summary.byBrand.map((b) => ({ label: b.name, total: b.total, qty: b.qty, comp: compMaps.brand.get(b.name) }))} showComp={hasCompare} />
              </Section>
              <Section title="By Collection" count={summary.byCollection.length}>
                <BreakdownList rows={summary.byCollection.map((b) => ({ label: b.name, total: b.total, qty: b.qty, comp: compMaps.collection.get(b.name) }))} showComp={hasCompare} />
              </Section>
              <Section title="By Category" count={summary.byCategory.length}>
                <BreakdownList rows={summary.byCategory.map((b) => ({ label: b.name, total: b.total, qty: b.qty, comp: compMaps.category.get(b.name) }))} showComp={hasCompare} />
              </Section>
              {showRepBreakdown && (
                <Section title="By Rep" count={summary.byRep.length}>
                  <BreakdownList rows={summary.byRep.map((b) => ({ label: b.name, total: b.total, comp: compMaps.rep.get(b.name) }))} showComp={hasCompare} />
                </Section>
              )}
              {showTerritoryBreakdown && (
                <Section title="By Territory" count={summary.byTerritory.length}>
                  <BreakdownList rows={summary.byTerritory.map((b) => ({ label: b.name, total: b.total, comp: compMaps.territory.get(b.name) }))} showComp={hasCompare} />
                </Section>
              )}
              {showDealerBreakdown && (
                <Section title="By Dealer" count={summary.byDealer.length}>
                  <BreakdownList rows={summary.byDealer.map((b) => ({ label: b.name, total: b.total, comp: compMaps.dealer.get(b.name) }))} showComp={hasCompare} />
                </Section>
              )}
            </div>

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function StatCard({ label, value, compValue, delta }: { label: string; value: string; compValue?: string; delta?: number | null }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {compValue !== undefined && (
        <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
          vs {compValue}
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

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary" className="text-[10px] h-5">{count}</Badge>
      </div>
      {children}
    </div>
  );
}

function BreakdownList({ rows, showComp }: { rows: { label: string; total: number; qty?: number; comp?: number }[]; showComp?: boolean }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.slice(0, 25).map((r, i) => {
          const delta = showComp && r.comp ? ((r.total - r.comp) / r.comp) * 100 : null;
          return (
            <tr key={`${r.label}-${i}`} className="border-b last:border-0">
              <td className="py-1.5 truncate max-w-[180px]">{r.label}</td>
              {r.qty !== undefined && (
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.qty.toLocaleString()}</td>
              )}
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.total)}</td>
              {showComp && (
                <>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.comp !== undefined ? formatCurrency(r.comp) : "—"}</td>
                  <td className={`py-1.5 text-right tabular-nums text-[10px] ${delta === null ? "text-muted-foreground" : delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
