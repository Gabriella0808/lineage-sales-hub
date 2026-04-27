import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, UserCog, Users, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string;
  roles: AppRole[];
  manager_id: string | null;
  rep_id: string | null;
}

interface ManagerOpt { id: string; name: string }
interface RepOpt { id: string; name: string }

export default function SettingsPage() {
  const { data: roleInfo } = useUserRole();
  const isAdmin = roleInfo?.isAdmin === true;

  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your portal preferences{isAdmin && " and team access"}</p>
      </div>

      <Card className="mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Your access
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>Role: <Badge variant="secondary" className="capitalize">{roleInfo?.role ?? "—"}</Badge></p>
          {roleInfo?.managerId && <p className="text-xs text-muted-foreground">Linked manager record: {roleInfo.managerId}</p>}
          {roleInfo?.repId && <p className="text-xs text-muted-foreground">Linked rep record: {roleInfo.repId}</p>}
        </CardContent>
      </Card>

      <ChangePasswordPanel />

      {isAdmin && <RoleAdminPanel />}

      <Card className="mb-5">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Data Integration</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Acctivate SQL Server</span>
            <span className="text-xs bg-success/10 text-success px-2.5 py-0.5 rounded-full font-medium">Connected</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Sync Method</span>
            <span className="font-medium">Local Node.js script → Backend</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-muted-foreground">Data</span>
            <span className="font-medium">Sales Reps, Territories, Dealers</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChangePasswordPanel() {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword.length > 72) {
      toast({ title: "Password too long", description: "Use 72 characters or fewer.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please re-enter your new password.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't update password", description: error.message, variant: "destructive" });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast({ title: "Password updated", description: "Your password has been changed." });
  };

  return (
    <Card className="mb-5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Change password
        </CardTitle>
        <p className="text-xs text-muted-foreground">Update the password used to sign in to your account.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
            />
          </div>
          <Button type="submit" disabled={submitting} size="sm">
            {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>) : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RoleAdminPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [managers, setManagers] = useState<ManagerOpt[]>([]);
  const [reps, setReps] = useState<RepOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, umRes, urRes, mgrRes, repRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_managers").select("user_id, manager_id"),
      supabase.from("user_reps").select("user_id, rep_id"),
      supabase.from("managers").select("id, name").order("name"),
      supabase.from("sales_reps").select("id, name").order("name"),
    ]);

    // Get emails from sign_in_log (admins can read it) — fallback to profiles only
    const { data: emails } = await supabase
      .from("sign_in_log")
      .select("user_id")
      .order("signed_in_at", { ascending: false });
    // Note: emails for users live in auth.users which we can't query directly from client.
    // We'll show full_name + first email partial via profile. Admins can identify users by name.

    const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p.full_name]));
    const rolesMap = new Map<string, AppRole[]>();
    (rolesRes.data ?? []).forEach((r) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesMap.set(r.user_id, arr);
    });
    const umMap = new Map((umRes.data ?? []).map((r) => [r.user_id, r.manager_id]));
    const urMap = new Map((urRes.data ?? []).map((r) => [r.user_id, r.rep_id]));

    const allUserIds = new Set<string>([
      ...profilesMap.keys(),
      ...rolesMap.keys(),
      ...umMap.keys(),
      ...urMap.keys(),
    ]);

    const rows: UserRow[] = Array.from(allUserIds).map((uid) => ({
      user_id: uid,
      full_name: profilesMap.get(uid) ?? null,
      email: "",
      roles: rolesMap.get(uid) ?? [],
      manager_id: umMap.get(uid) ?? null,
      rep_id: urMap.get(uid) ?? null,
    })).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

    setUsers(rows);
    setManagers((mgrRes.data ?? []) as ManagerOpt[]);
    setReps((repRes.data ?? []) as RepOpt[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setRole = async (userId: string, role: AppRole) => {
    setSavingId(userId);
    // Replace all roles for this user with the chosen one
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (!delErr) {
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (insErr) toast({ title: "Failed to set role", description: insErr.message, variant: "destructive" });
    }
    setSavingId(null);
    load();
  };

  const linkManager = async (userId: string, managerId: string | null) => {
    setSavingId(userId);
    if (!managerId) {
      await supabase.from("user_managers").delete().eq("user_id", userId);
    } else {
      await supabase.from("user_managers").upsert({ user_id: userId, manager_id: managerId });
    }
    setSavingId(null);
    load();
  };

  const linkRep = async (userId: string, repId: string | null) => {
    setSavingId(userId);
    if (!repId) {
      await supabase.from("user_reps").delete().eq("user_id", userId);
    } else {
      await supabase.from("user_reps").upsert({ user_id: userId, rep_id: repId });
    }
    setSavingId(null);
    load();
  };

  return (
    <Card className="mb-5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" /> Team access (admin)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Assign each user a role and link them to their manager or rep record.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">User</th>
                  <th className="py-2">Role</th>
                  <th className="py-2">Manager link</th>
                  <th className="py-2">Rep link</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const currentRole: AppRole = u.roles.includes("admin")
                    ? "admin"
                    : u.roles.includes("manager")
                      ? "manager"
                      : u.roles.includes("rep")
                        ? "rep"
                        : (u.manager_id ? "manager" : u.rep_id ? "rep" : "rep");
                  const busy = savingId === u.user_id;
                  return (
                    <tr key={u.user_id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.full_name ?? "Unnamed user"}</p>
                            <p className="text-[11px] text-muted-foreground truncate font-mono">{u.user_id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Select value={currentRole} onValueChange={(v: AppRole) => setRole(u.user_id, v)} disabled={busy}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="rep">Rep</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-3">
                        <Select
                          value={u.manager_id ?? "none"}
                          onValueChange={(v) => linkManager(u.user_id, v === "none" ? null : v)}
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-44"><SelectValue placeholder="No manager link" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— No link —</SelectItem>
                            {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2">
                        <Select
                          value={u.rep_id ?? "none"}
                          onValueChange={(v) => linkRep(u.user_id, v === "none" ? null : v)}
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-44"><SelectValue placeholder="No rep link" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— No link —</SelectItem>
                            {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground mt-3">
              Changes take effect immediately. Users may need to refresh to see new permissions.
            </p>
            <Button variant="ghost" size="sm" onClick={load} className="mt-2">Refresh</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
