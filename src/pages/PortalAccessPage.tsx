import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, History, Lock, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { resolveRole, type AppRole } from "@/hooks/useUserRole";
import { PAGE_ACCESS_QUERY_KEY, usePageAccessOverrides } from "@/hooks/usePageAccessOverrides";
import { PAGE_ACCESS } from "@/config/pageAccess";
import {
  LOCKED_PAGES, profileFor, type AccessHalf, type AccessOverrides, type AccessProfile,
} from "@/config/accessOverrides";
import { PAGE_KEYS, canOpenPage, hasHalf, menuKeysFor, pageState, verdict, type Verdict } from "@/config/accessMatrix";

interface PortalUserRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  roles: string[];
  manager_names: string[];
  rep_names: string[];
  has_manager_link: boolean;
  has_rep_link: boolean;
  has_dealer_link: boolean;
  last_sign_in_at: string | null;
}

interface PortalUser extends PortalUserRow {
  role: AppRole;
  profile: AccessProfile;
  menu: Set<string>;
}

const ROLE_ORDER: AppRole[] = ["admin", "manager", "rep", "dealer"];
const PROFILES: AccessProfile[] = ["admin", "manager", "rep", "dealer", "customer_service"];
const PROFILE_LABEL: Record<AccessProfile, string> = { admin: "Admin", manager: "Manager", rep: "Rep", dealer: "Dealer", customer_service: "Customer service" };
const ROLE_TONE: Record<AccessProfile, string> = {
  admin: "bg-foreground text-background",
  manager: "bg-accent/40 text-foreground",
  rep: "bg-secondary text-secondary-foreground",
  dealer: "bg-muted text-muted-foreground",
  customer_service: "bg-warning/20 text-foreground",
};
// A generic person of each profile (no special email), used to show "what this role gets by default".
const REPRESENTATIVE: Record<AccessProfile, { role: AppRole; email: string | null }> = {
  admin: { role: "admin", email: null },
  manager: { role: "manager", email: null },
  rep: { role: "rep", email: null },
  dealer: { role: "dealer", email: null },
  customer_service: { role: "manager", email: "tammy@lineage-collections.com" },
};

const VERDICT_LABEL: Record<Verdict, string> = {
  "full": "Can open",
  "url-only": "Address only (not in menu)",
  "menu-blocked": "In menu but blocked",
  "none": "No access",
};
const HALF_LABEL: Record<AccessHalf, string> = { menu: "In menu", route: "Can open" };

function usePortalUsers() {
  return useQuery({
    queryKey: ["admin_portal_users"],
    staleTime: 60_000,
    queryFn: async () => {
      // New database function - not in the generated Supabase types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("admin_list_portal_users");
      if (error) throw new Error(error.message);
      return (data ?? []) as PortalUserRow[];
    },
  });
}

interface AuditRow {
  id: number; changed_at: string; changed_by: string | null; scope: string; target: string; page_key: string;
  action: string; old_menu: boolean | null; old_route: boolean | null; new_menu: boolean | null; new_route: boolean | null;
}
function useAuditLog() {
  return useQuery({
    queryKey: ["page_access_audit"],
    staleTime: 15_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("page_access_audit").select("*").neq("changed_by", "system (migration)").order("changed_at", { ascending: false }).limit(25);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditRow[];
    },
  });
}

const onOff = (v: boolean | null) => (v === null ? "default" : v ? "on" : "off");
function describeChange(a: AuditRow): string {
  const parts: string[] = [];
  (["menu", "route"] as AccessHalf[]).forEach((h) => {
    const o = a[`old_${h}` as const], n = a[`new_${h}` as const];
    if (o !== n) parts.push(`${HALF_LABEL[h].toLowerCase()} ${onOff(o)} → ${onOff(n)}`);
  });
  return parts.join(", ") || "no change";
}

function RoleBadge({ profile }: { profile: AccessProfile }) {
  return <span className={cn("inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap", ROLE_TONE[profile])}>{PROFILE_LABEL[profile]}</span>;
}

/** Runs an override write, then refreshes what everyone (including this page) sees. */
function useAccessWriter(adminEmail: string | null | undefined, overrides: AccessOverrides) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (args: { scope: "role" | "person"; target: string; page: string; half: AccessHalf; value: boolean | null }) => {
      const { scope, target, page, half, value } = args;
      const table = scope === "role" ? "page_access_role_overrides" : "page_access_user_overrides";
      const keyCol = scope === "role" ? "profile" : "email";
      const existing = scope === "role"
        ? overrides.roleOverrides.find((o) => o.page_key === page && o.profile === target)
        : overrides.userOverrides.find((o) => o.page_key === page && o.email === target);
      const next = { menu: existing?.menu ?? null, route: existing?.route ?? null, [half]: value } as { menu: boolean | null; route: boolean | null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const res = next.menu === null && next.route === null
        ? await db.from(table).delete().eq("page_key", page).eq(keyCol, target)
        : await db.from(table).upsert({ page_key: page, [keyCol]: target, ...next, updated_by: adminEmail ?? null }, { onConflict: `page_key,${keyCol}` });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAGE_ACCESS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["page_access_audit"] });
    },
    onError: (e: Error) => toast.error(`Couldn't save that change: ${e.message}`),
  });
  return mut;
}

/** One On/Off switch for a page + half, with the "changed from default" marker and reset. */
function AccessSwitch({ checked, custom, disabled, onToggle, onReset, label }: {
  checked: boolean; custom: boolean; disabled?: boolean; onToggle: (v: boolean) => void; onReset: () => void; label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onToggle} aria-label={label} className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4" />
      {custom ? (
        <button type="button" onClick={onReset} title="Changed from the default - click to reset" className="text-warning hover:text-foreground" aria-label={`Reset ${label} to default`}>
          <RotateCcw className="h-3 w-3" />
        </button>
      ) : <span className="w-3" />}
    </span>
  );
}

export default function PortalAccessPage() {
  const { user: authUser } = useAuth();
  const { data: rows = [], isLoading, error } = usePortalUsers();
  const { overrides, loading: overridesLoading } = usePageAccessOverrides();
  const write = useAccessWriter(authUser?.email, overrides);
  const { data: audit = [] } = useAuditLog();

  const [view, setView] = useState<"person" | "page">("person");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageKey, setPageKey] = useState<string>("pre-sale");

  const users: PortalUser[] = useMemo(
    () => rows.map((r) => {
      const role = resolveRole({ email: r.email, roles: r.roles, hasManager: r.has_manager_link, hasRep: r.has_rep_link, hasDealer: r.has_dealer_link });
      return { ...r, role, profile: profileFor(r.email, role, overrides), menu: menuKeysFor(role, r.email, overrides) };
    }),
    [rows, overrides],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    users.forEach((u) => { c[u.profile] = (c[u.profile] ?? 0) + 1; });
    return c;
  }, [users]);

  const q = search.trim().toLowerCase();
  const filteredUsers = users.filter((u) =>
    (roleFilter === "all" || u.role === roleFilter) &&
    (!q || (u.email ?? "").toLowerCase().includes(q) || (u.full_name ?? "").toLowerCase().includes(q)),
  );
  const selected = users.find((u) => u.user_id === selectedId) ?? filteredUsers[0] ?? null;

  const pageOptions = useMemo(
    () => PAGE_KEYS.map((k) => ({ key: k, title: PAGE_ACCESS[k].title })).sort((a, b) => a.title.localeCompare(b.title)),
    [],
  );

  const mismatches = useMemo(() => {
    const out = new Map<string, { menuBlocked: number; urlOnly: number }>();
    for (const k of PAGE_KEYS) {
      let menuBlocked = 0, urlOnly = 0;
      for (const u of users) {
        const v = verdict(pageState(k, u.role, u.email, u.menu, overrides));
        if (v === "menu-blocked") menuBlocked++;
        if (v === "url-only") urlOnly++;
      }
      if (menuBlocked > 0 || (urlOnly > 0 && PAGE_ACCESS[k].menu)) out.set(k, { menuBlocked, urlOnly });
    }
    return out;
  }, [users, overrides]);

  const setPerson = (email: string, page: string, half: AccessHalf, value: boolean | null) =>
    write.mutate({ scope: "person", target: email.toLowerCase(), page, half, value });
  const setRole = (profile: AccessProfile, page: string, half: AccessHalf, value: boolean | null) =>
    write.mutate({ scope: "role", target: profile, page, half, value });

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Administration" title="Portal Access" />
        <Card><CardContent className="p-6 text-sm text-destructive">Couldn't load users: {(error as Error).message}</CardContent></Card>
      </div>
    );
  }

  const busy = isLoading || overridesLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Portal Access"
        subtitle="See and change which pages each person can see and open. Changes save instantly and apply the next time they load or refresh the portal."
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        <span>{users.length} users</span>
        {PROFILES.filter((p) => counts[p]).map((p) => <span key={p} className="inline-flex items-center gap-1"><RoleBadge profile={p} /> {counts[p]}</span>)}
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-full sm:w-fit">
        {([["person", "By person"], ["page", "By page"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={cn("flex-1 sm:flex-none h-8 px-5 rounded-md text-[13px] transition-colors", view === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {busy ? (
        <Skeleton className="h-96" />
      ) : view === "person" ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader className="pb-2 space-y-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" className="pl-8" />
              </div>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as AppRole | "all")} className="h-9 w-full rounded-md border bg-card px-3 text-sm" aria-label="Filter by role">
                <option value="all">All roles</option>
                {ROLE_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </CardHeader>
            <CardContent className="p-0 max-h-[640px] overflow-auto">
              {filteredUsers.length === 0 && <p className="p-4 text-sm text-muted-foreground">No one matches.</p>}
              {filteredUsers.map((u) => (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => setSelectedId(u.user_id)}
                  className={cn("w-full text-left px-4 py-2.5 border-t flex items-center justify-between gap-2 hover:bg-muted/40", selected?.user_id === u.user_id && "bg-muted/60")}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{u.full_name || u.email}</span>
                    {u.full_name && <span className="block text-xs text-muted-foreground truncate">{u.email}</span>}
                  </span>
                  <RoleBadge profile={u.profile} />
                </button>
              ))}
            </CardContent>
          </Card>

          {selected ? (
            <PersonEditor user={selected} overrides={overrides} setPerson={setPerson} saving={write.isPending} />
          ) : <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a person.</CardContent></Card>}
        </div>
      ) : (
        <PageEditor
          users={users} overrides={overrides} pageKey={pageKey} setPageKey={setPageKey} pageOptions={pageOptions}
          setPerson={setPerson} setRole={setRole} saving={write.isPending}
        />
      )}

      {!busy && mismatches.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" />Where the menu and the address disagree</CardTitle>
            <p className="text-xs text-muted-foreground">These pages are shown or hidden in the sidebar differently from whether the address actually opens. Click a page to review and change it.</p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {[...mismatches.entries()].map(([k, m]) => (
              <div key={k} className="flex items-center justify-between gap-3 text-sm border-t pt-1.5 first:border-0 first:pt-0">
                <button type="button" className="font-medium hover:underline text-left" onClick={() => { setPageKey(k); setView("page"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{PAGE_ACCESS[k].title}</button>
                <span className="text-xs text-muted-foreground text-right">
                  {m.menuBlocked > 0 && <>{m.menuBlocked} {m.menuBlocked === 1 ? "person sees" : "people see"} it in the menu but can't open it</>}
                  {m.menuBlocked > 0 && m.urlOnly > 0 && " · "}
                  {m.urlOnly > 0 && <>{m.urlOnly} {m.urlOnly === 1 ? "person can" : "people can"} open it by address without it being in their menu</>}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground" />Recent changes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {audit.length === 0 && <p className="text-sm text-muted-foreground">No changes yet.</p>}
          {audit.map((a) => (
            <div key={a.id} className="text-sm border-t pt-1.5 first:border-0 first:pt-0 flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                <span className="font-medium">{a.scope === "role" ? PROFILE_LABEL[a.target as AccessProfile] ?? a.target : a.target}</span>
                {" · "}{PAGE_ACCESS[a.page_key]?.title ?? a.page_key}
                <span className="text-muted-foreground">{a.action === "reset" ? " reset to default" : `: ${describeChange(a)}`}</span>
              </span>
              <span className="text-xs text-muted-foreground">{new Date(a.changed_at).toLocaleString()} · {a.changed_by ?? "unknown"}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This controls access to whole pages. Controls inside a page (for example the Executive Overview on Company-wide) are set separately and aren't shown here yet. What data someone can see once they're in a page is controlled separately in the database. Home and this page can't be changed, so you can't lock yourself out.
      </p>
    </div>
  );
}

type SetPerson = (email: string, page: string, half: AccessHalf, value: boolean | null) => void;
type SetRole = (profile: AccessProfile, page: string, half: AccessHalf, value: boolean | null) => void;

/** What this person would get for a page/half if their own change (only) were removed. */
function inheritedFor(u: PortalUser, page: string, half: AccessHalf, o: AccessOverrides): boolean {
  const e = (u.email ?? "").toLowerCase();
  const without: AccessOverrides = { ...o, userOverrides: o.userOverrides.map((x) => (x.page_key === page && x.email === e ? { ...x, [half]: null } : x)) };
  return half === "menu" ? menuKeysFor(u.role, u.email, without).has(page) : canOpenPage(page, u.role, u.email, without);
}

function personSwitchCells({ u, page, overrides, setPerson, saving }: { u: PortalUser; page: string; overrides: AccessOverrides; setPerson: SetPerson; saving: boolean }) {
  const state = pageState(page, u.role, u.email, u.menu, overrides);
  const locked = LOCKED_PAGES.has(page);
  const cell = (half: AccessHalf) => {
    if (!hasHalf(page, half)) return <span className="text-muted-foreground/50 text-xs">—</span>;
    const value = (half === "menu" ? state.inMenu : state.canOpen) ?? false;
    const source = half === "menu" ? state.menuSource : state.routeSource;
    return (
      <AccessSwitch
        checked={value}
        custom={source === "person"}
        disabled={locked || saving || !u.email}
        label={`${HALF_LABEL[half]} for ${u.email}`}
        onReset={() => setPerson(u.email!, page, half, null)}
        onToggle={(v) => setPerson(u.email!, page, half, v === inheritedFor(u, page, half, overrides) ? null : v)}
      />
    );
  };
  return { menu: cell("menu"), route: cell("route"), state };
}

function PersonEditor({ user, overrides, setPerson, saving }: { user: PortalUser; overrides: AccessOverrides; setPerson: SetPerson; saving: boolean }) {
  const openCount = PAGE_KEYS.filter((k) => PAGE_ACCESS[k].route && canOpenPage(k, user.role, user.email, overrides)).length;
  const routeCount = PAGE_KEYS.filter((k) => PAGE_ACCESS[k].route).length;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg truncate">{user.full_name || user.email}</CardTitle>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <RoleBadge profile={user.profile} />
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
          <p>Can open {openCount} of {routeCount} pages.</p>
          {user.profile !== user.role && <p>Saved role: {user.role} (treated as {PROFILE_LABEL[user.profile].toLowerCase()} for page access)</p>}
          {user.manager_names.length > 0 && <p>Manager profile: {user.manager_names.join(", ")}</p>}
          {user.rep_names.length > 0 && <p>Rep profile: {user.rep_names.join(", ")}</p>}
          {user.last_sign_in_at && <p>Last sign-in: {new Date(user.last_sign_in_at).toLocaleString()}</p>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y bg-muted/30">
              <th className="py-2 pl-5 pr-3 font-medium">Page</th>
              <th className="py-2 px-3 font-medium text-center">In menu</th>
              <th className="py-2 px-3 font-medium text-center">Can open</th>
              <th className="py-2 pl-3 pr-5 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {PAGE_KEYS.map((k) => {
              const sw = personSwitchCells({ u: user, page: k, overrides, setPerson, saving });
              const v = verdict(sw.state);
              return (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-2 pl-5 pr-3">
                    {PAGE_ACCESS[k].title}
                    {LOCKED_PAGES.has(k) && <Lock className="inline h-3 w-3 ml-1.5 text-muted-foreground" aria-label="Fixed" />}
                  </td>
                  <td className="py-2 px-3 text-center">{sw.menu}</td>
                  <td className="py-2 px-3 text-center">{sw.route}</td>
                  <td className={cn("py-2 pl-3 pr-5 text-xs whitespace-nowrap", v === "menu-blocked" && "text-destructive", v === "url-only" && "text-warning", v === "none" && "text-muted-foreground")}>{VERDICT_LABEL[v]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PageEditor({ users, overrides, pageKey, setPageKey, pageOptions, setPerson, setRole, saving }: {
  users: PortalUser[]; overrides: AccessOverrides; pageKey: string; setPageKey: (k: string) => void;
  pageOptions: { key: string; title: string }[]; setPerson: SetPerson; setRole: SetRole; saving: boolean;
}) {
  const def = PAGE_ACCESS[pageKey];
  const locked = LOCKED_PAGES.has(pageKey);
  const canOpenCount = users.filter((u) => canOpenPage(pageKey, u.role, u.email, overrides) && (def.route ?? true)).length;

  const roleRows = PROFILES.map((profile) => {
    const rep = REPRESENTATIVE[profile];
    const existing = overrides.roleOverrides.find((o) => o.page_key === pageKey && o.profile === profile);
    // What a person of this profile gets, ignoring individual changes.
    const noPeople: AccessOverrides = { ...overrides, userOverrides: [] };
    const inheritedFrom = (half: AccessHalf): boolean => {
      const without: AccessOverrides = { ...noPeople, roleOverrides: noPeople.roleOverrides.map((o) => (o.page_key === pageKey && o.profile === profile ? { ...o, [half]: null } : o)) };
      // The profile only applies to people who HAVE that profile, so evaluate as one.
      const withProfile: AccessOverrides = { ...without, profiles: { ...without.profiles, ...(rep.email ? { [rep.email]: profile } : {}) } };
      return half === "menu" ? menuKeysFor(rep.role, rep.email, withProfile).has(pageKey) : canOpenPage(pageKey, rep.role, rep.email, withProfile);
    };
    const current = (half: AccessHalf): boolean => {
      const withProfile: AccessOverrides = { ...noPeople, profiles: { ...noPeople.profiles, ...(rep.email ? { [rep.email]: profile } : {}) } };
      return half === "menu" ? menuKeysFor(rep.role, rep.email, withProfile).has(pageKey) : canOpenPage(pageKey, rep.role, rep.email, withProfile);
    };
    return { profile, existing, inheritedFrom, current };
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 space-y-2">
          <select value={pageKey} onChange={(e) => setPageKey(e.target.value)} className="h-9 w-full sm:w-96 rounded-md border bg-card px-3 text-sm" aria-label="Choose a page">
            {pageOptions.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">
            {def.title}: {canOpenCount} of {users.length} people can open it.
            {!def.menu && " This page never appears in the menu - it's reached from other pages."}
            {locked && " This page is fixed and can't be changed."}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Default for each role</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y bg-muted/30">
                <th className="py-2 pl-5 pr-3 font-medium">Role</th>
                <th className="py-2 px-3 font-medium text-center">In menu</th>
                <th className="py-2 px-3 font-medium text-center">Can open</th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map(({ profile, existing, inheritedFrom, current }) => (
                <tr key={profile} className="border-b last:border-0">
                  <td className="py-2 pl-5 pr-3"><RoleBadge profile={profile} /></td>
                  {(["menu", "route"] as AccessHalf[]).map((half) => (
                    <td key={half} className="py-2 px-3 text-center">
                      {hasHalf(pageKey, half) ? (
                        <AccessSwitch
                          checked={current(half)}
                          custom={existing?.[half] !== null && existing?.[half] !== undefined}
                          disabled={locked || saving}
                          label={`${HALF_LABEL[half]} for ${PROFILE_LABEL[profile]}`}
                          onReset={() => setRole(profile, pageKey, half, null)}
                          onToggle={(v) => setRole(profile, pageKey, half, v === inheritedFrom(half) ? null : v)}
                        />
                      ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-2 text-[11px] text-muted-foreground">These show a typical person in each role. A switch marked <RotateCcw className="inline h-3 w-3 text-warning" /> has been changed from the built-in default; click it to put it back. Changes for one person (below) win over these.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 max-h-[560px] overflow-auto">
          <p className="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">People</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y bg-muted/30 sticky top-0">
                <th className="py-2 pl-5 pr-3 font-medium">Person</th>
                <th className="py-2 px-3 font-medium">Role</th>
                <th className="py-2 px-3 font-medium text-center">In menu</th>
                <th className="py-2 px-3 font-medium text-center">Can open</th>
                <th className="py-2 pl-3 pr-5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const sw = personSwitchCells({ u, page: pageKey, overrides, setPerson, saving });
                const v = verdict(sw.state);
                return (
                  <tr key={u.user_id} className="border-b last:border-0">
                    <td className="py-2 pl-5 pr-3"><span className="font-medium">{u.full_name || u.email}</span>{u.full_name && <span className="block text-xs text-muted-foreground">{u.email}</span>}</td>
                    <td className="py-2 px-3"><RoleBadge profile={u.profile} /></td>
                    <td className="py-2 px-3 text-center">{sw.menu}</td>
                    <td className="py-2 px-3 text-center">{sw.route}</td>
                    <td className={cn("py-2 pl-3 pr-5 text-xs whitespace-nowrap", v === "menu-blocked" && "text-destructive", v === "url-only" && "text-warning", v === "none" && "text-muted-foreground")}>{VERDICT_LABEL[v]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

