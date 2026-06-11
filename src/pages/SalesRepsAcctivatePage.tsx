import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Rep = {
  id: string;
  rep_code: string | null;
  acctivate_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  manager_name: string | null;
  manager_acctivate_id: string | null;
  territory_name: string | null;
  territory_acctivate_id: string | null;
  active: boolean | null;
};

type Manager = {
  id: string;
  manager_code: string | null;
  acctivate_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  active: boolean | null;
};

type Territory = {
  id: string;
  territory_code: string | null;
  acctivate_id: string;
  name: string;
  description: string | null;
  manager_name: string | null;
  manager_acctivate_id: string | null;
  active: boolean | null;
};

function useReps() {
  return useQuery({
    queryKey: ["acctivate_sales_reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acctivate_sales_reps" as never)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Rep[];
    },
  });
}
function useManagers() {
  return useQuery({
    queryKey: ["acctivate_sales_managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acctivate_sales_managers" as never)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Manager[];
    },
  });
}
function useTerritories() {
  return useQuery({
    queryKey: ["acctivate_territories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acctivate_territories" as never)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Territory[];
    },
  });
}

function ActiveBadge({ active }: { active: boolean | null }) {
  return active === false
    ? <Badge variant="secondary">Inactive</Badge>
    : <Badge>Active</Badge>;
}

function filterByText<T extends Record<string, unknown>>(rows: T[], q: string): T[] {
  if (!q.trim()) return rows;
  const needle = q.toLowerCase();
  return rows.filter((r) =>
    Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(needle))
  );
}

export default function SalesRepsAcctivatePage() {
  const reps = useReps();
  const mgrs = useManagers();
  const terrs = useTerritories();
  const [q, setQ] = useState("");

  const repsFiltered = filterByText(reps.data ?? [], q);
  const mgrsFiltered = filterByText(mgrs.data ?? [], q);
  const terrsFiltered = filterByText(terrs.data ?? [], q);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ACCTIVATE"
        title="Sales Rep Database (Acctivate)"
        subtitle="Sales reps, sales managers, and territories synced directly from Acctivate. Separate from the portal sales rep database."
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name, code, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-xs text-muted-foreground">
          {reps.data?.length ?? 0} reps · {mgrs.data?.length ?? 0} managers · {terrs.data?.length ?? 0} territories
        </div>
      </div>

      <Tabs defaultValue="reps">
        <TabsList>
          <TabsTrigger value="reps">Sales Reps</TabsTrigger>
          <TabsTrigger value="managers">Sales Managers</TabsTrigger>
          <TabsTrigger value="territories">Territories</TabsTrigger>
        </TabsList>

        <TabsContent value="reps" className="mt-4">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                )}
                {!reps.isLoading && repsFiltered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No reps synced yet. Run the Acctivate sync to populate.
                  </TableCell></TableRow>
                )}
                {repsFiltered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.rep_code ?? r.acctivate_id}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email ?? "—"}</TableCell>
                    <TableCell>{r.phone ?? "—"}</TableCell>
                    <TableCell>
                      {r.manager_name ?? "—"}
                      {r.manager_acctivate_id && (
                        <span className="ml-1 text-xs font-mono text-muted-foreground">({r.manager_acctivate_id})</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.territory_name ?? "—"}
                      {r.territory_acctivate_id && (
                        <span className="ml-1 text-xs font-mono text-muted-foreground">({r.territory_acctivate_id})</span>
                      )}
                    </TableCell>
                    <TableCell><ActiveBadge active={r.active} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="managers" className="mt-4">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manager Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mgrs.isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                )}
                {!mgrs.isLoading && mgrsFiltered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No managers synced yet.
                  </TableCell></TableRow>
                )}
                {mgrsFiltered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.manager_code ?? m.acctivate_id}</TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.email ?? "—"}</TableCell>
                    <TableCell>{m.phone ?? "—"}</TableCell>
                    <TableCell>{m.job_title ?? "—"}</TableCell>
                    <TableCell><ActiveBadge active={m.active} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="territories" className="mt-4">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Territory Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terrs.isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                )}
                {!terrs.isLoading && terrsFiltered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No territories synced yet.
                  </TableCell></TableRow>
                )}
                {terrsFiltered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.territory_code ?? t.acctivate_id}</TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.description ?? "—"}</TableCell>
                    <TableCell>
                      {t.manager_name ?? "—"}
                      {t.manager_acctivate_id && (
                        <span className="ml-1 text-xs font-mono text-muted-foreground">({t.manager_acctivate_id})</span>
                      )}
                    </TableCell>
                    <TableCell><ActiveBadge active={t.active} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
