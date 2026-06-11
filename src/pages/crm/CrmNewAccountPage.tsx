import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateAccount, useCrmReps, useCrmManagers, BRANDS, type Brand } from "@/hooks/useCrm";
import { ProspectTypeSelect } from "@/components/ProspectTypeSelect";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function CrmNewAccountPage() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { data: reps = [] } = useCrmReps();
  const { data: managers = [] } = useCrmManagers();
  const create = useCreateAccount();
  const [f, setF] = useState({
    company_name: "",
    account_type: "prospect" as "prospect" | "dealer",
    prospect_type: null as string | null,
    brand: "Cabinet Beds" as Brand,
    assigned_rep_id: "none",
    assigned_manager_id: "none",
    contact_first_name: "",
    contact_last_name: "",
    main_phone: "",
    email: "",
    website: "",
    street_1: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.company_name.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    create.mutate(
      { ...f,
        assigned_rep_id: f.assigned_rep_id === "none" ? null : f.assigned_rep_id,
        assigned_manager_id: f.assigned_manager_id === "none" ? null : f.assigned_manager_id,
      } as any,
      {
        onSuccess: (acct) => {
          toast({ title: "Account created" });
          nav(`/crm/accounts/${acct.id}`);
        },
        onError: (e: any) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
      }
    );
  };

  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader eyebrow="CRM" title="New Account" subtitle="Add a new company to the pipeline." />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><L>Company name *</L><Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} required /></div>
            <div className="sm:col-span-2"><L>Brand</L>
              <Select value={f.brand} onValueChange={(v) => set("brand", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><L>Prospect type</L>
              <ProspectTypeSelect
                value={f.prospect_type}
                onChange={(v) => set("prospect_type", v)}
              />
            </div>
            <div><L>Assigned rep</L>
              <Select value={f.assigned_rep_id} onValueChange={(v) => {
                const rep = reps.find((r) => r.id === v);
                setF((p) => ({
                  ...p,
                  assigned_rep_id: v,
                  assigned_manager_id: rep?.manager_id ?? (v === "none" ? "none" : p.assigned_manager_id),
                }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><L>Assigned manager</L>
              <Select value={f.assigned_manager_id} onValueChange={(v) => set("assigned_manager_id", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><L>Contact first name</L><Input value={f.contact_first_name} onChange={(e) => set("contact_first_name", e.target.value)} /></div>
            <div><L>Contact last name</L><Input value={f.contact_last_name} onChange={(e) => set("contact_last_name", e.target.value)} /></div>
            <div><L>Main phone</L><Input value={f.main_phone} onChange={(e) => set("main_phone", e.target.value)} /></div>
            <div><L>Email</L><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="sm:col-span-2"><L>Website</L><Input value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></div>
            <div className="sm:col-span-2"><L>Street address</L><Input value={f.street_1} onChange={(e) => set("street_1", e.target.value)} /></div>
            <div><L>City</L><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><L>State</L><Input value={f.state} onChange={(e) => set("state", e.target.value)} maxLength={2} /></div>
              <div><L>Zip</L><Input value={f.zip} onChange={(e) => set("zip", e.target.value)} /></div>
            </div>
            <div className="sm:col-span-2"><L>Notes</L><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} /></div>
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => nav("/crm/accounts")}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create account"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const L = ({ children }: { children: React.ReactNode }) => (
  <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">{children}</Label>
);
