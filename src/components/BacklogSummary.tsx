import { useMemo, useState } from "react";
import { ArrowLeft, AlertTriangle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import backlogData from "@/data/backlogSummary.json";

type DetailRow = {
  customer: string;
  type: string;
  date: string | null;
  shipDate: string | null;
  num: string | number | null;
  name: string | null;
  rep: string | null;
  item: string | null;
  description: string | null;
  memo: string | null;
  amount: number;
  openBalance: number;
  stockClass: string | null;
};

const data = backlogData as {
  asOf: string;
  stockClasses: { code: string; description: string; total: number }[];
  problemOrders: { customer: string; amount: number; notes: string }[];
  discussionPoints: { customer: string; notes: string }[];
  detail: DetailRow[];
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const STOCK_CLASS_TONE: Record<string, string> = {
  OOS: "bg-destructive/10 text-destructive border border-destructive/20",
  New: "bg-warning/15 text-warning-foreground border border-warning/30",
  Avail: "bg-success/10 text-success border border-success/25",
  "Discs-Sur": "bg-muted text-muted-foreground border border-border",
  MC: "bg-accent/15 text-accent-foreground border border-accent/30",
  DC: "bg-primary/10 text-primary border border-primary/20",
  Contract: "bg-muted text-foreground border border-border",
};

type Drill =
  | { kind: "stockClass"; code: string; label: string }
  | { kind: "customer"; customer: string }
  | null;

export function BacklogSummary() {
  const [drill, setDrill] = useState<Drill>(null);

  const totalBacklog = useMemo(
    () => data.stockClasses.reduce((s, c) => s + c.total, 0),
    [],
  );
  const totalProblem = useMemo(
    () => data.problemOrders.reduce((s, c) => s + c.amount, 0),
    [],
  );

  const drillRows = useMemo<DetailRow[]>(() => {
    if (!drill) return [];
    if (drill.kind === "stockClass") {
      return data.detail.filter((r) => r.stockClass === drill.code);
    }
    return data.detail.filter(
      (r) => (r.customer ?? "").toLowerCase() === drill.customer.toLowerCase(),
    );
  }, [drill]);

  const drillTotal = useMemo(
    () => drillRows.reduce((s, r) => s + (r.openBalance || 0), 0),
    [drillRows],
  );

  if (drill) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setDrill(null)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to summary
            </Button>
            <div>
              <h4 className="text-sm font-semibold">
                {drill.kind === "stockClass"
                  ? `${drill.label} (${drill.code})`
                  : drill.customer}
              </h4>
              <p className="text-xs text-muted-foreground">
                {drillRows.length} line{drillRows.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium text-foreground">{fmtMoney(drillTotal)}</span> open balance
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-auto max-h-[60vh] border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Order #</th>
                {drill.kind === "stockClass" && <th className="text-left px-3 py-2">Customer</th>}
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-left px-3 py-2 max-w-[300px]">Description</th>
                <th className="text-left px-3 py-2">Rep</th>
                <th className="text-left px-3 py-2">Ship Date</th>
                {drill.kind === "customer" && <th className="text-left px-3 py-2">Class</th>}
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-right px-3 py-2">Open Bal</th>
              </tr>
            </thead>
            <tbody>
              {drillRows.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{r.num ?? "—"}</td>
                  {drill.kind === "stockClass" && (
                    <td className="px-3 py-2 max-w-[180px] truncate">{r.customer}</td>
                  )}
                  <td className="px-3 py-2 font-mono text-xs">{r.item ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[300px] truncate text-xs text-muted-foreground">
                    {r.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.rep ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.shipDate ? new Date(r.shipDate).toLocaleDateString() : "—"}
                  </td>
                  {drill.kind === "customer" && (
                    <td className="px-3 py-2">
                      {r.stockClass ? (
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 rounded text-[10px] font-medium",
                            STOCK_CLASS_TONE[r.stockClass] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {r.stockClass}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {fmtMoney(r.openBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
        <span>
          Backlog as of{" "}
          <span className="font-medium text-foreground">
            {new Date(data.asOf).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </span>
        <span>Click any row to drill into line-item detail</span>
      </div>

      {/* Stock Class breakdown */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Backlog by Stock Class</h4>
        <div className="overflow-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-right px-3 py-2">Open $</th>
                <th className="text-right px-3 py-2">% of total</th>
              </tr>
            </thead>
            <tbody>
              {data.stockClasses.map((c) => (
                <tr
                  key={c.code}
                  className="border-t border-border hover:bg-muted/40 cursor-pointer"
                  onClick={() => setDrill({ kind: "stockClass", code: c.code, label: c.description })}
                >
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded text-[11px] font-medium",
                        STOCK_CLASS_TONE[c.code] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {c.code}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(c.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {((c.total / totalBacklog) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Total Open Backlog
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalBacklog)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Problem Orders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Problem Orders
          </h4>
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{fmtMoney(totalProblem)}</span> at risk
          </span>
        </div>
        <div className="overflow-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Customer</th>
                <th className="text-right px-3 py-2">Open $</th>
                <th className="text-left px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.problemOrders.map((p) => (
                <tr
                  key={p.customer}
                  className="border-t border-border hover:bg-muted/40 cursor-pointer"
                  onClick={() => setDrill({ kind: "customer", customer: p.customer })}
                >
                  <td className="px-3 py-2 font-medium">{p.customer}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(p.amount)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[480px]">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discussion Points */}
      {data.discussionPoints.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent" />
            Discussion Points
          </h4>
          <div className="grid gap-2 md:grid-cols-2">
            {data.discussionPoints.map((d) => (
              <div
                key={d.customer}
                className="border border-border rounded-md p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setDrill({ kind: "customer", customer: d.customer })}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium">{d.customer}</span>
                  <Badge variant="secondary" className="text-[10px]">discuss</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{d.notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const BACKLOG_SUMMARY_TOTAL = data.stockClasses.reduce((s, c) => s + c.total, 0);
