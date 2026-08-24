import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Rep = {
  id: string;
  acctivate_id: string | null;
  rep_code: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  manager_name: string | null;
  manager_acctivate_id: string | null;
  territory_name: string | null;
  territory_acctivate_id: string | null;
  territory_code: string | null;
  active: boolean | null;
  synced_at: string | null;
};

export default function SalesRepsAcctivatePage() {
  const [rows, setRows] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("acctivate_sales_reps")
        .select(
          "id, acctivate_id, rep_code, name, email, phone, " +
          "manager_name, manager_acctivate_id, " +
          "territory_name, territory_acctivate_id, territory_code, " +
          "active, synced_at",
        )
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) console.error(error);
      setRows((data ?? []) as unknown as Rep[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.name, r.rep_code, r.acctivate_id, r.email, r.phone,
         r.manager_name, r.territory_name, r.territory_code]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : rows;

  const lastSynced = rows.reduce<string | null>(
    (best, r) => (r.synced_at && (!best || r.synced_at > best) ? r.synced_at : best),
    null,
  );

  const activeCount = rows.filter((r) => r.active !== false).length;

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Sales Rep Database (Acctivate)"
        subtitle="Read-only catalog synced from Acctivate. Does not affect the main Sales Reps section."
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input
          placeholder="Search rep code, name, email, phone, manager, territory..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-sm text-muted-foreground text-right space-y-0.5">
          {loading
            ? "Loading..."
            : `${filtered.length} of ${rows.length} reps  (${activeCount} active)`}
          {!loading && lastSynced && (
            <div className="text-xs">
              Last synced: {new Date(lastSynced).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Sales Manager</TableHead>
              <TableHead>Territory</TableHead>
              <TableHead>Terr. Code</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {r.rep_code ?? r.acctivate_id ?? "-"}
                </TableCell>
                <TableCell className="font-medium">{r.name ?? "-"}</TableCell>
                <TableCell className="text-sm">{r.email ?? "-"}</TableCell>
                <TableCell className="text-sm">{r.phone ?? "-"}</TableCell>
                <TableCell>{r.manager_name ?? "-"}</TableCell>
                <TableCell>{r.territory_name ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.territory_code ?? "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={r.active !== false ? "default" : "secondary"}>
                    {r.active !== false ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  {rows.length === 0
                    ? "No reps found. Run the Acctivate VM sync to populate this table."
                    : "No reps match your search."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Territory and sales manager are derived from order history (most-frequent assignment per rep).
          Email and phone come directly from Acctivate if populated on the salesperson record.
        </p>
      )}
    </div>
  );
}
