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
  active: boolean | null;
  updated_at: string | null;
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
          "id, acctivate_id, rep_code, name, email, phone, manager_name, manager_acctivate_id, territory_name, territory_acctivate_id, active, updated_at",
        )
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) console.error(error);
      setRows((data ?? []) as Rep[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.name, r.rep_code, r.email, r.manager_name, r.territory_name, r.territory_acctivate_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : rows;

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Sales Rep Database (Acctivate)"
        subtitle="Read-only view of sales reps synced from Acctivate. This does not affect the original Sales Reps section."
      />

      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search reps, codes, managers, territories--¦"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-sm text-muted-foreground">
          {loading ? "Loading--¦" : `${filtered.length} of ${rows.length} reps`}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Sales Manager</TableHead>
              <TableHead>Territory</TableHead>
              <TableHead>Territory Code</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.rep_code ?? r.acctivate_id ?? "-"}</TableCell>
                <TableCell className="font-medium">{r.name ?? "-"}</TableCell>
                <TableCell>{r.email ?? "-"}</TableCell>
                <TableCell>{r.phone ?? "-"}</TableCell>
                <TableCell>{r.manager_name ?? "-"}</TableCell>
                <TableCell>{r.territory_name ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">{r.territory_acctivate_id ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={r.active ? "default" : "secondary"}>
                    {r.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No reps found. Run the Acctivate sync to populate this table.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
