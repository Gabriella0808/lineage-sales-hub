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
  dealers: DbDealer[];
  reps: DbSalesRep[];
  territories: DbTerritory[];
  products: DbProduct[];
}

export function InvoiceDetailSheet({
  open, onOpenChange, groupBy, rowKey, rowLabel,
  from, to, dealers, reps, territories, products,
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

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["invoice_detail", groupBy, rowKey, fromStr, toStr, dealerIds.join(",")],
    enabled: open && dealerIds.length > 0,
    queryFn: async () => {
      const out: InvoiceLine[] = [];
      // Batch dealer ids to keep .in() lists manageable
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
            .gte("invoice_date", fromStr)
            .lte("invoice_date", toStr)
            .range(start, start + pageSize - 1);
          if (error) throw error;
          const batch = (data ?? []) as InvoiceLine[];
          out.push(...batch);
          if (batch.length < pageSize) break;
          start += pageSize;
        }
      }
      return out;
    },
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

  const summary = useMemo(() => {
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

    for (const l of lines) {
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

    const sortByTotal = <T extends { total: number }>(arr: T[]) =>
      arr.sort((a, b) => b.total - a.total);

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
  }, [lines, productById, dealerById, repById, territoryById]);

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
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Card><CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invoiced</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(summary.totalAmt)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invoices</p>
            <p className="text-lg font-semibold tabular-nums">{summary.invoiceCount.toLocaleString()}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Units</p>
            <p className="text-lg font-semibold tabular-nums">{summary.totalQty.toLocaleString()}</p>
          </CardContent></Card>
        </div>

        {isLoading && (
          <p className="mt-6 text-sm text-muted-foreground">Loading invoice detail…</p>
        )}

        {!isLoading && lines.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No invoice line items found for this selection.</p>
        )}

        {!isLoading && lines.length > 0 && (
          <div className="mt-6 space-y-6">
            <div className="grid sm:grid-cols-2 gap-6">
              <Section title="By Brand" count={summary.byBrand.length}>
                <BreakdownList rows={summary.byBrand.map((b) => ({ label: b.name, total: b.total, qty: b.qty }))} />
              </Section>
              <Section title="By Collection" count={summary.byCollection.length}>
                <BreakdownList rows={summary.byCollection.map((b) => ({ label: b.name, total: b.total, qty: b.qty }))} />
              </Section>
              <Section title="By Category" count={summary.byCategory.length}>
                <BreakdownList rows={summary.byCategory.map((b) => ({ label: b.name, total: b.total, qty: b.qty }))} />
              </Section>
              {showRepBreakdown && (
                <Section title="By Rep" count={summary.byRep.length}>
                  <BreakdownList rows={summary.byRep.map((b) => ({ label: b.name, total: b.total }))} />
                </Section>
              )}
              {showTerritoryBreakdown && (
                <Section title="By Territory" count={summary.byTerritory.length}>
                  <BreakdownList rows={summary.byTerritory.map((b) => ({ label: b.name, total: b.total }))} />
                </Section>
              )}
              {showDealerBreakdown && (
                <Section title="By Dealer" count={summary.byDealer.length}>
                  <BreakdownList rows={summary.byDealer.map((b) => ({ label: b.name, total: b.total }))} />
                </Section>
              )}
            </div>

            <Section title="Top SKUs" count={summary.bySku.length}>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-1.5 font-medium">SKU</th>
                    <th className="text-left py-1.5 font-medium">Name</th>
                    <th className="text-right py-1.5 font-medium">Qty</th>
                    <th className="text-right py-1.5 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.bySku.slice(0, 50).map((r) => (
                    <tr key={r.sku} className="border-b last:border-0">
                      <td className="py-1.5 font-mono">{r.sku}</td>
                      <td className="py-1.5 truncate max-w-[220px]">
                        {r.name}
                        {r.brand && <span className="text-muted-foreground"> · {r.brand}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{r.qty.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.bySku.length > 50 && (
                <p className="text-[11px] text-muted-foreground mt-1">Showing top 50 of {summary.bySku.length} SKUs</p>
              )}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
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

function BreakdownList({ rows }: { rows: { label: string; total: number; qty?: number }[] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.slice(0, 25).map((r, i) => (
          <tr key={`${r.label}-${i}`} className="border-b last:border-0">
            <td className="py-1.5 truncate max-w-[180px]">{r.label}</td>
            {r.qty !== undefined && (
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.qty.toLocaleString()}</td>
            )}
            <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
