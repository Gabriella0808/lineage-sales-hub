import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useQboPrepaidLines, useQboPrepaidSummary } from "@/hooks/useQboPrepaid";

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const compact = (n: number) => {
  const a = Math.abs(n);
  return a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(1)}M` : a >= 1_000 ? `$${Math.round(a / 1_000)}K` : `$${Math.round(a)}`;
};

// Ledger of the QuickBooks "Vendor Prepayments" account.
export function QboPrepaidReport({ canSeeLedger }: { canSeeLedger: boolean }) {
  const qc = useQueryClient();
  const { data: summary } = useQboPrepaidSummary();
  const { data: lines = [], isLoading } = useQboPrepaidLines(canSeeLedger);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [shown, setShown] = useState(50);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const types = useMemo(() => [...new Set(lines.map((l) => l.transaction_type).filter(Boolean) as string[])].sort(), [lines]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      if (type !== "all" && l.transaction_type !== type) return false;
      if (!q) return true;
      return [l.vendor_name, l.memo, l.doc_num].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [lines, query, type]);

  const monthly = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const l of lines) {
      const k = l.transaction_date.slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + l.amount);
    }
    let run = 0;
    return [...byMonth.keys()].sort().map((k) => { run += byMonth.get(k)!; return { month: format(parseISO(`${k}-01`), "MMM yy"), Balance: Math.round(run) }; });
  }, [lines]);

  const filteredTotal = filtered.reduce((s, l) => s + l.amount, 0);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const { data, error } = await supabase.functions.invoke("sync-qbo-vendor-prepayments");
    setSyncing(false);
    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      setSyncMsg("Sync failed. QuickBooks may be busy, try again in a few minutes.");
      return;
    }
    setSyncMsg("Synced from QuickBooks.");
    qc.invalidateQueries({ queryKey: ["qbo_prepaid_summary"] });
    qc.invalidateQueries({ queryKey: ["qbo_prepaid_lines"] });
  };

  return (
    <div className="space-y-4">
      {canSeeLedger && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {summary && <span>Synced {formatDistanceToNow(new Date(summary.synced_at), { addSuffix: true })}</span>}
          <Button size="sm" variant="outline" className="h-8" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />{syncing ? "Syncing..." : "Sync now"}
          </Button>
        </div>
      )}
      {syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}

      {!canSeeLedger && (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-6 text-center">The prepaid ledger is available to admins and managers. The balance above comes from QuickBooks.</p>
      )}

      {canSeeLedger && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-4"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance in QuickBooks</p><p className="font-serif text-3xl font-medium tabular-nums mt-1">{summary ? money(summary.current_balance) : "..."}</p><p className="text-xs text-muted-foreground mt-1">{summary?.qbo_account_name ?? "Vendor Prepayments"}</p></div>
            <div className="rounded-xl border p-4"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Transactions</p><p className="font-serif text-3xl font-medium tabular-nums mt-1">{lines.length.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">{lines.length ? `${format(parseISO(lines[lines.length - 1].transaction_date), "MMM d, yyyy")} to ${format(parseISO(lines[0].transaction_date), "MMM d, yyyy")}` : " "}</p></div>
            <div className="rounded-xl border p-4"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Shown below</p><p className="font-serif text-3xl font-medium tabular-nums mt-1">{money(filteredTotal)}</p><p className="text-xs text-muted-foreground mt-1">{filtered.length.toLocaleString()} transactions match</p></div>
          </div>

          {monthly.length > 1 && (
            <div className="rounded-xl border p-4">
              <p className="text-sm font-semibold mb-2">Balance at each month end</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} width={48} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Line type="monotone" dataKey="Balance" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setShown(50); }} placeholder="Search vendor, memo or number" className="max-w-xs" />
            <select value={type} onChange={(e) => { setType(e.target.value); setShown(50); }} className="h-9 rounded-md border bg-card px-3 text-sm" aria-label="Transaction type">
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {isLoading ? <p className="text-sm text-muted-foreground">Loading ledger...</p> : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">No.</th>
                    <th className="text-left px-3 py-2">Vendor</th><th className="text-left px-3 py-2">Memo</th>
                    <th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, shown).map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{format(parseISO(l.transaction_date), "MMM d, yyyy")}</td>
                      <td className="px-3 py-2 text-xs">{l.transaction_type ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.doc_num ?? "-"}</td>
                      <td className="px-3 py-2">{l.vendor_name ?? "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[260px] truncate" title={l.memo ?? undefined}>{l.memo ?? ""}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-medium", l.amount < 0 && "text-success")}>{money(l.amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.running_balance == null ? "-" : money(l.running_balance)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No transactions match.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > shown && <div className="flex justify-center"><Button variant="outline" size="sm" onClick={() => setShown((n) => n + 50)}>Show more ({filtered.length - shown} remaining)</Button></div>}
          <p className="text-xs text-muted-foreground">Positive amounts are prepayments to factories; negative amounts (green) are prepayments applied against invoices. Source: QuickBooks Online, account "Vendor Prepayments".</p>
        </>
      )}
    </div>
  );
}
