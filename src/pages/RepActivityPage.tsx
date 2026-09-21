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
import { cn } from "@/lib/utils";

export default function RepActivityPage() {
  const [query, setQuery] = useState("");

  const { data: repLastLogins = [], isLoading: loginsLoading } = useRepLastLogins();
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: managers = [] } = useManagers();

  const repsById = useMemo(() => new Map(reps.map((r) => [r.id, r])), [reps]);
  const managerNameById = useMemo(() => new Map(managers.map((m) => [m.id, m.name])), [managers]);

  const isLoading = loginsLoading || repsLoading;

  // get_rep_last_logins() already scopes rows to what the caller is allowed
  // to see (all reps for admin, only their own for a manager) and returns
  // the real login email directly — sales_reps.email is blank for several
  // real, actively-used accounts, so it's only used here for status/manager.
  const rows = useMemo(() => {
    return repLastLogins.map((r) => {
      const rep = repsById.get(r.rep_id);
      return {
        rep_id: r.rep_id,
        rep_name: r.rep_name,
        email: r.email,
        status: rep?.status ?? null,
        manager_name: rep?.manager_id ? managerNameById.get(rep.manager_id) ?? null : null,
        last_signed_in_at: r.last_signed_in_at,
      };
    });
  }, [repLastLogins, repsById, managerNameById]);

  const DAY = 86_400_000;
  const bucketOf = (iso: string | null): "active" | "quiet" | "inactive" | "never" => {
    if (!iso) return "never";
    const age = Date.now() - new Date(iso).getTime();
    return age < 7 * DAY ? "active" : age < 30 * DAY ? "quiet" : "inactive";
  };
  const BUCKETS = {
    active: { label: "Active this week", dot: "bg-success" },
    quiet: { label: "Quiet, 7 to 30 days", dot: "bg-warning" },
    inactive: { label: "Inactive, 30+ days", dot: "bg-destructive" },
    never: { label: "Never logged in", dot: "bg-muted-foreground/40" },
  } as const;

  const [bucketFilter, setBucketFilter] = useState<"all" | keyof typeof BUCKETS>("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");

  const counts = rows.reduce((m, r) => { m[bucketOf(r.last_signed_in_at)]++; return m; }, { active: 0, quiet: 0, inactive: 0, never: 0 });
  const managerOptions = [...new Set(rows.map((r) => r.manager_name).filter(Boolean) as string[])].sort();

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (bucketFilter !== "all" && bucketOf(r.last_signed_in_at) !== bucketFilter) return false;
    if (managerFilter !== "all" && r.manager_name !== managerFilter) return false;
    if (!q) return true;
    return [r.rep_name, r.email, r.manager_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });

  // Most-recently-logged-in reps first, never-logged-in reps last.
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.rep_name.localeCompare(b.rep_name);
    if (!a.last_signed_in_at && !b.last_signed_in_at) return a.rep_name.localeCompare(b.rep_name);
    if (!a.last_signed_in_at) return 1;
    if (!b.last_signed_in_at) return -1;
    return new Date(b.last_signed_in_at).getTime() - new Date(a.last_signed_in_at).getTime();
  });

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Rep Login Activity"
        subtitle="See when each sales rep last logged into their portal."
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {(Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setBucketFilter(bucketFilter === k ? "all" : k)}
            className={cn("rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md", bucketFilter === k && "ring-2 ring-primary")}
          >
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", BUCKETS[k].dot)} />{BUCKETS[k].label}
            </p>
            <p className="font-serif text-4xl font-medium tracking-tight tabular-nums mt-2">{isLoading ? "..." : counts[k]}</p>
            <p className="text-xs text-muted-foreground mt-1">{rows.length > 0 && !isLoading ? `${Math.round((counts[k] / rows.length) * 100)}% of reps` : " "}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search rep, email, manager..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="h-9 rounded-md border bg-card px-3 text-sm"
          aria-label="Filter by manager"
        >
          <option value="all">All managers</option>
          {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "recent" | "name")}
          className="h-9 rounded-md border bg-card px-3 text-sm"
          aria-label="Sort"
        >
          <option value="recent">Most recent login first</option>
          <option value="name">Name A to Z</option>
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          {isLoading ? "Loading..." : `${filtered.length} of ${rows.length} reps`}
        </span>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
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
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", BUCKETS[bucketOf(r.last_signed_in_at)].dot)} />
                      {r.last_signed_in_at
                        ? formatDistanceToNow(new Date(r.last_signed_in_at), { addSuffix: true })
                        : <span className="text-muted-foreground">Never logged in</span>}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  {rows.length === 0 ? "No reps found." : "No reps match your filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
