import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useCrmAccount, useCrmReps, useUpdateAccount, useStageHistory, useAccountNotes, useAddNote, LIFECYCLE_STAGES, type LifecycleStage, type CrmAccount } from "@/hooks/useCrm";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Phone, Mail, Globe, MapPin, Save, ClipboardList, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function CrmAccountDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const { data: account, isLoading } = useCrmAccount(id);
  const { data: reps = [] } = useCrmReps();
  const { data: history = [] } = useStageHistory(id);
  const { data: notes = [] } = useAccountNotes(id);
  const update = useUpdateAccount();
  const addNote = useAddNote();

  const [form, setForm] = useState<Partial<CrmAccount> | null>(null);
  const [newNote, setNewNote] = useState("");

  useEffect(() => { if (account) setForm(account); }, [account]);

  if (isLoading || !form || !account) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const stage = LIFECYCLE_STAGES.find((s) => s.id === form.lifecycle_stage)!;
  const repName = reps.find((r) => r.id === form.assigned_rep_id)?.name ?? "Unassigned";

  const save = () => {
    update.mutate(
      { id: account.id, patch: form },
      { onSuccess: () => toast({ title: "Account updated" }) }
    );
  };

  const set = <K extends keyof CrmAccount>(k: K, v: CrmAccount[K]) => setForm((f) => ({ ...(f ?? {}), [k]: v }));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav("/crm/accounts")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      </div>
      <PageHeader
        eyebrow={repName}
        title={account.company_name}
        subtitle={[account.city, account.state].filter(Boolean).join(", ") || "—"}
        actions={<Badge variant="outline" className={`text-xs border ${stage.color}`}>{stage.label}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Account Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company name"><Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field label="Lifecycle stage">
              <Select value={form.lifecycle_stage as string} onValueChange={(v) => set("lifecycle_stage", v as LifecycleStage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LIFECYCLE_STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Assigned rep">
              <Select value={form.assigned_rep_id ?? "none"} onValueChange={(v) => set("assigned_rep_id", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status ?? "active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="follow_up">Needs follow-up</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contact first name"><Input value={form.contact_first_name ?? ""} onChange={(e) => set("contact_first_name", e.target.value)} /></Field>
            <Field label="Contact last name"><Input value={form.contact_last_name ?? ""} onChange={(e) => set("contact_last_name", e.target.value)} /></Field>
            <Field label="Main phone"><Input value={form.main_phone ?? ""} onChange={(e) => set("main_phone", e.target.value)} /></Field>
            <Field label="Email"><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Website"><Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} /></Field>
            <Field label="Street"><Input value={form.street_1 ?? ""} onChange={(e) => set("street_1", e.target.value)} /></Field>
            <Field label="City"><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State"><Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} /></Field>
              <Field label="Zip"><Input value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} /></Field>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1.5" />{update.isPending ? "Saving…" : "Save changes"}</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {form.main_phone && <Button asChild variant="outline" className="w-full justify-start"><a href={`tel:${form.main_phone}`}><Phone className="h-4 w-4 mr-2" />{form.main_phone}</a></Button>}
              {form.email && <Button asChild variant="outline" className="w-full justify-start"><a href={`mailto:${form.email}`}><Mail className="h-4 w-4 mr-2" />{form.email}</a></Button>}
              {form.website && <Button asChild variant="outline" className="w-full justify-start"><a href={form.website} target="_blank" rel="noreferrer"><Globe className="h-4 w-4 mr-2" />Visit website</a></Button>}
              {(form.street_1 || form.city) && <Button asChild variant="outline" className="w-full justify-start"><a href={`https://maps.google.com/?q=${encodeURIComponent([form.street_1, form.city, form.state, form.zip].filter(Boolean).join(", "))}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4 mr-2" />Open in Maps</a></Button>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4" />Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a follow-up note…" rows={2} />
                <Button size="sm" disabled={!newNote.trim() || addNote.isPending} onClick={() => addNote.mutate({ accountId: account.id, body: newNote }, { onSuccess: () => setNewNote("") })}>Add note</Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notes.map((n: any) => (
                  <div key={n.id} className="text-xs border-l-2 border-accent/40 pl-2 py-1">
                    <div className="text-foreground">{n.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
                  </div>
                ))}
                {notes.length === 0 && <div className="text-[11px] text-muted-foreground italic">No notes yet.</div>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" />Stage History</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {history.map((h: any) => (
                <div key={h.id} className="text-[11px] flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{h.from_stage ? `${h.from_stage} → ${h.to_stage}` : `Set to ${h.to_stage}`}</span>
                  <span className="text-muted-foreground/70 tabular-nums">{formatDistanceToNow(new Date(h.changed_at), { addSuffix: true })}</span>
                </div>
              ))}
              {history.length === 0 && <div className="text-[11px] text-muted-foreground italic">No history.</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
