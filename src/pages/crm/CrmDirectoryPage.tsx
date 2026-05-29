import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCrmAccounts, useCrmReps, LIFECYCLE_STAGES } from "@/hooks/useCrm";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export default function CrmDirectoryPage() {
  const nav = useNavigate();
  const { data: accounts = [] } = useCrmAccounts();
  const { data: reps = [] } = useCrmReps();
  const [q, setQ] = useState("");

  const repName = (id: string | null) => (id ? reps.find((r) => r.id === id)?.name ?? "—" : "—");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return accounts;
    return accounts.filter((a) => {
      const hay = `${a.company_name} ${a.contact_first_name ?? ""} ${a.contact_last_name ?? ""} ${a.email ?? ""} ${a.main_phone ?? ""} ${a.city ?? ""} ${a.state ?? ""}`.toLowerCase();
      return hay.includes(n);
    });
  }, [accounts, q]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="CRM · Directory" title="Contacts Directory" subtitle="Fast lookup across every account and contact." />

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search anything — company, name, phone, city…" className="pl-9" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-3 py-2.5 font-medium">Contact</th>
                <th className="text-left px-3 py-2.5 font-medium">Phone</th>
                <th className="text-left px-3 py-2.5 font-medium">Email</th>
                <th className="text-left px-3 py-2.5 font-medium">City / State</th>
                <th className="text-left px-3 py-2.5 font-medium">Rep</th>
                <th className="text-left px-3 py-2.5 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((a) => {
                const stage = LIFECYCLE_STAGES.find((s) => s.id === a.lifecycle_stage)!;
                return (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2"><Link to={`/crm/accounts/${a.id}`} className="font-medium hover:text-accent">{a.company_name}</Link></td>
                    <td className="px-3 py-2 text-muted-foreground">{[a.contact_first_name, a.contact_last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{a.main_phone || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.email || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{[a.city, a.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{repName(a.assigned_rep_id)}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className={`text-[10px] border ${stage.color}`}>{stage.label}</Badge></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No matches.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
