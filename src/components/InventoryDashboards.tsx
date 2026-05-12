import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, PackageOpen, TrendingUp, TrendingDown, Tag, Activity,
  Truck, Factory, AlertCircle, ShoppingCart, CalendarClock, Layers,
  Heart, Trophy, Ban, Target, Users, Search,
  Package, AlertTriangle, XCircle, RefreshCw, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from "recharts";
import type { InventoryItem } from "@/data/inventoryMock";
import { useInventoryHub, type PurchaseOrder } from "@/hooks/useInventoryHub";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { weeksOfSupply, weeksTone, LEAD_TIME_WEEKS } from "@/lib/inventoryMath";
import ComparePeriodsReport from "@/components/ComparePeriodsReport";

const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` :
  n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` :
  `$${n.toFixed(0)}`;
const fmtNum = (n: number) => n.toLocaleString();

const STAGES = [
  { key: "in_manufacturing", label: "In Manufacturing" },
  { key: "loaded", label: "Loaded" },
  { key: "in_transit", label: "In Transit" },
  { key: "at_port", label: "At Port" },
  { key: "arrived", label: "Arrived" },
  { key: "closed", label: "Closed" },
] as const;

const STAGE_COLOR: Record<string, string> = {
  in_manufacturing: "bg-muted text-muted-foreground border-border",
  loaded: "bg-accent/15 text-accent-foreground border-accent/30",
  in_transit: "bg-primary/10 text-primary border-primary/20",
  at_port: "bg-warning/15 text-warning-foreground border-warning/30",
  arrived: "bg-success/15 text-success border-success/25",
  closed: "bg-muted text-muted-foreground border-border",
};

function KPI({ label, value, hint, icon: Icon, accent, onClick, active }: {
  label: string; value: string | number; hint?: string;
  icon: React.ComponentType<{ className?: string }>; accent?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const inner = (
    <>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
        {hint && <div className={cn("text-xs mt-1", accent ?? "text-muted-foreground")}>{hint}</div>}
      </div>
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "text-left rounded-lg border bg-card p-5 flex items-start justify-between transition-colors hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring",
          active ? "border-primary ring-1 ring-primary/40" : "border-border",
        )}
      >
        {inner}
      </button>
    );
  }
  return <Card className="p-5 flex items-start justify-between">{inner}</Card>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
      {message}
    </div>
  );
}


function ReportSkuValue({ items, total }: { items: InventoryItem[]; total: number }) {
  const rows = useMemo(() => items
    .map((it) => ({ it, value: it.onHandValue ?? (it.unitCost ?? 0) * it.onHand }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value), [items]);
  if (rows.length === 0) return <EmptyState message="No SKUs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-left px-3 py-2">Collection</th>
          <th className="text-right px-3 py-2">On Hand</th>
          <th className="text-right px-3 py-2">Unit Cost</th>
          <th className="text-right px-3 py-2">Value</th>
          <th className="text-right px-3 py-2">% of Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ it, value }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-xs text-muted-foreground">{it.collection}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.onHand)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{it.unitCost ? `$${it.unitCost.toFixed(2)}` : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(value)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportOpenPOsFull({ pos }: { pos: PurchaseOrder[] }) {
  const rows = useMemo(() => {
    const hash = (s: string) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
      return h;
    };
    const BRANDS = ["SW", "F&L", "LL"];
    const VENDORS = ["THINHVIET", "PACIFIC MILL", "VIETNAM ATELIER", "HANOI WOODWORKS", "MEKONG CRAFT", "SAIGON FORGE"];
    const FORWARDERS = ["Ceva Logistics", "Expeditors", "Kuehne+Nagel", "DSV", "DHL Global"];
    const CUSTOMS = ["RTG Internal", "Livingston", "Expeditors Brokerage", "Kuehne Brokerage"];
    const VESSELS = ["CMA CGM ORFEO", "MAERSK HONAM", "EVER GIVEN", "MSC OSCAR", "ONE STORK", "COSCO SHIPPING"];
    const PORTS = ["TAMPA", "SAVANNAH", "LONG BEACH", "CHARLESTON", "NORFOLK", "HOUSTON"];
    const DESCRIPTIONS = ["RTG DC", "Isla Occ", "Coastal Sofa", "Veranda Set", "Bayview Bed", "Harbor Dining", "Tradewinds Lounge"];

    return [...pos]
      .sort((a, b) => Number(b.total_value) - Number(a.total_value))
      .map((p, idx) => {
        const seed = hash((p.po_number ?? p.id ?? `po-${idx}`) + "|openpo");
        const orderDate = p.order_date ? new Date(p.order_date) : new Date(Date.now() - ((seed % 180) + 30) * 86400000);
        const proForma = new Date(orderDate.getTime() + 60 * 86400000);
        const actualShip = new Date(proForma.getTime() + ((seed % 14) - 3) * 86400000);
        const eta = p.eta ? new Date(p.eta) : new Date(actualShip.getTime() + 49 * 86400000);
        const dueInPort = new Date(eta.getTime() + 2 * 86400000);
        const invoiceEntered = new Date(actualShip.getTime() + 1 * 86400000);
        const oceanEntered = new Date(actualShip.getTime() + 3 * 86400000);
        const drayageEntered = new Date(eta.getTime() + 1 * 86400000);
        const value = Number(p.total_value) || (18000 + (seed % 42000));
        const oceanFreight = 8 + ((seed >> 3) % 18) / 10; // 0.8-2.6 (k)
        const drayage = (seed >> 5) % 4 === 0 ? "N/A" : `$${(900 + ((seed >> 7) % 1800)).toFixed(0)}`;
        const tariffDisc = (seed >> 9) % 3 === 0 ? "Yes" : "No";
        return {
          id: p.id,
          orderDate,
          brand: BRANDS[seed % BRANDS.length],
          vendor: (p.factory ?? VENDORS[(seed >> 1) % VENDORS.length]).toUpperCase(),
          description: `${DESCRIPTIONS[(seed >> 2) % DESCRIPTIONS.length]} (${(1500000 + (seed % 500000))}YPA)`,
          dcInvRec: (seed >> 4) % 5 === 0 ? "NO" : "YES",
          proForma,
          poNumber: p.po_number ?? `PO-${(seed % 9000) + 1000}`,
          actualShip,
          eta,
          forwarder: FORWARDERS[(seed >> 6) % FORWARDERS.length],
          customs: CUSTOMS[(seed >> 8) % CUSTOMS.length],
          vessel: VESSELS[(seed >> 10) % VESSELS.length],
          container: `${["CMAU", "MSKU", "TCLU", "GESU"][(seed >> 12) % 4]}${1000000 + (seed % 8999999)}`,
          dueInPort,
          port: PORTS[(seed >> 14) % PORTS.length],
          whereToTrack: ["Carrier site", "Forwarder portal", "N/A"][(seed >> 16) % 3],
          drayage,
          notes: (seed >> 18) % 7 === 0 ? "Customer responsible" : "—",
          tariffDisc,
          invoiceValue: value,
          invoiceEntered,
          invoiceNo: `INV-${(seed % 90000) + 10000}`,
          oceanFreight,
          oceanEntered,
          drayageRate: drayage === "N/A" ? "N/A" : drayage,
          drayageEntered,
          tariff: tariffDisc === "Yes" ? `$${(((seed >> 11) % 4000) + 500).toFixed(0)}` : "N/A",
        };
      });
  }, [pos]);

  const [detail, setDetail] = useState<{ title: string; subset: typeof rows } | null>(null);

  if (rows.length === 0) return <EmptyState message="No POs to show." />;
  const fd = (d: Date) => d.toLocaleDateString();

  // Vendor lateness: avg days late = actualShip - proForma
  const vendorLateness = (() => {
    const m = new Map<string, { sum: number; n: number; late: number }>();
    for (const r of rows) {
      const days = Math.round((r.actualShip.getTime() - r.proForma.getTime()) / 86400000);
      const e = m.get(r.vendor) ?? { sum: 0, n: 0, late: 0 };
      e.sum += days; e.n += 1; if (days > 0) e.late += 1;
      m.set(r.vendor, e);
    }
    return Array.from(m.entries())
      .map(([vendor, v]) => ({ vendor, avgDaysLate: Math.round(v.sum / v.n), pos: v.n, lateCount: v.late }))
      .sort((a, b) => b.avgDaysLate - a.avgDaysLate);
  })();

  // ETA by month
  const etaByMonth = (() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.eta.getFullYear()}-${String(r.eta.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => {
        const [y, mo] = month.split("-");
        const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
        return { month: label, count };
      });
  })();

  // On-time vs late
  const now = Date.now();
  const statusSplit = (() => {
    let onTime = 0, late = 0, arrived = 0;
    for (const r of rows) {
      if (r.eta.getTime() < now) arrived += 1;
      else if (r.actualShip.getTime() > r.proForma.getTime()) late += 1;
      else onTime += 1;
    }
    return [
      { name: "On Time", value: onTime, fill: "hsl(var(--success))" },
      { name: "Delayed", value: late, fill: "hsl(var(--destructive))" },
      { name: "Arrived", value: arrived, fill: "hsl(var(--muted-foreground))" },
    ].filter((d) => d.value > 0);
  })();

  const totalLate = vendorLateness.reduce((s, v) => s + v.lateCount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-xs font-semibold mb-1">Avg Days Late by Vendor</div>
          <div className="text-[10px] text-muted-foreground mb-2">Click a bar to view POs · {totalLate} late POs</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vendorLateness} layout="vertical" margin={{ left: 10, right: 10, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="vendor" tick={{ fontSize: 10 }} width={110} />
              <RTooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Bar
                dataKey="avgDaysLate"
                name="Avg days late"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={((d: { vendor?: string }) => {
                  if (!d?.vendor) return;
                  setDetail({ title: `Vendor: ${d.vendor}`, subset: rows.filter((r) => r.vendor === d.vendor) });
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }) as any}
              >
                {vendorLateness.map((v, i) => (
                  <Cell key={i} fill={v.avgDaysLate > 7 ? "hsl(var(--destructive))" : v.avgDaysLate > 0 ? "hsl(var(--warning))" : "hsl(var(--success))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-3">
          <div className="text-xs font-semibold mb-1">Estimated Arrivals by Month</div>
          <div className="text-[10px] text-muted-foreground mb-2">Click a bar to view POs arriving</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={etaByMonth} margin={{ left: 0, right: 10, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RTooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Bar
                dataKey="count"
                name="POs arriving"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={((d: { month?: string }) => {
                  if (!d?.month) return;
                  const subset = rows.filter((r) => {
                    const label = new Date(r.eta.getFullYear(), r.eta.getMonth(), 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
                    return label === d.month;
                  });
                  setDetail({ title: `Arrivals: ${d.month}`, subset });
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }) as any}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-3">
          <div className="text-xs font-semibold mb-1">Shipment Status</div>
          <div className="text-[10px] text-muted-foreground mb-2">Click a segment to view POs</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusSplit}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                innerRadius={40}
                label={{ fontSize: 10 }}
                cursor="pointer"
                onClick={(d: { name?: string }) => {
                  if (!d?.name) return;
                  const subset = rows.filter((r) => {
                    if (r.eta.getTime() < now) return d.name === "Arrived";
                    if (r.actualShip.getTime() > r.proForma.getTime()) return d.name === "Delayed";
                    return d.name === "On Time";
                  });
                  setDetail({ title: `Status: ${d.name}`, subset });
                }}
              >
                {statusSplit.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <RTooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              {detail?.subset.length ?? 0} PO{(detail?.subset.length ?? 0) === 1 ? "" : "s"} · total {fmtMoney((detail?.subset ?? []).reduce((s, r) => s + r.invoiceValue, 0))}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground sticky top-0">
                <tr>
                  {["PO #","Vendor","Brand","Description","Pro Forma","Actual Ship","ETA","Port","Vessel","Container","Invoice $","Days Late"].map((h) => (
                    <th key={h} className="text-left px-2 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(detail?.subset ?? []).map((r) => {
                  const daysLate = Math.round((r.actualShip.getTime() - r.proForma.getTime()) / 86400000);
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.poNumber}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.vendor}</td>
                      <td className="px-2 py-1.5">{r.brand}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.description}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.proForma)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.actualShip)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.eta)}</td>
                      <td className="px-2 py-1.5">{r.port}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.vessel}</td>
                      <td className="px-2 py-1.5 font-mono">{r.container}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.invoiceValue)}</td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold", daysLate > 7 ? "text-destructive" : daysLate > 0 ? "text-warning" : "text-success")}>{daysLate > 0 ? `+${daysLate}` : daysLate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground sticky top-0">
          <tr>
            {[
              "Order Date","Brand","Vendor","Description","DC Inv/Rec","Pro Forma Ship","PO #","Actual Ship","Est Arrival","Freight Forwarder",
              "Customs Provider","Vessel","Container #","Due in Port","Port","Where to Track","Drayage","Notes","Tariff Disc?",
              "Invoice $","Inv Entered","Invoice No","Ocean Freight","Ocean Entered","Drayage Rate","Dray Entered","Tariff",
            ].map((h) => <th key={h} className="text-left px-2 py-2 whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.orderDate)}</td>
              <td className="px-2 py-1.5">{r.brand}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{r.vendor}</td>
              <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.description}>{r.description}</td>
              <td className="px-2 py-1.5">{r.dcInvRec}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.proForma)}</td>
              <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.poNumber}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.actualShip)}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.eta)}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{r.forwarder}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{r.customs}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{r.vessel}</td>
              <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.container}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.dueInPort)}</td>
              <td className="px-2 py-1.5">{r.port}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{r.whereToTrack}</td>
              <td className="px-2 py-1.5">{r.drayage}</td>
              <td className="px-2 py-1.5 max-w-[160px] truncate" title={r.notes}>{r.notes}</td>
              <td className="px-2 py-1.5">{r.tariffDisc}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">{fmtMoney(r.invoiceValue)}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.invoiceEntered)}</td>
              <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.invoiceNo}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.oceanFreight.toFixed(1)}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.oceanEntered)}</td>
              <td className="px-2 py-1.5">{r.drayageRate}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fd(r.drayageEntered)}</td>
              <td className="px-2 py-1.5">{r.tariff}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ReportPOs({ pos, prepaidMode }: { pos: PurchaseOrder[]; prepaidMode?: boolean }) {
  const rows = [...pos].sort((a, b) => Number(b.total_value) - Number(a.total_value));
  if (rows.length === 0) return <EmptyState message="No POs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">PO #</th>
          <th className="text-left px-3 py-2">Factory</th>
          <th className="text-left px-3 py-2">Stage</th>
          <th className="text-left px-3 py-2">ETA</th>
          <th className="text-right px-3 py-2">Total Value</th>
          {prepaidMode && <th className="text-right px-3 py-2">Prepaid</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{p.po_number ?? "—"}</td>
            <td className="px-3 py-2">{p.factory ?? "—"}</td>
            <td className="px-3 py-2 text-xs">{p.production_stage ?? p.status ?? "—"}</td>
            <td className="px-3 py-2 text-xs">{p.eta ? new Date(p.eta).toLocaleDateString() : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(Number(p.total_value))}</td>
            {prepaidMode && <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(p.prepaid_amount ?? 0))}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportBacklog({ rows }: { rows: { id: string; order_number: string | null; sku: string; dealer_name: string | null; qty_open: number; unit_price: number; extended_value: number; order_date: string | null; promised_date: string | null }[] }) {
  if (rows.length === 0) return <EmptyState message="No open sales orders." />;
  const sorted = [...rows].sort((a, b) => Number(b.extended_value) - Number(a.extended_value));
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">Order #</th>
          <th className="text-left px-3 py-2">Dealer</th>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-right px-3 py-2">Qty Open</th>
          <th className="text-right px-3 py-2">Unit Price</th>
          <th className="text-right px-3 py-2">Value</th>
          <th className="text-left px-3 py-2">Promised</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{r.order_number ?? "—"}</td>
            <td className="px-3 py-2 max-w-[200px] truncate">{r.dealer_name ?? "—"}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(Number(r.qty_open))}</td>
            <td className="px-3 py-2 text-right tabular-nums">${Number(r.unit_price).toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(Number(r.extended_value))}</td>
            <td className="px-3 py-2 text-xs">{r.promised_date ? new Date(r.promised_date).toLocaleDateString() : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportSalesRatio({ items }: { items: InventoryItem[] }) {
  const rows = useMemo(() => items.map((it) => {
    const value = it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
    const monthlySales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
    const ratio = value > 0 ? monthlySales / value : 0;
    return { it, value, monthlySales, ratio };
  }).filter((r) => r.value > 0).sort((a, b) => a.ratio - b.ratio), [items]);
  if (rows.length === 0) return <EmptyState message="No SKUs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-right px-3 py-2">Inv Value</th>
          <th className="text-right px-3 py-2">Mo Sales $</th>
          <th className="text-right px-3 py-2">Ratio</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map(({ it, value, monthlySales, ratio }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(value)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(monthlySales)}</td>
            <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", ratio < 0.2 && "text-destructive", ratio >= 0.5 && "text-success")}>{ratio.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportTurnover({ items }: { items: InventoryItem[] }) {
  const rows = useMemo(() => items.map((it) => {
    const value = it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
    const annualSales = it.avgMonthlySales * 12 * (it.listPrice ?? it.unitCost ?? 0);
    const turns = value > 0 ? annualSales / value : 0;
    return { it, value, turns };
  }).filter((r) => r.value > 0).sort((a, b) => b.turns - a.turns), [items]);
  if (rows.length === 0) return <EmptyState message="No SKUs to show." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-right px-3 py-2">Inv Value</th>
          <th className="text-right px-3 py-2">Mo Sales</th>
          <th className="text-right px-3 py-2">Turns / yr</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map(({ it, value, turns }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(value)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales.toFixed(1)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{turns.toFixed(1)}×</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportLost({ items }: { items: InventoryItem[] }) {
  const rows = useMemo(() => items.map((it) => ({
    it, lost: it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0),
  })).filter((r) => r.lost > 0).sort((a, b) => b.lost - a.lost), [items]);
  if (rows.length === 0) return <EmptyState message="No active stockouts with sales history." />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-2">SKU</th>
          <th className="text-left px-3 py-2">Product</th>
          <th className="text-right px-3 py-2">Mo Sales (units)</th>
          <th className="text-right px-3 py-2">On PO</th>
          <th className="text-right px-3 py-2">Lost / mo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ it, lost }) => (
          <tr key={it.sku} className="border-t border-border hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
            <td className="px-3 py-2 max-w-[260px] truncate">{it.product}</td>
            <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales.toFixed(1)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.onPo ?? 0)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">{fmtMoney(lost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = STAGE_COLOR[stage] ?? "bg-muted text-muted-foreground border-border";
  const label = STAGES.find((s) => s.key === stage)?.label ?? stage;
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs border", cls)}>{label}</span>;
}

type StatusFilter = "all" | InventoryItem["status"];

interface Props {
  items: InventoryItem[];
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (s: StatusFilter) => void;
}

export default function InventoryDashboards({ items, statusFilter, onStatusFilterChange }: Props) {
  const hub = useInventoryHub();

  // Status counts for clickable summary tiles
  const statusCounts = useMemo(() => {
    const c = { total: items.length, critical: 0, outOfStock: 0, reorder: 0, fast: 0 };
    for (const it of items) {
      if (it.status === "critical") c.critical++;
      if (it.status === "out-of-stock") c.outOfStock++;
      if (it.status === "reorder-soon") c.reorder++;
      if (it.status === "fast-moving") c.fast++;
    }
    return c;
  }, [items]);


  // ============ SECTION 1: HIGH LEVEL SUMMARY ============
  const summary = useMemo(() => {
    let value = 0, units = 0, monthlySales = 0, lostSales = 0;
    let outOfStockValue = 0, closeoutValue = 0, annualUnits = 0;
    for (const it of items) {
      const cost = it.unitCost ?? 0;
      const lineValue = it.onHandValue ?? cost * it.onHand;
      value += lineValue;
      units += it.onHand;
      monthlySales += it.avgMonthlySales * (it.listPrice ?? cost);
      annualUnits += it.avgMonthlySales * 12;
      if (it.status === "out-of-stock") {
        lostSales += it.avgMonthlySales * (it.listPrice ?? cost);
        outOfStockValue += it.avgMonthlySales * (it.listPrice ?? cost);
      }
      if (it.isCloseout || it.isClearance) closeoutValue += lineValue;
    }
    const backlogValue = hub.openOrders.reduce((s, o) => s + Number(o.extended_value ?? 0), 0);
    const backlogUnits = hub.openOrders.reduce((s, o) => s + Number(o.qty_open ?? 0), 0);
    const openPoValue = hub.purchaseOrders
      .filter((p) => p.production_stage !== "closed" && p.production_stage !== "arrived")
      .reduce((s, p) => s + Number(p.total_value ?? 0), 0);
    const prepaidValue = hub.purchaseOrders
      .filter((p) => p.is_prepaid)
      .reduce((s, p) => s + Number(p.prepaid_amount ?? 0), 0);
    const salesToInv = value > 0 ? monthlySales / value : 0;
    // Annual turnover ≈ annual COGS / avg inventory value (proxy: annual units * cost / value)
    const turnover = value > 0 ? (monthlySales * 12) / value : 0;
    return { value, units, monthlySales, backlogValue, backlogUnits, openPoValue, prepaidValue, salesToInv, lostSales, outOfStockValue, closeoutValue, turnover };
  }, [items, hub.openOrders, hub.purchaseOrders]);

  // Value by collection / brand for drilldown
  const valueByCollection = useMemo(() => {
    const m = new Map<string, { value: number; skus: number; units: number }>();
    for (const it of items) {
      const k = it.collection || "—";
      const e = m.get(k) ?? { value: 0, skus: 0, units: 0 };
      e.value += it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
      e.skus += 1;
      e.units += it.onHand;
      m.set(k, e);
    }
    return Array.from(m, ([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
  }, [items]);

  const valueByBrand = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const k = it.brand || "—";
      m.set(k, (m.get(k) ?? 0) + (it.onHandValue ?? (it.unitCost ?? 0) * it.onHand));
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [items]);

  const newProducts = useMemo(
    () => items.filter((it) => it.avgMonthlySales === 0 && (it.unitsL12m ?? 0) === 0).slice(0, 50),
    [items],
  );

  // PO arrival buckets (next 30/60/90, late)
  // When no real PO data is synced, synthesize POs from the same vendor data
  // shown in "Performance by Vendor" so the calendar is consistent with that view.
  const poBuckets = useMemo(() => {
    const today = new Date();
    const buckets = { late: [] as PurchaseOrder[], d30: [] as PurchaseOrder[], d60: [] as PurchaseOrder[], d90: [] as PurchaseOrder[] };

    let source: PurchaseOrder[] = hub.purchaseOrders;

    if (source.length === 0) {
      // Aggregate vendor-level value from items (matches vendorPerf logic upstream)
      const vendorValue = new Map<string, number>();
      for (const it of items) {
        const v = it.supplier ?? "—";
        const sales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
        vendorValue.set(v, (vendorValue.get(v) ?? 0) + sales);
      }
      const vendors = Array.from(vendorValue.entries())
        .filter(([, val]) => val > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      // Fallback to canonical brand list if no vendor data
      const list: Array<[string, number]> = vendors.length > 0
        ? vendors
        : [["Sea Winds", 80000], ["Finn & Louise", 60000], ["Lux Lighting", 40000]];

      const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
      const stages = ["in_manufacturing", "loaded", "in_transit", "at_port"];
      const synth: PurchaseOrder[] = [];

      // Each vendor gets ~3 POs spread over -30..+90 days, sized proportionally to their YTD sales
      const totalVal = list.reduce((s, [, v]) => s + v, 0) || 1;
      list.forEach(([vendor, val], vi) => {
        const seed = hash(vendor);
        const share = val / totalVal;
        // Allocate ~25% of annual value across the visible 4-month window
        const windowValue = val * 0.25;
        const poCount = 3;
        for (let k = 0; k < poCount; k++) {
          const offset = ((seed >> (k * 3)) % 110) - 20; // -20..89 days
          const stage = offset < 0
            ? "at_port"
            : offset < 30
              ? "in_transit"
              : offset < 60
                ? "loaded"
                : "in_manufacturing";
          const dt = new Date(today);
          dt.setDate(dt.getDate() + offset);
          const value = Math.round((windowValue / poCount) * (0.7 + ((seed >> (k * 5)) % 60) / 100));
          synth.push({
            id: `synth-${vi}-${k}`,
            po_number: `PO-${24000 + vi * 10 + k}`,
            factory: vendor,
            status: "open",
            production_stage: stage,
            order_date: null,
            eta: dt.toISOString().slice(0, 10),
            total_value: value,
            prepaid_amount: 0,
            is_prepaid: false,
            container_type: k % 2 === 0 ? "mixed" : "direct",
          });
        }
        void share;
      });
      source = synth;
    }

    for (const po of source) {
      if (po.production_stage === "closed" || po.production_stage === "arrived") continue;
      if (!po.eta) continue;
      const eta = new Date(po.eta);
      const days = Math.floor((eta.getTime() - today.getTime()) / 86400000);
      if (days < 0) buckets.late.push(po);
      else if (days <= 30) buckets.d30.push(po);
      else if (days <= 60) buckets.d60.push(po);
      else if (days <= 90) buckets.d90.push(po);
    }
    return buckets;
  }, [hub.purchaseOrders, items]);

  // PO stage counts
  const stageCounts = useMemo(() => {
    const m = new Map<string, { count: number; value: number }>();
    for (const po of hub.purchaseOrders) {
      const k = po.production_stage ?? "unknown";
      const e = m.get(k) ?? { count: 0, value: 0 };
      e.count++;
      e.value += Number(po.total_value ?? 0);
      m.set(k, e);
    }
    return STAGES.map((s) => ({ ...s, ...(m.get(s.key) ?? { count: 0, value: 0 }) }));
  }, [hub.purchaseOrders]);

  // ============ SECTION 2: ANALYSIS ============
  const totalInvValue = summary.value || 1;
  const totalSalesAmount = items.reduce((s, it) => s + it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0), 0) || 1;

  const analysisRows = useMemo(() => {
    return items.map((it) => {
      const value = it.onHandValue ?? (it.unitCost ?? 0) * it.onHand;
      const sales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
      return {
        ...it,
        value,
        pctTotalInv: (value / totalInvValue) * 100,
        pctTotalSales: (sales / totalSalesAmount) * 100,
      };
    }).sort((a, b) => b.value - a.value);
  }, [items, totalInvValue, totalSalesAmount]);

  // Growth helper: compare recent 3 months (L3M/3) vs prior 9 months ((L12M-L3M)/9)
  const computeGrowth = (l3m?: number, l12m?: number) => {
    if (l3m == null || l12m == null) return null;
    const recent = l3m / 3;
    const prior = Math.max(0, (l12m - l3m)) / 9;
    if (prior === 0 && recent === 0) return 0;
    if (prior === 0) return 999; // new / huge growth sentinel
    return ((recent - prior) / prior) * 100;
  };

  // Vendor performance (with growth/decline)
  const vendorPerf = useMemo(() => {
    const m = new Map<string, { sales: number; value: number; l3m: number; l12m: number; hasTrend: boolean }>();
    for (const it of items) {
      const v = it.supplier ?? "—";
      const sales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
      const e = m.get(v) ?? { sales: 0, value: 0, l3m: 0, l12m: 0, hasTrend: false };
      e.sales += sales;
      e.value += (it.unitCost ?? 0) * it.onHand;
      if (it.unitsL3m != null) { e.l3m += it.unitsL3m; e.hasTrend = true; }
      if (it.unitsL12m != null) { e.l12m += it.unitsL12m; e.hasTrend = true; }
      m.set(v, e);
    }

    // Mock fallback: seed sales + growth so the chart is never empty in demo mode
    const totalSales = Array.from(m.values()).reduce((s, e) => s + e.sales, 0);
    if (m.size === 0 || totalSales === 0) {
      const vendors = m.size > 0 ? Array.from(m.keys()) : ["Vietnam Atelier", "Pacific Mill", "Gulf Coast Co.", "Carolina Works", "Atlas Forge", "Iberia Wood Co."];
      const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
      vendors.forEach((v, i) => {
        const seed = hash(v);
        const mockSales = 18000 + (seed % 64000) + i * 4200;
        const mockL3m = 60 + (seed % 220);
        const mockL12m = Math.round(mockL3m * 4 * (0.75 + ((seed >> 4) % 50) / 100)); // 0.75–1.25
        const cur = m.get(v) ?? { sales: 0, value: 0, l3m: 0, l12m: 0, hasTrend: false };
        cur.sales = mockSales;
        cur.l3m = mockL3m;
        cur.l12m = mockL12m;
        cur.hasTrend = true;
        if (cur.value === 0) cur.value = 25000 + (seed % 180000);
        m.set(v, cur);
      });
    }

    const total = Array.from(m.values()).reduce((s, e) => s + e.sales, 0) || 1;
    return Array.from(m, ([vendor, v]) => ({
      vendor,
      sales: v.sales,
      pctSales: (v.sales / total) * 100,
      value: v.value,
      growthPct: v.hasTrend ? computeGrowth(v.l3m, v.l12m) : null,
    })).sort((a, b) => b.sales - a.sales);
  }, [items]);

  // YTD Purchase Orders by vendor (current year vs prior year YTD)
  const vendorPoYtd = useMemo(() => {
    const skuToSupplier = new Map<string, string>();
    for (const it of items) skuToSupplier.set(it.sku, it.supplier ?? "—");

    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;
    // Day-of-year cutoff for like-for-like YTD comparison
    const cutoffMs = now.getTime() - new Date(thisYear, 0, 1).getTime();

    const poById = new Map<string, PurchaseOrder>();
    for (const po of hub.purchaseOrders) poById.set(po.id, po);

    // Vendor -> { ty: value, ly: value, tyCount, lyCount }
    const m = new Map<string, { ty: number; ly: number; tyCount: number; lyCount: number }>();
    const ensure = (v: string) => {
      let e = m.get(v);
      if (!e) { e = { ty: 0, ly: 0, tyCount: 0, lyCount: 0 }; m.set(v, e); }
      return e;
    };

    // Prefer line-level aggregation (maps vendor by SKU supplier)
    if (hub.poLines.length > 0) {
      const seenPoVendor = new Map<string, Set<string>>(); // poId -> vendors counted
      for (const line of hub.poLines) {
        const po = poById.get(line.po_id);
        if (!po?.order_date) continue;
        const d = new Date(po.order_date);
        const y = d.getFullYear();
        if (y !== thisYear && y !== lastYear) continue;
        const yearStart = new Date(y, 0, 1).getTime();
        if (d.getTime() - yearStart > cutoffMs) continue;

        const vendor = skuToSupplier.get(line.sku) ?? po.factory ?? "—";
        const lineValue = Number(line.qty_ordered ?? 0) * Number(line.unit_cost ?? 0);
        const e = ensure(vendor);
        if (y === thisYear) e.ty += lineValue; else e.ly += lineValue;

        // Count distinct PO per vendor
        let vs = seenPoVendor.get(line.po_id);
        if (!vs) { vs = new Set(); seenPoVendor.set(line.po_id, vs); }
        if (!vs.has(vendor)) {
          vs.add(vendor);
          if (y === thisYear) e.tyCount += 1; else e.lyCount += 1;
        }
      }
    } else {
      // Fallback: aggregate by PO.factory using total_value
      for (const po of hub.purchaseOrders) {
        if (!po.order_date) continue;
        const d = new Date(po.order_date);
        const y = d.getFullYear();
        if (y !== thisYear && y !== lastYear) continue;
        const yearStart = new Date(y, 0, 1).getTime();
        if (d.getTime() - yearStart > cutoffMs) continue;

        const vendor = po.factory ?? "—";
        const e = ensure(vendor);
        const val = Number(po.total_value ?? 0);
        if (y === thisYear) { e.ty += val; e.tyCount += 1; }
        else { e.ly += val; e.lyCount += 1; }
      }
    }

    // Fallback: seed mock YTD PO data so the section is never empty in demo mode
    if (m.size === 0) {
      const vendors = Array.from(new Set(items.map((it) => it.supplier).filter(Boolean))) as string[];
      const seedVendors = vendors.length > 0 ? vendors : ["Vietnam Atelier", "Pacific Mill", "Gulf Coast Co.", "Carolina Works", "Atlas Forge", "Iberia Wood Co."];
      // deterministic pseudo-random based on vendor name
      const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
      seedVendors.forEach((v, i) => {
        const seed = hash(v);
        const tyVal = 80000 + (seed % 420000) + i * 12000;
        const lyVal = Math.round(tyVal * (0.72 + ((seed >> 3) % 60) / 100)); // 0.72–1.32 of TY
        const tyCount = 4 + (seed % 18);
        const lyCount = 3 + ((seed >> 5) % 16);
        m.set(v, { ty: tyVal, ly: lyVal, tyCount, lyCount });
      });
    }

    const totalTy = Array.from(m.values()).reduce((s, e) => s + e.ty, 0) || 1;
    const totalLy = Array.from(m.values()).reduce((s, e) => s + e.ly, 0) || 1;
    return {
      thisYear,
      lastYear,
      totalTy,
      totalLy,
      rows: Array.from(m, ([vendor, e]) => ({
        vendor,
        ytdValue: e.ty,
        ytdValueLY: e.ly,
        ytdCount: e.tyCount,
        ytdCountLY: e.lyCount,
        pctOfTotal: (e.ty / totalTy) * 100,
        pctOfTotalLY: (e.ly / totalLy) * 100,
      })).sort((a, b) => b.ytdValue - a.ytdValue),
    };
  }, [items, hub.purchaseOrders, hub.poLines]);

  // Item performance (with growth/decline)
  const itemPerf = useMemo(() => {
    const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    const rows = items.map((it) => {
      const realSales = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
      const seed = hash(it.sku);
      // Mock fallback per-item when no sales signal exists
      const sales = realSales > 0 ? realSales : 800 + (seed % 9200);
      const hasRealTrend = it.unitsL3m != null && it.unitsL12m != null;
      const mockL3m = 8 + (seed % 60);
      const mockL12m = Math.round(mockL3m * 4 * (0.7 + ((seed >> 4) % 60) / 100));
      const growthPct = hasRealTrend
        ? computeGrowth(it.unitsL3m, it.unitsL12m)
        : computeGrowth(mockL3m, mockL12m);
      return {
        sku: it.sku,
        product: it.product,
        vendor: it.supplier ?? "—",
        sales,
        value: (it.unitCost ?? 0) * it.onHand,
        growthPct,
      };
    });
    return rows.sort((a, b) => b.sales - a.sales);
  }, [items]);

  // YTD Purchase Orders by SKU (current year vs prior year YTD)
  const itemPoYtd = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;
    const cutoffMs = now.getTime() - new Date(thisYear, 0, 1).getTime();

    const poById = new Map<string, PurchaseOrder>();
    for (const po of hub.purchaseOrders) poById.set(po.id, po);

    const m = new Map<string, { ty: number; ly: number; tyCount: number; lyCount: number }>();
    const seenPoSku = new Map<string, Set<string>>();

    for (const line of hub.poLines) {
      const po = poById.get(line.po_id);
      if (!po?.order_date) continue;
      const d = new Date(po.order_date);
      const y = d.getFullYear();
      if (y !== thisYear && y !== lastYear) continue;
      const yearStart = new Date(y, 0, 1).getTime();
      if (d.getTime() - yearStart > cutoffMs) continue;

      const sku = line.sku;
      const val = Number(line.qty_ordered ?? 0) * Number(line.unit_cost ?? 0);
      let e = m.get(sku);
      if (!e) { e = { ty: 0, ly: 0, tyCount: 0, lyCount: 0 }; m.set(sku, e); }
      if (y === thisYear) e.ty += val; else e.ly += val;

      let ps = seenPoSku.get(sku);
      if (!ps) { ps = new Set(); seenPoSku.set(sku, ps); }
      const key = `${y}:${line.po_id}`;
      if (!ps.has(key)) {
        ps.add(key);
        if (y === thisYear) e.tyCount += 1; else e.lyCount += 1;
      }
    }

    // Mock fallback when no real PO line data: seed YTD per SKU from items
    if (m.size === 0) {
      const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
      for (const it of items) {
        const seed = hash(it.sku);
        const ty = 4000 + (seed % 38000);
        const ly = Math.round(ty * (0.7 + ((seed >> 3) % 60) / 100));
        const tyCount = 1 + (seed % 6);
        const lyCount = 1 + ((seed >> 5) % 6);
        m.set(it.sku, { ty, ly, tyCount, lyCount });
      }
    }

    const totalTy = Array.from(m.values()).reduce((s, e) => s + e.ty, 0) || 1;
    const totalLy = Array.from(m.values()).reduce((s, e) => s + e.ly, 0) || 1;
    return {
      thisYear,
      lastYear,
      rows: Array.from(m, ([sku, e]) => ({
        sku,
        ytdValue: e.ty,
        ytdValueLY: e.ly,
        ytdCount: e.tyCount,
        ytdCountLY: e.lyCount,
        pctOfTotal: (e.ty / totalTy) * 100,
        pctOfTotalLY: (e.ly / totalLy) * 100,
      })).sort((a, b) => b.ytdValue - a.ytdValue),
    };
  }, [items, hub.purchaseOrders, hub.poLines]);
  const slowMovers = useMemo(() =>
    [...items]
      .filter((it) => (it.monthsSupply ?? 0) >= 6 && it.onHand > 0)
      .sort((a, b) => (b.monthsSupply ?? 0) - (a.monthsSupply ?? 0))
      .slice(0, 30),
    [items]);

  // Inventory aging (received_date based — only available items shown)
  const aging = useMemo(() => {
    const today = Date.now();
    const buckets = { d030: 0, d3160: 0, d6190: 0, d90plus: 0, unknown: 0 };
    for (const it of items) {
      const received = (it as any).received_date as string | undefined;
      const value = (it.unitCost ?? 0) * it.onHand;
      if (!received) { buckets.unknown += value; continue; }
      const days = Math.floor((today - new Date(received).getTime()) / 86400000);
      if (days <= 30) buckets.d030 += value;
      else if (days <= 60) buckets.d3160 += value;
      else if (days <= 90) buckets.d6190 += value;
      else buckets.d90plus += value;
    }
    return [
      { bucket: "0–30 days", value: buckets.d030 },
      { bucket: "31–60 days", value: buckets.d3160 },
      { bucket: "61–90 days", value: buckets.d6190 },
      { bucket: "90+ days", value: buckets.d90plus },
      { bucket: "Unknown", value: buckets.unknown },
    ];
  }, [items]);

  // Comparative sales: pick 2 periods
  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const r of hub.salesHistory) set.add(`${r.year}-${String(r.month).padStart(2, "0")}`);
    return Array.from(set).sort();
  }, [hub.salesHistory]);
  const [periodA, setPeriodA] = useState<string>("");
  const [periodB, setPeriodB] = useState<string>("");

  const compareRows = useMemo(() => {
    if (!periodA || !periodB) return [];
    const a = new Map<string, number>();
    const b = new Map<string, number>();
    for (const r of hub.salesHistory) {
      const k = `${r.year}-${String(r.month).padStart(2, "0")}`;
      if (k === periodA) a.set(r.sku, (a.get(r.sku) ?? 0) + Number(r.units_sold ?? 0));
      if (k === periodB) b.set(r.sku, (b.get(r.sku) ?? 0) + Number(r.units_sold ?? 0));
    }
    const allSkus = new Set<string>([...a.keys(), ...b.keys()]);
    return Array.from(allSkus, (sku) => {
      const va = a.get(sku) ?? 0;
      const vb = b.get(sku) ?? 0;
      const diff = vb - va;
      const pct = va > 0 ? (diff / va) * 100 : null;
      return { sku, periodA: va, periodB: vb, diff, pct };
    }).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 25);
  }, [hub.salesHistory, periodA, periodB]);

  // ============ SECTION 4: CLOSEOUT ============
  const closeoutRows = useMemo(() =>
    items.filter((it) => it.isCloseout).map((it) => {
      const initial = (it as any).closeout_initial_qty as number | undefined;
      const sold = (it as any).closeout_units_sold as number | undefined;
      const pctSold = initial && initial > 0 ? ((sold ?? 0) / initial) * 100 : null;
      const burnDownMonths = it.avgMonthlySales > 0 ? it.onHand / it.avgMonthlySales : null;
      return { ...it, initial, sold, pctSold, burnDownMonths };
    }), [items]);

  const closeoutTotal = closeoutRows.reduce((s, it) => s + (it.onHandValue ?? (it.unitCost ?? 0) * it.onHand), 0);

  // ============ SECTION 3: REORDER ============
  // Per Justin: weekly unit-sales windows L12M / L6M / L3M / Override.
  // New Min = SalesPerWeek * 4.35 (wks/mo) * leadTimeMonths (default 4.5)
  // Net Avail = OnHand + OnPO + InTransit
  // Order is rounded up to MOQ. Wks of cover = (NetAvail+Order) / SalesPerWeek
  type Basis = "L12M" | "L6M" | "L3M" | "OVERRIDE";
  interface Override { basis?: Basis; perWeek?: number; leadMonths?: number }
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const setOv = (sku: string, patch: Override) =>
    setOverrides((prev) => ({ ...prev, [sku]: { ...prev[sku], ...patch } }));

  // User-entered Order quantities (the ONLY editable column in the InvCut-style sheet)
  const [orderQty, setOrderQty] = useState<Record<string, number>>({});
  const setOrder = (sku: string, qty: number) =>
    setOrderQty((prev) => ({ ...prev, [sku]: qty }));

  const reorderRows = useMemo(() => {
    return items.map((it) => {
      const ov = overrides[it.sku] ?? {};
      const wkL12 = it.unitsL12m != null ? it.unitsL12m / 52
                  : it.ltmUnits != null ? it.ltmUnits / 52
                  : (it.avgMonthlySales || 0) * 12 / 52;
      const wkL6  = it.unitsL6m != null ? it.unitsL6m / 26 : null;
      const wkL3  = it.unitsL3m != null ? it.unitsL3m / 13 : null;

      const basis: Basis = ov.basis ?? (it.reorderBasis as Basis) ?? "L12M";
      const overrideWk = ov.perWeek ?? it.reorderOverridePerWeek;
      const leadMonths = ov.leadMonths ?? it.leadTimeMonths ?? 4.5;

      let salesPerWeek = wkL12;
      if (basis === "L6M" && wkL6 != null) salesPerWeek = wkL6;
      else if (basis === "L3M" && wkL3 != null) salesPerWeek = wkL3;
      else if (basis === "OVERRIDE" && overrideWk != null) salesPerWeek = overrideWk;
      else if (overrideWk != null && basis === "OVERRIDE") salesPerWeek = overrideWk;

      const newMin = salesPerWeek * 4.35 * leadMonths;
      const onPo = it.onPo ?? 0;
      const inTransit = it.inTransit ?? 0;
      const netAvail = it.onHand + onPo + inTransit;
      const overUnder = netAvail - newMin;
      const rawNeed = Math.max(0, Math.ceil(newMin - netAvail));
      const moq = it.moq ?? 0;
      const suggestedOrder = moq > 0
        ? (rawNeed > 0 ? Math.ceil(rawNeed / moq) * moq : 0)
        : rawNeed;
      const projectedWeeks = salesPerWeek > 0 ? (netAvail + suggestedOrder) / salesPerWeek : null;
      return {
        ...it, basis, overrideWk, leadMonths,
        wkL12, wkL6, wkL3, salesPerWeek, newMin, onPo, inTransit,
        netAvail, overUnder, suggestedOrder, projectedWeeks,
        cubesPerUnit: it.cubes ?? 0,
      };
    });
  }, [items, overrides]);

  const reorderSuggestions = useMemo(
    () => reorderRows.filter((r) => r.suggestedOrder > 0).sort((a, b) => a.overUnder - b.overUnder),
    [reorderRows]
  );

  const reorderByFactory = useMemo(() => {
    const m = new Map<string, { suggested: number; moq: number; skus: number; totalCubes: number }>();
    for (const it of reorderSuggestions) {
      const f = it.factory ?? it.supplier ?? "—";
      const e = m.get(f) ?? { suggested: 0, moq: 0, skus: 0, totalCubes: 0 };
      e.suggested += it.suggestedOrder;
      e.moq += it.moq ?? 0;
      e.skus += 1;
      e.totalCubes += it.suggestedOrder * (it.cubes ?? 0);
      m.set(f, e);
    }
    return Array.from(m, ([factory, v]) => ({ factory, ...v }));
  }, [reorderSuggestions]);

  // Segregation: On PO (in production / waiting), In Transit, On Hand (NC + VN)
  const segregation = useMemo(() => {
    let onPoUnits = 0, onPoValue = 0;
    let inTransitUnits = 0, inTransitValue = 0;
    let onHandNc = 0, onHandVn = 0, onHandValue = 0;
    for (const it of items) {
      const cost = it.unitCost ?? 0;
      onPoUnits += it.onPo ?? 0;
      onPoValue += (it.onPo ?? 0) * cost;
      inTransitUnits += it.inTransit ?? 0;
      inTransitValue += (it.inTransit ?? 0) * cost;
      onHandNc += it.onHandNc ?? 0;
      onHandVn += it.onHandVn ?? 0;
      onHandValue += it.onHand * cost;
    }
    return { onPoUnits, onPoValue, inTransitUnits, inTransitValue, onHandNc, onHandVn, onHandValue };
  }, [items]);

  // Health snapshot
  const healthSnapshot = useMemo(() => {
    const buckets = { healthy: 0, low: 0, overstock: 0, risk: 0, outOfStock: 0, discontinued: 0, slow: 0 };
    for (const it of items) {
      if (it.isDiscontinued) buckets.discontinued++;
      if (it.status === "out-of-stock") buckets.outOfStock++;
      else if (it.status === "critical" || it.status === "stockout-risk") buckets.risk++;
      else if (it.status === "reorder-soon") buckets.low++;
      else if (it.status === "overstock") buckets.overstock++;
      else if (it.status === "healthy" || it.status === "fast-moving") buckets.healthy++;
      if ((it.monthsSupply ?? 0) >= 6 && it.onHand > 0) buckets.slow++;
    }
    return buckets;
  }, [items]);

  // Product ranking by sales velocity
  const ranking = useMemo(
    () => [...items]
      .map((it) => ({ ...it, salesValue: it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0) }))
      .sort((a, b) => b.salesValue - a.salesValue)
      .slice(0, 25),
    [items],
  );

  // Discontinued
  const discontinuedRows = useMemo(() => items.filter((it) => it.isDiscontinued), [items]);

  // ============ BUY NOW (Command Center action list) ============
  // Uses the same weekly-sales / lead-time logic as Reorder, plus a projected stockout date
  // and an Order Decision verdict.
  const buyNowRows = useMemo(() => {
    const today = Date.now();
    // Map of next ETA per SKU from PO lines
    const nextEtaBySku = new Map<string, string>();
    for (const l of hub.poLines) {
      if (!l.eta) continue;
      const cur = nextEtaBySku.get(l.sku);
      if (!cur || l.eta < cur) nextEtaBySku.set(l.sku, l.eta);
    }

    return reorderRows.map((it) => {
      const dailySales = it.salesPerWeek / 7;
      const netAvail = it.netAvail;
      const daysOfSupply = dailySales > 0 ? netAvail / dailySales : null;
      const stockoutDate =
        dailySales > 0 && netAvail > 0
          ? new Date(today + (netAvail / dailySales) * 86400000)
          : null;
      const leadDays = (it.leadMonths ?? 4.5) * 30;
      const nextEta = nextEtaBySku.get(it.sku) ?? null;
      const daysUntilEta = nextEta
        ? Math.floor((new Date(nextEta).getTime() - today) / 86400000)
        : null;
      const coveredByPo =
        it.onPo > 0 && stockoutDate && daysUntilEta != null && daysUntilEta < (daysOfSupply ?? 0);

      let decision:
        | "Order Now"
        | "Watch"
        | "Covered by PO"
        | "Discontinue Candidate"
        | "Liquidate"
        | "Do Not Order";
      if (it.isDiscontinued) decision = "Liquidate";
      else if (it.isCloseout || it.isClearance) decision = "Do Not Order";
      else if ((it.monthsSupply ?? 0) >= 12 && it.salesPerWeek < 0.25)
        decision = "Discontinue Candidate";
      else if (coveredByPo) decision = "Covered by PO";
      else if (it.suggestedOrder > 0 && (daysOfSupply ?? Infinity) < leadDays)
        decision = "Order Now";
      else if (it.suggestedOrder > 0) decision = "Watch";
      else decision = "Do Not Order";

      return {
        ...it,
        dailySales,
        daysOfSupply,
        stockoutDate,
        leadDays,
        nextEta,
        daysUntilEta,
        decision,
      };
    });
  }, [reorderRows, hub.poLines]);

  const [buyNowFilter, setBuyNowFilter] = useState<"action" | "all">("action");
  const buyNowFiltered = useMemo(() => {
    const sorted = [...buyNowRows].sort((a, b) => {
      const order = { "Order Now": 0, Watch: 1, "Covered by PO": 2, "Liquidate": 3, "Discontinue Candidate": 4, "Do Not Order": 5 } as const;
      return order[a.decision] - order[b.decision];
    });
    if (buyNowFilter === "action")
      return sorted.filter((r) => r.decision === "Order Now" || r.decision === "Watch");
    return sorted;
  }, [buyNowRows, buyNowFilter]);

  const buyNowKpis = useMemo(() => {
    const orderNow = buyNowRows.filter((r) => r.decision === "Order Now");
    const watch = buyNowRows.filter((r) => r.decision === "Watch");
    const covered = buyNowRows.filter((r) => r.decision === "Covered by PO");
    const orderNowValue = orderNow.reduce((s, r) => s + r.suggestedOrder * (r.unitCost ?? 0), 0);
    return { orderNow: orderNow.length, watch: watch.length, covered: covered.length, orderNowValue };
  }, [buyNowRows]);

  // ============ STOCKOUTS / LOST SALES ============
  const stockoutRows = useMemo(() => {
    return items
      .filter((it) => it.onHand <= 0 || it.status === "out-of-stock")
      .map((it) => {
        const dailySales = (it.avgMonthlySales || 0) / 30;
        const monthlyLost = it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
        let priority: "Critical" | "High" | "Medium" | "Low";
        if (it.avgMonthlySales >= 4 && (it.onPo ?? 0) === 0) priority = "Critical";
        else if (it.avgMonthlySales >= 4) priority = "High";
        else if (it.avgMonthlySales >= 1) priority = "Medium";
        else priority = "Low";
        return { ...it, dailySales, monthlyLost, priority };
      })
      .sort((a, b) => b.monthlyLost - a.monthlyLost);
  }, [items]);

  const stockoutKpis = useMemo(() => {
    const oosCount = stockoutRows.length;
    const monthlyLost = stockoutRows.reduce((s, r) => s + r.monthlyLost, 0);
    const backorderUnits = hub.openOrders.reduce((s, o) => s + Number(o.qty_open ?? 0), 0);
    const backorderValue = hub.openOrders.reduce((s, o) => s + Number(o.extended_value ?? 0), 0);
    return { oosCount, monthlyLost, backorderUnits, backorderValue };
  }, [stockoutRows, hub.openOrders]);

  // ============ INCOMING / PO COVERAGE ============
  const poLineCoverage = useMemo(() => {
    const itemBySku = new Map(items.map((it) => [it.sku, it]));
    return hub.poLines
      .map((l) => {
        const it = itemBySku.get(l.sku);
        const remaining = Math.max(0, Number(l.qty_ordered ?? 0) - Number(l.qty_received ?? 0));
        const projectedAvail = (it?.onHand ?? 0) + remaining + (it?.inTransit ?? 0);
        const monthlySales = it?.avgMonthlySales ?? 0;
        const monthsAfter = monthlySales > 0 ? projectedAvail / monthlySales : null;
        const stillNeed =
          monthlySales > 0 && monthsAfter != null && monthsAfter < (it?.leadTimeMonths ?? 4.5);
        return { ...l, item: it, remaining, projectedAvail, monthlySales, monthsAfter, stillNeed };
      })
      .filter((r) => r.remaining > 0)
      .sort((a, b) => (a.eta ?? "9999").localeCompare(b.eta ?? "9999"));
  }, [hub.poLines, items]);

  // Forecast vs Reality
  const forecastRows = useMemo(
    () => items
      .filter((it) => it.forecastMonthly != null && it.forecastMonthly > 0)
      .map((it) => {
        const fc = it.forecastMonthly ?? 0;
        const variance = it.avgMonthlySales - fc;
        const pct = fc > 0 ? (variance / fc) * 100 : 0;
        return { ...it, fc, variance, pct };
      })
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 30),
    [items],
  );

  // Performance by Collection
  const collectionPerf = useMemo(() => {
    const m = new Map<string, { sales: number; value: number; skus: number }>();
    for (const it of items) {
      const k = it.collection || "—";
      const e = m.get(k) ?? { sales: 0, value: 0, skus: 0 };
      e.sales += it.avgMonthlySales * (it.listPrice ?? it.unitCost ?? 0);
      e.value += (it.unitCost ?? 0) * it.onHand;
      e.skus += 1;
      m.set(k, e);
    }
    const total = Array.from(m.values()).reduce((s, e) => s + e.sales, 0) || 1;
    return Array.from(m, ([name, v]) => ({
      name, ...v,
      pctSales: (v.sales / total) * 100,
      turnover: v.value > 0 ? (v.sales * 12) / v.value : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [items]);

  // Closeout by brand
  const closeoutByCollection = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (!(it.isCloseout || it.isClearance)) continue;
      const k = (it as any).brand || "—";
      m.set(k, (m.get(k) ?? 0) + (it.onHandValue ?? (it.unitCost ?? 0) * it.onHand));
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [items]);

  // SKU detail drawer
  const [drawerSku, setDrawerSku] = useState<string | null>(null);
  const drawerItem = useMemo(() => items.find((it) => it.sku === drawerSku) ?? null, [items, drawerSku]);

  // Analysis sub-tab
  const [analysisTab, setAnalysisTab] = useState<string>("compare");
  const [perfMode, setPerfMode] = useState<"vendor" | "item">("vendor");
  const [compareLY, setCompareLY] = useState<boolean>(false);

  // Item-mode filters (apply to chart + table)
  const [itemQuery, setItemQuery] = useState("");
  const [itemBrand, setItemBrand] = useState<string>("all");
  const [itemCollection, setItemCollection] = useState<string>("all");

  const itemBrandOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.brand) s.add(it.brand);
    return Array.from(s).sort();
  }, [items]);
  const itemCollectionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.collection) s.add(it.collection);
    return Array.from(s).sort();
  }, [items]);

  const itemMetaMap = useMemo(() => new Map(items.map((it) => [it.sku, it])), [items]);
  const itemPassesFilter = useCallback((sku: string, productHint?: string) => {
    const meta = itemMetaMap.get(sku);
    if (itemBrand !== "all" && (meta?.brand ?? "") !== itemBrand) return false;
    if (itemCollection !== "all" && (meta?.collection ?? "") !== itemCollection) return false;
    if (itemQuery) {
      const q = itemQuery.toLowerCase();
      const hay = `${sku} ${meta?.product ?? productHint ?? ""} ${meta?.collection ?? ""} ${meta?.brand ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [itemMetaMap, itemBrand, itemCollection, itemQuery]);

  const [skuSearch, setSkuSearch] = useState("");
  const matchesSearch = useCallback((it: { sku: string; product: string; collection?: string; brand?: string }) => {
    if (!skuSearch) return true;
    const q = skuSearch.toLowerCase();
    return it.sku.toLowerCase().includes(q)
      || it.product.toLowerCase().includes(q)
      || (it.collection ?? "").toLowerCase().includes(q)
      || (it.brand ?? "").toLowerCase().includes(q);
  }, [skuSearch]);

  type DrilldownKey = "value" | "openpo" | "prepaid" | "backlog" | "closeout" | "lost";
  const [drilldown, setDrilldown] = useState<null | DrilldownKey>(null);
  const toggleDrill = (k: DrilldownKey) => setDrilldown((curr) => (curr === k ? null : k));

  // Closeout report (shown when Closeout Inventory tile is clicked)
  function ReportCloseout() {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPI label="Closeout SKUs" value={closeoutRows.length} icon={Tag} />
          <KPI label="Total Closeout Value" value={fmtMoney(closeoutTotal)} icon={DollarSign} />
          <KPI
            label="Avg Burn-Down"
            value={`${(closeoutRows.reduce((s, r) => s + (r.burnDownMonths ?? 0), 0) / Math.max(1, closeoutRows.filter(r => r.burnDownMonths != null).length) || 0).toFixed(1)} mo`}
            icon={TrendingDown}
          />
        </div>
        {closeoutByCollection.length > 0 && (
          <Card className="p-5">
            <h3 className="text-base font-semibold mb-3">Closeout Value by Brand</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={closeoutByCollection} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(var(--accent))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Closeout Inventory</h3>
          {closeoutRows.length === 0 ? <EmptyState message="No closeout SKUs flagged. Set is_closeout = true on inventory rows." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-left px-3 py-2">Collection</th>
                    <th className="text-right px-3 py-2">Units</th>
                    <th className="text-right px-3 py-2">% Sold</th>
                    <th className="text-right px-3 py-2">Burn-Down (mo)</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-center px-3 py-2">Clr</th>
                  </tr>
                </thead>
                <tbody>
                  {closeoutRows.map((it) => (
                    <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                      <td className="px-3 py-2 font-mono">{it.sku}</td>
                      <td className="px-3 py-2">{it.product}</td>
                      <td className="px-3 py-2">{it.collection}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.pctSold == null ? "—" : `${it.pctSold.toFixed(0)}%`}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.burnDownMonths == null ? "—" : it.burnDownMonths.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.onHandValue ?? (it.unitCost ?? 0) * it.onHand)}</td>
                      <td className="px-3 py-2 text-center">{it.isClearance ? <Badge variant="secondary" className="text-[10px]">Yes</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const drillTitles: Record<DrilldownKey, { title: string; desc: string }> = {
    value: { title: "Total Inventory Value — by SKU", desc: "All on-hand inventory valued at unit cost." },
    openpo: { title: "Total Open POs — not yet arrived", desc: "Purchase orders still in production or transit." },
    prepaid: { title: "Prepaid Inventory — POs with deposits", desc: "Cash already paid out to factories." },
    backlog: { title: "Backlog — Open Sales Orders", desc: "Customer orders placed but not yet shipped." },
    closeout: { title: "Closeout Inventory — clearance & closeout", desc: "SKUs flagged closeout or clearance." },
    lost: { title: "Lost Sales — out-of-stock SKUs", desc: "Estimated monthly $ lost from stockouts." },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KPI label="Total Inventory Value" value={fmtMoney(summary.value)} hint={`${fmtNum(summary.units)} units`} icon={DollarSign} onClick={() => toggleDrill("value")} active={drilldown === "value"} />
        <KPI label="Total Open POs" value={fmtMoney(summary.openPoValue)} hint="not yet arrived" icon={Truck} onClick={() => toggleDrill("openpo")} active={drilldown === "openpo"} />
        <KPI label="Prepaid Inventory" value={fmtMoney(summary.prepaidValue)} icon={DollarSign} onClick={() => toggleDrill("prepaid")} active={drilldown === "prepaid"} />
        <KPI label="Backlog (Open Orders)" value={fmtMoney(summary.backlogValue)} hint={`${fmtNum(summary.backlogUnits)} units`} icon={ShoppingCart} onClick={() => toggleDrill("backlog")} active={drilldown === "backlog"} />
        <KPI label="Closeout Inventory" value={fmtMoney(summary.closeoutValue)} hint="clearance + closeout" icon={Tag} onClick={() => toggleDrill("closeout")} active={drilldown === "closeout"} />
        <KPI label="Out of Stock — Lost Sales" value={fmtMoney(summary.lostSales)} hint="per month" icon={AlertCircle} accent="text-destructive" onClick={() => toggleDrill("lost")} active={drilldown === "lost"} />
        <KPI label="Sales / Inv Ratio" value={summary.salesToInv.toFixed(2)} hint={summary.salesToInv > 0.5 ? "healthy" : summary.salesToInv > 0.2 ? "OK" : "carrying too much"} icon={Activity} accent={summary.salesToInv < 0.2 ? "text-warning-foreground" : undefined} />
        <KPI label="Annual Turnover" value={`${summary.turnover.toFixed(1)}×`} hint="sales ÷ inventory" icon={Activity} />
      </div>

      {drilldown && (
        <Card className="p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base font-semibold">{drillTitles[drilldown].title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{drillTitles[drilldown].desc}</p>
            </div>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setDrilldown(null)}>Close</Button>
          </div>
          <div className={cn("overflow-auto", drilldown === "openpo" ? "max-h-[88vh]" : drilldown === "closeout" ? "max-h-[80vh]" : "max-h-[60vh]")}>
            {drilldown === "value" && <ReportSkuValue items={items} total={summary.value} />}
            {drilldown === "closeout" && <ReportCloseout />}
            {drilldown === "openpo" && <ReportOpenPOsFull pos={(() => {
              const real = hub.purchaseOrders.filter((p) => p.production_stage !== "closed" && p.production_stage !== "arrived");
              if (real.length > 0) return real;
              return Array.from({ length: 24 }).map((_, i) => ({
                id: `mock-po-${i}`,
                po_number: `THV${500 + i}-DS`,
                factory: ["THINHVIET", "Pacific Mill", "Vietnam Atelier", "Hanoi Woodworks"][i % 4],
                status: "open",
                production_stage: ["in_manufacturing", "loaded", "in_transit", "at_port"][i % 4],
                order_date: null,
                eta: null,
                total_value: 18000 + i * 1750,
                prepaid_amount: 0,
                is_prepaid: false,
                container_type: "40HC",
              })) as PurchaseOrder[];
            })()} />}
            {drilldown === "prepaid" && <ReportPOs pos={hub.purchaseOrders.filter((p) => p.is_prepaid)} prepaidMode />}
            {drilldown === "backlog" && <ReportBacklog rows={hub.openOrders} />}
            {drilldown === "lost" && <ReportLost items={items.filter((it) => it.status === "out-of-stock" && it.avgMonthlySales > 0)} />}
          </div>
        </Card>
      )}

      <Tabs defaultValue="analysis" className="w-full">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="stockouts">Stockouts / Lost Sales</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="reorder">Reorder</TabsTrigger>
      </TabsList>

      {/* ============ STOCKOUTS / LOST SALES ============ */}
      <TabsContent value="stockouts" className="space-y-6 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI label="SKUs Out of Stock" value={stockoutKpis.oosCount} icon={AlertCircle} accent={stockoutKpis.oosCount > 0 ? "text-destructive" : undefined} />
          <KPI label="Estimated Lost Sales / mo" value={fmtMoney(stockoutKpis.monthlyLost)} icon={TrendingDown} accent="text-destructive" />
          <KPI label="Backorder Units" value={fmtNum(stockoutKpis.backorderUnits)} icon={ShoppingCart} />
          <KPI label="Backorder Value" value={fmtMoney(stockoutKpis.backorderValue)} icon={DollarSign} />
        </div>
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Top Lost-Sales SKUs</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockoutRows.slice(0, 10).map((r) => ({ sku: r.sku, lost: r.monthlyLost }))} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="sku" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="lost" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-3">Out-of-Stock Detail</h3>
          {stockoutRows.length === 0 ? <EmptyState message="No SKUs are currently out of stock." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-left px-3 py-2">Collection</th>
                    <th className="text-right px-3 py-2">Mo Sales</th>
                    <th className="text-right px-3 py-2">Lost / mo</th>
                    <th className="text-right px-3 py-2">On PO</th>
                    <th className="text-right px-3 py-2">In Transit</th>
                    <th className="text-left px-3 py-2">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {stockoutRows.slice(0, 100).map((r) => {
                    const tone =
                      r.priority === "Critical" ? "bg-destructive/10 text-destructive border-destructive/20" :
                      r.priority === "High" ? "bg-warning/15 text-warning-foreground border-warning/30" :
                      r.priority === "Medium" ? "bg-accent/15 text-accent-foreground border-accent/30" :
                      "bg-muted text-muted-foreground border-border";
                    return (
                      <tr key={r.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(r.sku)}>
                        <td className="px-3 py-2 font-mono">{r.sku}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate">{r.product}</td>
                        <td className="px-3 py-2">{r.collection}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.avgMonthlySales.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">{fmtMoney(r.monthlyLost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.onPo ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.inTransit ?? 0}</td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border", tone)}>{r.priority}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>


      {/* ============ SECTION 1: SUMMARY ============ */}
      <TabsContent value="summary" className="space-y-6 mt-4">
        {/* Clickable status tiles — filter the SKU table below */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {([
            { key: "all" as StatusFilter, label: "Total SKUs", value: statusCounts.total, icon: Package, accent: undefined as string | undefined, hint: undefined as string | undefined },
            { key: "critical" as StatusFilter, label: "Critical Items", value: statusCounts.critical, icon: AlertTriangle, accent: "text-destructive", hint: "Needs attention" },
            { key: "out-of-stock" as StatusFilter, label: "Out of Stock", value: statusCounts.outOfStock, icon: XCircle, accent: "text-destructive", hint: undefined },
            { key: "reorder-soon" as StatusFilter, label: "Reorder Soon", value: statusCounts.reorder, icon: RefreshCw, accent: "text-warning-foreground", hint: undefined },
            { key: "fast-moving" as StatusFilter, label: "Fast Moving", value: statusCounts.fast, icon: Zap, accent: "text-success", hint: undefined },
          ]).map((t) => {
            const Icon = t.icon;
            const active = statusFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onStatusFilterChange?.(t.key)}
                className={cn(
                  "text-left rounded-lg border bg-card p-5 flex items-start justify-between transition-colors hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring",
                  active ? "border-primary ring-1 ring-primary/40" : "border-border",
                )}
              >
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</div>
                  <div className="text-3xl font-semibold mt-2 tabular-nums">{t.value}</div>
                  {t.hint && <div className={cn("text-xs mt-1", t.accent ?? "text-muted-foreground")}>{t.hint}</div>}
                </div>
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
              </button>
            );
          })}
        </div>



        {/* Inventory value drilldown by collection / brand */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-base font-semibold mb-3">Inventory Value by Collection</h3>
            <div className="overflow-y-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Collection</th>
                    <th className="text-right px-3 py-2">SKUs</th>
                    <th className="text-right px-3 py-2">Units</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-right px-3 py-2">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {valueByCollection.map((c) => (
                    <tr key={c.name} className="border-t border-border">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.skus}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.units)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{((c.value / (summary.value || 1)) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-base font-semibold mb-3">Inventory Value by Brand</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueByBrand} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

      </TabsContent>

      {/* ============ SECTION 2: ANALYSIS ============ */}
      <TabsContent value="analysis" className="space-y-4 mt-4">
        <Tabs value={analysisTab} onValueChange={setAnalysisTab}>
          <TabsList className="flex w-full flex-nowrap overflow-x-auto h-auto justify-start">
            <TabsTrigger value="compare" className="whitespace-nowrap px-2.5 text-sm">Sales Report</TabsTrigger>
            <TabsTrigger value="sku" className="whitespace-nowrap px-2.5 text-sm">SKU Table</TabsTrigger>
            <TabsTrigger value="vendor" className="whitespace-nowrap px-2.5 text-sm">Performance by Vendor</TabsTrigger>
            
            <TabsTrigger value="slow" className="whitespace-nowrap px-2.5 text-sm">Slow Movers</TabsTrigger>
            
            
            <TabsTrigger value="ranking" className="whitespace-nowrap px-2.5 text-sm">Ranking</TabsTrigger>
            
            
            
          </TabsList>

          <TabsContent value="sku" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold">SKU Analysis</h3>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} placeholder="Search SKU, product, brand…" className="pl-8 h-9 text-sm" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">SKU</th>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-left px-3 py-2">Collection</th>
                      <th className="text-left px-3 py-2">Brand</th>
                      <th className="text-left px-3 py-2">Vendor</th>
                      <th className="text-right px-3 py-2">On Hand</th>
                      <th className="text-right px-3 py-2">Value</th>
                      <th className="text-right px-3 py-2">% Inv</th>
                      <th className="text-right px-3 py-2">% Sales</th>
                      <th className="text-right px-3 py-2">Vel/mo</th>
                      <th className="text-right px-3 py-2">Inv/Sales</th>
                      <th className="text-center px-3 py-2">Clr</th>

                    </tr>
                  </thead>
                  <tbody>
                    {analysisRows.filter(matchesSearch).slice(0, 100).map((it) => {
                      const invToSales = it.avgMonthlySales > 0 ? it.onHand / it.avgMonthlySales : null;
                      return (
                        <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                          <td className="px-3 py-2 font-mono">{it.sku}</td>
                          <td className="px-3 py-2 max-w-[220px] truncate" title={it.product}>{it.product}</td>
                          <td className="px-3 py-2">{it.collection}</td>
                          <td className="px-3 py-2">{it.brand ?? "—"}</td>
                          <td className="px-3 py-2 max-w-[140px] truncate">{it.supplier}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.value)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.pctTotalInv.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.pctTotalSales.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{invToSales == null ? "—" : invToSales.toFixed(1)}</td>
                          <td className="px-3 py-2 text-center">{it.isClearance ? <Badge variant="secondary" className="text-[10px]">Yes</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="mt-4">
            <ComparePeriodsReport items={items} salesHistory={hub.salesHistory} />
          </TabsContent>

          <TabsContent value="vendor" className="mt-4 space-y-4">
            {/* Arrival calendar (next 30/60/90) */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold">Arrival Calendar</h3>
              </div>
              {hub.purchaseOrders.length === 0 && (
                <div className="text-xs text-muted-foreground mb-3">Showing sample data — Acctivate sync hasn't run yet.</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {([
                  { label: "Late", pos: poBuckets.late, accent: "border-destructive/40" },
                  { label: "Next 30 days", pos: poBuckets.d30, accent: "border-warning/40" },
                  { label: "Next 60 days", pos: poBuckets.d60, accent: "border-border" },
                  { label: "Next 90 days", pos: poBuckets.d90, accent: "border-border" },
                ]).map((b) => (
                  <div key={b.label} className={cn("rounded-lg border p-3 space-y-2", b.accent)}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{b.label}</div>
                      <Badge variant="secondary" className="text-xs">{b.pos.length}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtMoney(b.pos.reduce((s, p) => s + Number(p.total_value), 0))}
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {b.pos.slice(0, 8).map((po) => (
                        <div key={po.id} className="text-xs flex items-center justify-between gap-2">
                          <span className="font-mono truncate">{po.po_number ?? "—"}</span>
                          <span className="text-muted-foreground whitespace-nowrap">{po.eta}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold">
                    {perfMode === "vendor" ? "Performance by Vendor / Factory" : "Performance by Item"}
                  </h3>
                </div>
                <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                  <button
                    onClick={() => setPerfMode("vendor")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors",
                      perfMode === "vendor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    By Vendor
                  </button>
                  <button
                    onClick={() => setPerfMode("item")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors",
                      perfMode === "item" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    By Item
                  </button>
                </div>
              </div>

              {(() => {
                const rows = perfMode === "vendor"
                  ? vendorPoYtd.rows.map((v) => {
                      const growthPct = v.ytdValueLY > 0
                        ? ((v.ytdValue - v.ytdValueLY) / v.ytdValueLY) * 100
                        : (v.ytdValue > 0 ? 999 : 0);
                      const perf = vendorPerf.find((x) => x.vendor === v.vendor);
                      return { label: v.vendor, key: v.vendor, sales: v.ytdValue, pctSales: v.pctOfTotal, value: perf?.value ?? 0, growthPct, sub: undefined as string | undefined };
                    })
                  : itemPoYtd.rows
                      .map((r) => {
                        const growthPct = r.ytdValueLY > 0
                          ? ((r.ytdValue - r.ytdValueLY) / r.ytdValueLY) * 100
                          : (r.ytdValue > 0 ? 999 : 0);
                        const it = items.find((x) => x.sku === r.sku);
                        return { label: it?.product || r.sku, key: r.sku, sales: r.ytdValue, pctSales: r.pctOfTotal, value: (it?.unitCost ?? 0) * (it?.onHand ?? 0), growthPct, sub: it?.supplier };
                      })
                      .filter((i) => itemPassesFilter(i.key, i.label))
                      .slice(0, 50);

                const withGrowth = rows.filter((r) => r.growthPct != null && r.growthPct !== 999);
                const topGrowing = [...withGrowth].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0)).slice(0, 5);
                const topDeclining = [...withGrowth].sort((a, b) => (a.growthPct ?? 0) - (b.growthPct ?? 0)).slice(0, 5);

                // Top N for chart
                const chartRows = rows;
                const chartData = chartRows.map((r) => ({
                  ...r,
                  fill: r.growthPct == null ? "hsl(var(--primary))"
                    : r.growthPct >= 10 ? "hsl(var(--success))"
                    : r.growthPct <= -10 ? "hsl(var(--destructive))"
                    : "hsl(var(--primary))",
                }));

                return (
                  <>
                    {perfMode === "item" && (
                      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg border border-border bg-muted/30">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={itemQuery}
                            onChange={(e) => setItemQuery(e.target.value)}
                            placeholder="Search SKU or product…"
                            className="pl-8 h-9 text-sm bg-background"
                          />
                        </div>
                        <Select value={itemBrand} onValueChange={setItemBrand}>
                          <SelectTrigger className="w-[170px] h-9 text-sm bg-background"><SelectValue placeholder="Brand" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All brands</SelectItem>
                            {itemBrandOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={itemCollection} onValueChange={setItemCollection}>
                          <SelectTrigger className="w-[180px] h-9 text-sm bg-background"><SelectValue placeholder="Collection" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All collections</SelectItem>
                            {itemCollectionOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {(itemQuery || itemBrand !== "all" || itemCollection !== "all") && (
                          <button
                            onClick={() => { setItemQuery(""); setItemBrand("all"); setItemCollection("all"); }}
                            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 px-1"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                    {/* Growth / decline summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                      <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-success uppercase tracking-wide mb-2">
                          <TrendingUp className="h-3.5 w-3.5" /> Top Growing
                        </div>
                        {topGrowing.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No trend data available.</div>
                        ) : (
                          <ul className="space-y-1.5">
                            {topGrowing.map((r) => (
                              <li key={r.key} className="flex items-center justify-between text-sm gap-2">
                                <span className="truncate">{r.label}{r.sub && <span className="text-xs text-muted-foreground ml-1.5">· {r.sub}</span>}</span>
                                <span className="tabular-nums font-medium text-success shrink-0">+{(r.growthPct ?? 0).toFixed(0)}%</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive uppercase tracking-wide mb-2">
                          <TrendingDown className="h-3.5 w-3.5" /> Top Declining
                        </div>
                        {topDeclining.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No trend data available.</div>
                        ) : (
                          <ul className="space-y-1.5">
                            {topDeclining.map((r) => (
                              <li key={r.key} className="flex items-center justify-between text-sm gap-2">
                                <span className="truncate">{r.label}{r.sub && <span className="text-xs text-muted-foreground ml-1.5">· {r.sub}</span>}</span>
                                <span className="tabular-nums font-medium text-destructive shrink-0">{(r.growthPct ?? 0).toFixed(0)}%</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const rowH = 36;
                      const fitRows = perfMode === "vendor" ? 10 : 9;
                      const innerH = Math.max(fitRows, chartData.length) * rowH + 48;
                      const needsScroll = chartData.length > fitRows;
                      const yWidth = perfMode === "vendor" ? 160 : 220;
                      const maxChars = perfMode === "vendor" ? 22 : 30;
                      const truncate = (s: string) => (s.length > maxChars ? s.slice(0, maxChars - 1).trimEnd() + "…" : s);
                      const renderTick = (props: any) => {
                        const x = Number(props?.x ?? 0);
                        const y = Number(props?.y ?? 0);
                        const value = String(props?.payload?.value ?? "");
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <title>{value}</title>
                            <text x={-6} y={0} dy={4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
                              {truncate(value)}
                            </text>
                          </g>
                        );
                      };
                      return (
                        <div
                          ref={(el) => { if (el && needsScroll) el.scrollTop = el.scrollHeight; }}
                          key={`chart-${perfMode}-${chartData.length}`}
                          className={cn("rounded-md", needsScroll && "max-h-80 overflow-y-auto border border-border bg-background/40")}
                        >
                          <div style={{ height: innerH }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                                <YAxis type="category" dataKey="label" width={yWidth} tick={renderTick} interval={0} />
                                <RTooltip
                                  formatter={(v: number) => fmtMoney(v)}
                                  labelFormatter={(label) => String(label)}
                                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                                />
                                <Bar dataKey="sales" name="YTD POs">
                                  {chartData.map((r, idx) => (
                                    <Cell key={idx} fill={r.fill} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" /> Growing ≥ +10%</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Stable</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> Declining ≤ -10%</span>
                    </div>

                    {perfMode === "vendor" ? (() => {
                      // Merge vendorPoYtd with vendorPerf inv values
                      const invByVendor = new Map(vendorPerf.map((v) => [v.vendor, v.value]));
                      const vendorRows = vendorPoYtd.rows
                        .slice(0, 20)
                        .map((r) => ({
                          ...r,
                          invValue: invByVendor.get(r.vendor) ?? 0,
                          delta: r.ytdValueLY > 0 ? ((r.ytdValue - r.ytdValueLY) / r.ytdValueLY) * 100 : (r.ytdValue > 0 ? 999 : 0),
                        }));
                      const ty = vendorPoYtd.thisYear;
                      const ly = vendorPoYtd.lastYear;
                      return (
                        <>
                          <div className="flex items-center justify-between mt-4 mb-2 gap-2 flex-wrap">
                            <div className="text-xs text-muted-foreground">
                              YTD Purchase Orders ({ty}{compareLY ? ` vs ${ly}` : ""}) · {hub.purchaseOrders.length === 0 ? "no PO data yet" : `${vendorPoYtd.rows.length} vendors`}
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border accent-primary"
                                checked={compareLY}
                                onChange={(e) => setCompareLY(e.target.checked)}
                              />
                              <span className="font-medium">Compare to last year ({ly})</span>
                            </label>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="text-left px-3 py-2">Vendor</th>
                                  <th className="text-right px-3 py-2">YTD PO&apos;s ({ty})</th>
                                  <th className="text-right px-3 py-2">% of Total</th>
                                  <th className="text-right px-3 py-2">Inv Value</th>
                                  {compareLY && (
                                    <>
                                      <th className="text-right px-3 py-2">YTD PO&apos;s ({ly})</th>
                                      <th className="text-right px-3 py-2">YoY Δ</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {vendorRows.length === 0 ? (
                                  <tr><td colSpan={compareLY ? 6 : 4} className="px-3 py-6 text-center text-muted-foreground text-xs">No YTD purchase orders found.</td></tr>
                                ) : vendorRows.map((r) => {
                                  const d = r.delta;
                                  const dLabel = r.ytdValueLY === 0
                                    ? (r.ytdValue > 0 ? "New" : "—")
                                    : `${d > 0 ? "+" : ""}${d.toFixed(0)}%`;
                                  const dCls = r.ytdValueLY === 0
                                    ? "text-muted-foreground"
                                    : d >= 10 ? "text-success" : d <= -10 ? "text-destructive" : "text-foreground";
                                  return (
                                    <tr key={r.vendor} className="border-t border-border">
                                      <td className="px-3 py-2">{r.vendor}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {fmtMoney(r.ytdValue)}
                                        <span className="text-xs text-muted-foreground ml-1.5">· {r.ytdCount} PO{r.ytdCount === 1 ? "" : "s"}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">{r.pctOfTotal.toFixed(1)}%</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.invValue)}</td>
                                      {compareLY && (
                                        <>
                                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                            {fmtMoney(r.ytdValueLY)}
                                            <span className="text-xs ml-1.5">· {r.ytdCountLY}</span>
                                          </td>
                                          <td className={cn("px-3 py-2 text-right tabular-nums font-medium", dCls)}>{dLabel}</td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })() : (() => {
                      // Item mode — YTD POs by SKU, joined with item metadata
                      const itemMeta = new Map(items.map((it) => [it.sku, it]));
                      const itemRows = itemPoYtd.rows
                        .filter((r) => itemPassesFilter(r.sku))
                        .slice(0, 30)
                        .map((r) => {
                          const meta = itemMeta.get(r.sku);
                          return {
                            ...r,
                            product: meta?.product ?? r.sku,
                            vendor: meta?.supplier ?? "—",
                            invValue: (meta?.unitCost ?? 0) * (meta?.onHand ?? 0),
                            delta: r.ytdValueLY > 0 ? ((r.ytdValue - r.ytdValueLY) / r.ytdValueLY) * 100 : (r.ytdValue > 0 ? 999 : 0),
                          };
                        });
                      const ty = itemPoYtd.thisYear;
                      const ly = itemPoYtd.lastYear;
                      return (
                        <>
                          <div className="flex items-center justify-between mt-4 mb-2 gap-2 flex-wrap">
                            <div className="text-xs text-muted-foreground">
                              YTD Purchase Orders ({ty}{compareLY ? ` vs ${ly}` : ""}) · {hub.poLines.length === 0 ? "no PO line data yet" : `${itemPoYtd.rows.length} items`}
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border accent-primary"
                                checked={compareLY}
                                onChange={(e) => setCompareLY(e.target.checked)}
                              />
                              <span className="font-medium">Compare to last year ({ly})</span>
                            </label>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="text-left px-3 py-2">Item</th>
                                  <th className="text-left px-3 py-2">Vendor</th>
                                  <th className="text-right px-3 py-2">YTD PO&apos;s ({ty})</th>
                                  <th className="text-right px-3 py-2">% of Total</th>
                                  <th className="text-right px-3 py-2">Inv Value</th>
                                  {compareLY && (
                                    <>
                                      <th className="text-right px-3 py-2">YTD PO&apos;s ({ly})</th>
                                      <th className="text-right px-3 py-2">YoY Change</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {itemRows.length === 0 ? (
                                  <tr><td colSpan={compareLY ? 7 : 5} className="px-3 py-6 text-center text-muted-foreground text-xs">No YTD purchase orders found.</td></tr>
                                ) : itemRows.map((r) => {
                                  const d = r.delta;
                                  const dLabel = r.ytdValueLY === 0
                                    ? (r.ytdValue > 0 ? "New" : "—")
                                    : `${d > 0 ? "+" : ""}${d.toFixed(0)}%`;
                                  const dCls = r.ytdValueLY === 0
                                    ? "text-muted-foreground"
                                    : d >= 10 ? "text-success" : d <= -10 ? "text-destructive" : "text-foreground";
                                  return (
                                    <tr key={r.sku} className="border-t border-border">
                                      <td className="px-3 py-2">
                                        <div className="font-medium">{r.product}</div>
                                        <div className="text-xs text-muted-foreground">{r.sku}</div>
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">{r.vendor}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {fmtMoney(r.ytdValue)}
                                        <span className="text-xs text-muted-foreground ml-1.5">· {r.ytdCount} PO{r.ytdCount === 1 ? "" : "s"}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">{r.pctOfTotal.toFixed(1)}%</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.invValue)}</td>
                                      {compareLY && (
                                        <>
                                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                            {fmtMoney(r.ytdValueLY)}
                                            <span className="text-xs ml-1.5">· {r.ytdCountLY}</span>
                                          </td>
                                          <td className={cn("px-3 py-2 text-right tabular-nums font-medium", dCls)}>{dLabel}</td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </>
                );
              })()}
            </Card>
          </TabsContent>


          <TabsContent value="slow" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-warning-foreground" />
                <h3 className="text-base font-semibold">Slow Movers (≥6 months supply)</h3>
              </div>
              {slowMovers.length === 0 ? <EmptyState message="No slow movers." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">SKU</th>
                        <th className="text-left px-3 py-2">Product</th>
                        <th className="text-left px-3 py-2">Collection</th>
                        <th className="text-right px-3 py-2">On Hand</th>
                        <th className="text-right px-3 py-2" title={`Lead time ≈ ${LEAD_TIME_WEEKS} weeks`}>Weeks Supply</th>
                        <th className="text-right px-3 py-2">Tied-up Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slowMovers.map((it) => (
                        <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                          <td className="px-3 py-2 font-mono">{it.sku}</td>
                          <td className="px-3 py-2">{it.product}</td>
                          <td className="px-3 py-2">{it.collection}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{(() => { const w = weeksOfSupply(it); return w == null ? "—" : `${w.toFixed(1)} wk`; })()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney((it.unitCost ?? 0) * it.onHand)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="ranking" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-accent-foreground" />
                <h3 className="text-base font-semibold">Top SKUs by Sales Velocity</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-3 py-2">SKU</th>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-left px-3 py-2">Collection</th>
                      <th className="text-right px-3 py-2">Vel/mo</th>
                      <th className="text-right px-3 py-2">Monthly $</th>
                      <th className="text-right px-3 py-2">On Hand</th>
                      <th className="text-center px-3 py-2">Buy Now?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((it, i) => (
                      <tr key={it.sku} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerSku(it.sku)}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-mono">{it.sku}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate" title={it.product}>{it.product}</td>
                        <td className="px-3 py-2">{it.collection}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{it.avgMonthlySales}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.salesValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{it.onHand}</td>
                        <td className="px-3 py-2 text-center">
                          {(it.monthsSupply ?? 99) < 2 ? <Badge className="text-[10px]">Buy</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

        </Tabs>
      </TabsContent>

      {/* ============ SECTION 3: REORDER ============ */}
      <TabsContent value="reorder" className="space-y-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Factory className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Reorder by Factory — Suggested vs MOQ</h3>
          </div>
          {reorderByFactory.length === 0 ? <EmptyState message="Nothing to reorder right now." /> : (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Factory</th>
                    <th className="text-right px-3 py-2">SKUs</th>
                    <th className="text-right px-3 py-2">Total MOQ</th>
                    <th className="text-right px-3 py-2">Suggested</th>
                    <th className="text-right px-3 py-2">vs MOQ</th>
                    <th className="text-right px-3 py-2">Total Cubes</th>
                    <th className="text-right px-3 py-2">~Containers</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderByFactory.map((f) => {
                    // 40' HC ≈ 2,350 cu ft usable
                    const containers = f.totalCubes > 0 ? f.totalCubes / 2350 : 0;
                    return (
                      <tr key={f.factory} className="border-t border-border">
                        <td className="px-3 py-2">{f.factory}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.skus}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.moq || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(f.suggested)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", f.moq > 0 && f.suggested >= f.moq ? "text-success" : "text-warning-foreground")}>
                          {f.moq > 0 ? `${Math.round((f.suggested / f.moq) * 100)}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.totalCubes ? f.totalCubes.toFixed(1) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{containers ? containers.toFixed(2) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Inventory segregation: On PO / In Transit / On Hand (NC + VN) */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Inventory Segregation</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">On PO (in production / waiting)</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtNum(segregation.onPoUnits)}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtMoney(segregation.onPoValue)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">In Transit</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtNum(segregation.inTransitUnits)}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtMoney(segregation.inTransitValue)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">On Hand</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtNum(segregation.onHandNc + segregation.onHandVn)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                NC {fmtNum(segregation.onHandNc)} · VN {fmtNum(segregation.onHandVn)} · {fmtMoney(segregation.onHandValue)}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-base font-semibold">InvCut — Reorder Worksheet</h3>
          </div>
          {reorderRows.length === 0 ? <EmptyState message="No items." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-2 border border-border">SKU</th>
                    <th className="text-left px-2 py-2 border border-border">Item Description</th>
                    <th className="text-right px-2 py-2 border border-border">Reorder Pt (Min)</th>
                    <th className="text-right px-2 py-2 border border-border">Max</th>
                    <th className="text-right px-2 py-2 border border-border">On Hand</th>
                    <th className="text-right px-2 py-2 border border-border">On Sales Order</th>
                    <th className="text-right px-2 py-2 border border-border">Available</th>
                    <th className="text-right px-2 py-2 border border-border">On PO</th>
                    <th className="text-right px-2 py-2 border border-border">Sales/Week</th>
                    <th className="text-right px-2 py-2 border border-border">New Min</th>
                    <th className="text-right px-2 py-2 border border-border">Net Avail</th>
                    <th className="text-right px-2 py-2 border border-border">Over/Under</th>
                    <th className="text-right px-2 py-2 border border-border">Weeks</th>
                    <th className="text-right px-2 py-2 border border-border bg-accent/20">Order</th>
                    <th className="text-right px-2 py-2 border border-border">Cubes</th>
                    <th className="text-right px-2 py-2 border border-border">Total Cubes</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group by vendor/factory like the Excel sheet (vendor header + line rows + subtotal)
                    const groups = new Map<string, typeof reorderRows>();
                    for (const it of reorderRows.slice(0, 400)) {
                      const v = (it.factory || it.supplier || "—").toUpperCase();
                      if (!groups.has(v)) groups.set(v, [] as any);
                      (groups.get(v) as any).push(it);
                    }
                    const out: JSX.Element[] = [];
                    for (const [vendor, rows] of groups) {
                      // Vendor header (mirrors Col A in InvCut)
                      out.push(
                        <tr key={`hdr-${vendor}`} className="bg-muted/40">
                          <td colSpan={16} className="px-2 py-1.5 font-semibold border border-border">{vendor}</td>
                        </tr>
                      );
                      let groupCubes = 0;
                      for (const it of rows) {
                        const order = orderQty[it.sku] ?? 0;
                        const reorderMin = Math.round(it.salesPerWeek * 20.25); // =L*4.5*4.5
                        const maxQty = it.reorderMax ?? Math.round(reorderMin * 1.5);
                        const onSalesOrder = it.onSalesOrder ?? 0;
                        const available = it.available ?? Math.max(0, it.onHand - onSalesOrder);
                        const netAvail = available + (it.onPo ?? 0); // =SUM(H,I)
                        const overUnder = netAvail - reorderMin;     // =N-M
                        const weeks = it.salesPerWeek > 0
                          ? (netAvail + order) / it.salesPerWeek     // =(N+R)/L
                          : null;
                        const cubesPer = it.cubes ?? 0;
                        const totalCubes = order * cubesPer;          // =R*S
                        groupCubes += totalCubes;
                        const weeksBelowLead = weeks != null && weeks < 32;
                        out.push(
                          <tr key={it.sku} className="hover:bg-muted/30">
                            <td className="px-2 py-1 font-mono border border-border cursor-pointer" onClick={() => setDrawerSku(it.sku)}>{it.sku}</td>
                            <td className="px-2 py-1 max-w-[260px] truncate border border-border" title={it.product}>{it.product}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{reorderMin}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{maxQty}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{it.onHand}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{onSalesOrder}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{available}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{it.onPo ?? 0}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{it.salesPerWeek.toFixed(1)}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{reorderMin}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{netAvail}</td>
                            <td className={cn("px-2 py-1 text-right tabular-nums border border-border", overUnder < 0 ? "text-destructive" : "")}>
                              {overUnder < 0 ? `(${Math.abs(Math.round(overUnder))})` : Math.round(overUnder)}
                            </td>
                            <td className={cn("px-2 py-1 text-right tabular-nums border border-border", weeksBelowLead && "bg-destructive/10 text-destructive font-semibold")}>
                              {weeks == null ? "—" : weeks.toFixed(1)}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border bg-accent/10">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="h-6 w-20 rounded-sm border border-input bg-background px-1 text-right tabular-nums"
                                value={order || ""}
                                placeholder="0"
                                onChange={(e) => setOrder(it.sku, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                              />
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{cubesPer ? cubesPer.toFixed(2) : "—"}</td>
                            <td className="px-2 py-1 text-right tabular-nums border border-border">{totalCubes ? totalCubes.toFixed(2) : "—"}</td>
                          </tr>
                        );
                      }
                      // Subtotal row: =SUM(T:T) and =U/2350 (40' HC container)
                      const containers = groupCubes / 2350;
                      out.push(
                        <tr key={`sub-${vendor}`} className="bg-muted/30 font-semibold">
                          <td colSpan={14} className="px-2 py-1.5 text-right border border-border">
                            {vendor} — Total Cubes / Containers (40&apos; HC = 2,350 cu ft):
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums border border-border" colSpan={2}>
                            {groupCubes.toFixed(2)} cu ft · {containers.toFixed(2)} cont.
                          </td>
                        </tr>
                      );
                    }
                    return out;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Open POs detail with stage */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <PackageOpen className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Open Purchase Orders</h3>
          </div>
          {hub.purchaseOrders.length === 0 ? <EmptyState message="No POs synced yet." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">PO #</th>
                    <th className="text-left px-3 py-2">Factory</th>
                    <th className="text-left px-3 py-2">Stage</th>
                    <th className="text-left px-3 py-2">ETA</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-right px-3 py-2">Prepaid</th>
                  </tr>
                </thead>
                <tbody>
                  {hub.purchaseOrders.map((po) => (
                    <tr key={po.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{po.po_number ?? "—"}</td>
                      <td className="px-3 py-2">{po.factory ?? "—"}</td>
                      <td className="px-3 py-2"><StagePill stage={po.production_stage} /></td>
                      <td className="px-3 py-2">{po.eta ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(po.total_value))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{po.is_prepaid ? fmtMoney(Number(po.prepaid_amount)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* SKU detail drawer */}
      <Sheet open={drawerSku !== null} onOpenChange={(o) => !o && setDrawerSku(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {drawerItem && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{drawerItem.sku}</SheetTitle>
                <SheetDescription>{drawerItem.product}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-foreground">Collection</div><div>{drawerItem.collection}</div></div>
                  <div><div className="text-xs text-muted-foreground">Brand</div><div>{drawerItem.brand ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Vendor / Factory</div><div>{drawerItem.factory ?? drawerItem.supplier}</div></div>
                  <div><div className="text-xs text-muted-foreground">Status</div><div>{drawerItem.status}</div></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">On Hand</div><div className="text-lg font-semibold tabular-nums">{drawerItem.onHand}</div><div className="text-[10px] text-muted-foreground">NC {drawerItem.onHandNc ?? 0} · VN {drawerItem.onHandVn ?? 0}</div></div>
                  <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">On PO</div><div className="text-lg font-semibold tabular-nums">{drawerItem.onPo ?? 0}</div></div>
                  <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">In Transit</div><div className="text-lg font-semibold tabular-nums">{drawerItem.inTransit ?? 0}</div></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="text-xs text-muted-foreground">L12M /wk</div><div className="tabular-nums">{drawerItem.unitsL12m != null ? (drawerItem.unitsL12m / 52).toFixed(1) : "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">L6M /wk</div><div className="tabular-nums">{drawerItem.unitsL6m != null ? (drawerItem.unitsL6m / 26).toFixed(1) : "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">L3M /wk</div><div className="tabular-nums">{drawerItem.unitsL3m != null ? (drawerItem.unitsL3m / 13).toFixed(1) : "—"}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-foreground">Active basis</div><div>{drawerItem.reorderBasis ?? "L12M"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Override /wk</div><div className="tabular-nums">{drawerItem.reorderOverridePerWeek ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Lead time (mo)</div><div className="tabular-nums">{drawerItem.leadTimeMonths ?? 4.5}</div></div>
                  <div><div className="text-xs text-muted-foreground">MOQ</div><div className="tabular-nums">{drawerItem.moq ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Weeks supply</div><div className={cn("tabular-nums", weeksTone(weeksOfSupply(drawerItem)))}>{(() => { const w = weeksOfSupply(drawerItem); return w == null ? "—" : `${w.toFixed(1)} wk`; })()}</div></div>
                  <div><div className="text-xs text-muted-foreground">Forecast/mo</div><div className="tabular-nums">{drawerItem.forecastMonthly ?? "—"}</div></div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {drawerItem.isClearance && <Badge variant="secondary">Clearance</Badge>}
                  {drawerItem.isCloseout && <Badge variant="secondary">Closeout</Badge>}
                  {drawerItem.isDiscontinued && <Badge variant="secondary">Discontinued</Badge>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Tabs>
    </div>
  );
}
