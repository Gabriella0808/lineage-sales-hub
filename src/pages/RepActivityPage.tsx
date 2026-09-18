import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useSalesReps, useManagers } from "@/hooks/usePortalData";
import { useRepLastLogins } from "@/hooks/useSignInFeed";

export default function RepActivityPage() {
  const [query, setQuery] = useState("");

  const { data: repLastLogins = [], isLoading: loginsLoading } = useRepLastLogins();
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: managers = [] } = useManagers();

  const repsById = useMemo(() => new Map(reps.map((r) => [r.id, r])), [reps]);
  const managerNameById = useMemo(() => new Map(managers.map((m) => [m.id, m.name])), [managers]);

  const isLoading = loginsLoading || repsLoading;

  // get_rep_last_logins() already scopes rows to what the caller is allowed
  // to see (all reps for admin, only their own for a manager) — the page
  // just joins in email/status/manager from sales_reps for display.
  const rows = useMemo(() => {
    return repLastLogins.map((r) => {
      const rep = repsById.get(r.rep_id);
      return {
        rep_id: r.rep_id,
        rep_name: r.rep_name,
        email: rep?.email ?? null,
        status: rep?.status ?? null,
        manager_name: rep?.manager_id ? managerNameById.get(rep.manager_id) ?? null : null,
        last_signed_in_at: r.last_signed_in_at,
      };
    });
  }, [repLastLogins, repsById, managerNameById]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.rep_name, r.email, r.manager_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : rows;

  // Most-recently-logged-in reps first, never-logged-in reps last.
  const sorted = [...filtered].sort((a, b) => {
    if (!a.last_signed_in_at && !b.last_signed_in_at) return a.rep_name.localeCompare(b.rep_name);
    if (!a.last_signed_in_at) return 1;
    if (!b.last_signed_in_at) return -1;
    return new Date(b.last_signed_in_at).getTime() - new Date(a.last_signed_in_at).getTime();
  });

  const neverLoggedInCount = rows.filter((r) => !r.last_signed_in_at).length;

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Rep Login Activity"
        subtitle="See when each sales rep last logged into their portal."
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input
          placeholder="Search rep, email, manager..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-sm text-muted-foreground text-right">
          {isLoading
            ? "Loading..."
            : `${filtered.length} of ${rows.length} reps  (${neverLoggedInCount} never logged in)`}
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Sales Manager</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              sorted.map((r) => (
                <TableRow key={r.rep_id}>
                  <TableCell className="font-medium">{r.rep_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.email ?? "-"}</TableCell>
                  <TableCell className="text-sm">{r.manager_name ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "active" ? "default" : "secondary"} className="capitalize">
                      {r.status ?? "-"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-sm"
                    title={r.last_signed_in_at ? new Date(r.last_signed_in_at).toLocaleString() : undefined}
                  >
                    {r.last_signed_in_at
                      ? formatDistanceToNow(new Date(r.last_signed_in_at), { addSuffix: true })
                      : <span className="text-muted-foreground">Never logged in</span>}
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  {rows.length === 0 ? "No reps found." : "No reps match your search."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
