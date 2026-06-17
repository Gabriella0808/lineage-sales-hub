import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useCrmAccount, useCrmReps, useUpdateAccount, useStageHistory, useAccountNotes, useAddNote, useDeleteNote, ACCOUNT_TYPES, BRANDS, type AccountType, type Brand, type CrmAccount } from "@/hooks/useCrm";
import { ProspectTypeSelect } from "@/components/ProspectTypeSelect";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Phone, Mail, Globe, MapPin, Save, ClipboardList, History, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function CrmAccountDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: account, isLoading } = useCrmAccount(id);
  const { data: reps = [] } = useCrmReps();
  const { data: history = [] } = useStageHistory(id);
  const { data: notes = [] } = useAccountNotes(id);
  const update = useUpdateAccount();
  const addNote = useAddNote();
  const deleteNote = useDeleteNote();

  const [form, setForm] = useState<Partial<CrmAccount> | null>(null);
  const [newNote, setNewNote] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => { if (account) setForm(account); }, [account]);

  if (isLoading || !form || !account) return <div className="p-8 text-muted-foreground">Loading--¦</div>;

  const type = ACCOUNT_TYPES.find((s) => s.id === (form.account_type ?? "prospect"))!;
  const repName = reps.find((r) => r.id === form.assigned_rep_id)?.name ?? "Unassigned";

  const save = () => {
    update.mutate(
      { id: account.id, patch: form },
      { onSuccess: () => toast({ title: "Account updated" }) }
    );
  };

  const confirmConvert = () => {
    update.mutate(
      { id: account.id, patch: { account_type: "dealer" as AccountType } },
      {
        onSuccess: async () => {
          toast({ title: "Converted to dealer", description: `${account.company_name} was added to the Field Check-ins map and will show as never visited until a check-in is logged.` });
          try {
            const { data: dealerRow } = await supabase
              .from("dealers")
              .select("id, lat")
              .eq("crm_account_id", account.id)
              .maybeSingle();
            if (dealerRow?.id && dealerRow.lat == null) {
              await supabase.functions.invoke("geocode-dealer", { body: { dealer_id: dealerRow.id } });
            }
          } catch (err) {
            console.warn("geocode-dealer failed", err);
          }
          nav("/crm/accounts");
        },
        onError: (e: any) => toast({ title: "Conversion failed", description: e.message, variant: "destructive" }),
      },
    );
    setConvertOpen(false);
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
        subtitle={[account.city, account.state].filter(Boolean).join(", ") || "---"}
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${type.dot}`} />
            {type.label}
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Account Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company name"><Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field label="Account type">
              <Select
                value={(form.account_type as string) ?? "prospect"}
                onValueChange={(v) => {
                  if (v === "dealer" && account.account_type !== "dealer") setConvertOpen(true);
                  else set("account_type", v as AccountType);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACCOUNT_TYPES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Prospect type">
              <ProspectTypeSelect
                value={(form.prospect_type as string | null) ?? null}
                onChange={(v) => set("prospect_type", v as any)}
              />
            </Field>
            <Field label="Brand">
              <Select value={(form.brand as string) ?? "Cabinet Beds"} onValueChange={(v) => set("brand", v as Brand)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
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
              <Button onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1.5" />{update.isPending ? "Saving--¦" : "Save changes"}</Button>
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
                <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a follow-up note--¦" rows={2} />
                <Button size="sm" disabled={!newNote.trim() || addNote.isPending} onClick={() => addNote.mutate({ accountId: account.id, body: newNote }, { onSuccess: () => setNewNote("") })}>Add note</Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notes.map((n: any) => (
                  <div key={n.id} className="text-xs border-l-2 border-accent/40 pl-2 py-1 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-foreground">{n.body}</div>
                      {n.created_by === user?.id && (
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => deleteNote.mutate({ id: n.id, accountId: account.id })}
                          disabled={deleteNote.isPending}
                          title="Delete note"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
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
                  <span className="text-muted-foreground">{h.from_stage ? `${h.from_stage} -†’ ${h.to_stage}` : `Set to ${h.to_stage}`}</span>
                  <span className="text-muted-foreground/70 tabular-nums">{formatDistanceToNow(new Date(h.changed_at), { addSuffix: true })}</span>
                </div>
              ))}
              {history.length === 0 && <div className="text-[11px] text-muted-foreground italic">No history.</div>}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert {account.company_name} to a dealer?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks them as a dealer and adds them to the Field Check-ins map. They will show as never visited until someone logs a check-in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConvert}>Convert to dealer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
