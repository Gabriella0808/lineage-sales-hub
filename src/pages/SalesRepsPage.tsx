import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FilterBar } from "@/components/FilterBar";
import { useSalesReps, useTerritories, useManagers, useRepTerritories, getInitials } from "@/hooks/usePortalData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface RepEditState {
  name: string;
  email: string;
  phone: string;
  manager_id: string | null;
  territory_ids: string[];
  status: string;
  quota: string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on-leave", label: "On Leave" },
];

interface TerritoryOpt { id: string; name: string }

function TerritoryMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select territories",
  triggerClassName = "",
}: {
  options: TerritoryOpt[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  triggerClassName?: string;
}) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  };
  const labelText =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value
            .map(id => options.find(o => o.id === id))
            .filter(Boolean)
            .map(o => o!.name)
            .join(", ")
        : `${value.length} selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`justify-between font-normal ${triggerClassName}`}
        >
          <span className={value.length === 0 ? "text-muted-foreground" : ""}>{labelText}</span>
          <ChevronDown className="h-4 w-4 opacity-60 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="max-h-64 overflow-y-auto py-1">
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No territories available</div>
          )}
          {options.map(t => {
            const selected = value.includes(t.id);
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => toggle(t.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
              >
                <Checkbox checked={selected} className="pointer-events-none" />
                <span className="flex-1 truncate">{t.name}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SalesRepsPage() {
  const qc = useQueryClient();
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: managers = [] } = useManagers();
  const { data: repTerritories = [] } = useRepTerritories();

  // Deduplicate managers by first-name token, keeping the entry with the longest (full) name.
  // Build a map from every original manager id -†’ preferred (deduped) manager id.
  const { displayManagers, managerIdMap } = (() => {
    const groups = new Map<string, typeof managers>();
    for (const m of managers) {
      const key = (m.name || "").trim().toLowerCase().split(/\s+/)[0] || m.id;
      if (!groups.has(key)) groups.set(key, [] as any);
      (groups.get(key) as any).push(m);
    }
    const preferred: typeof managers = [];
    const idMap = new Map<string, string>();
    for (const group of groups.values()) {
      const best = [...group].sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0))[0];
      preferred.push(best);
      for (const m of group) idMap.set(m.id, best.id);
    }
    preferred.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return { displayManagers: preferred, managerIdMap: idMap };
  })();
  const resolveMgr = (mid: string | null) => (mid ? displayManagers.find(m => m.id === (managerIdMap.get(mid) ?? mid)) : undefined);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RepEditState | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRep, setNewRep] = useState<RepEditState>({
    name: "", email: "", phone: "", manager_id: null, territory_ids: [], status: "active", quota: "",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sales_reps"] });
    qc.invalidateQueries({ queryKey: ["rep_territories"] });
    qc.invalidateQueries({ queryKey: ["territories"] });
    qc.invalidateQueries({ queryKey: ["managers"] });
  };

  const repTerritoryIds = (repId: string): string[] => {
    return repTerritories.filter(rt => rt.rep_id === repId).map(rt => rt.territory_id);
  };

  const startEdit = (repId: string) => {
    const r = reps.find(x => x.id === repId);
    if (!r) return;
    setEditingId(repId);
    setEditForm({
      name: r.name,
      email: r.email ?? "",
      phone: r.phone ?? "",
      manager_id: r.manager_id,
      territory_ids: repTerritoryIds(repId),
      status: r.status,
      quota: r.quota != null ? String(r.quota) : "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    if (!editForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const quotaNum = editForm.quota.trim() === "" ? null : Number(editForm.quota);
    if (quotaNum !== null && Number.isNaN(quotaNum)) {
      toast.error("Quota must be a number");
      return;
    }
    const { error } = await supabase.from("sales_reps").update({
      name: editForm.name.trim(),
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      manager_id: editForm.manager_id,
      status: editForm.status,
      quota: quotaNum,
    }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }

    // Sync rep_territories - replace with the selected set
    const currentIds = repTerritoryIds(editingId);
    const desiredIds = editForm.territory_ids;
    const toRemove = currentIds.filter(id => !desiredIds.includes(id));
    const toAdd = desiredIds.filter(id => !currentIds.includes(id));
    if (toRemove.length > 0) {
      await supabase.from("rep_territories").delete().eq("rep_id", editingId).in("territory_id", toRemove);
    }
    if (toAdd.length > 0) {
      await supabase.from("rep_territories").insert(toAdd.map(tid => ({ rep_id: editingId, territory_id: tid })));
    }
    toast.success("Rep updated");
    cancelEdit();
    invalidate();
  };

  const deleteRep = async (repId: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await supabase.from("rep_territories").delete().eq("rep_id", repId);
    const { error } = await supabase.from("sales_reps").delete().eq("id", repId);
    if (error) { toast.error(error.message); return; }
    toast.success("Rep removed");
    invalidate();
  };

  const addRep = async () => {
    if (!newRep.name.trim()) { toast.error("Name is required"); return; }
    const quotaNum = newRep.quota.trim() === "" ? null : Number(newRep.quota);
    if (quotaNum !== null && Number.isNaN(quotaNum)) { toast.error("Quota must be a number"); return; }
    const { data, error } = await supabase.from("sales_reps").insert({
      name: newRep.name.trim(),
      email: newRep.email.trim() || null,
      phone: newRep.phone.trim() || null,
      manager_id: newRep.manager_id,
      status: newRep.status,
      quota: quotaNum,
    }).select("id").single();
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    if (newRep.territory_ids.length > 0) {
      await supabase.from("rep_territories").insert(newRep.territory_ids.map(tid => ({ rep_id: data.id, territory_id: tid })));
    }
    toast.success("Rep added");
    setAddOpen(false);
    setNewRep({ name: "", email: "", phone: "", manager_id: null, territory_ids: [], status: "active", quota: "" });
    invalidate();
  };

  const filtered = reps.filter(r => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const managerEmail = (mid: string | null) => resolveMgr(mid)?.email ?? "-";

  if (repsLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Sales Rep Database</h1>
          <p className="page-subtitle">{reps.length} reps --¢ inline edit any field</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Add Rep
        </Button>
      </div>

      <FilterBar
        searchPlaceholder="Search reps..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          { label: "Status", value: statusFilter, onChange: setStatusFilter, options: STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value })) },
        ]}
      />

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {filtered.map(r => {
          const isEditing = editingId === r.id;
          const tids = repTerritoryIds(r.id);
          if (isEditing) {
            return (
              <div key={r.id} className="glass-card p-3 space-y-2">
                <Input value={editForm!.name} onChange={e => setEditForm({ ...editForm!, name: e.target.value })} placeholder="Name" className="h-9" />
                <TerritoryMultiSelect
                  options={territories}
                  value={editForm!.territory_ids}
                  onChange={(next) => setEditForm({ ...editForm!, territory_ids: next })}
                  placeholder="Territories"
                  triggerClassName="h-9 w-full text-xs"
                />
                <Input value={editForm!.email} onChange={e => setEditForm({ ...editForm!, email: e.target.value })} placeholder="Email" className="h-9" />
                <Input value={editForm!.phone} onChange={e => setEditForm({ ...editForm!, phone: e.target.value })} placeholder="Phone" className="h-9" />
                <Input value={editForm!.quota} onChange={e => setEditForm({ ...editForm!, quota: e.target.value })} placeholder="Quota" type="number" className="h-9" />
                <Select value={(editForm!.manager_id && (managerIdMap.get(editForm!.manager_id) ?? editForm!.manager_id)) ?? "none"} onValueChange={v => setEditForm({ ...editForm!, manager_id: v === "none" ? null : v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Manager" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">--- None ---</SelectItem>
                    {displayManagers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={editForm!.status} onValueChange={v => setEditForm({ ...editForm!, status: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1" onClick={saveEdit}><Check className="h-4 w-4 mr-1" /> Save</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={cancelEdit}><X className="h-4 w-4 mr-1" /> Cancel</Button>
                </div>
              </div>
            );
          }
          return (
            <div key={r.id} className="glass-card p-3">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground shrink-0">
                  {getInitials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-tight">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email || "-"}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(r.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRep(r.id, r.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Manager</p>
                  <p className="truncate">{resolveMgr(r.manager_id)?.name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Phone</p>
                  <p className="truncate">{r.phone || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">Territories</p>
                  <div className="flex flex-wrap gap-1">
                    {tids.length === 0 ? <span className="text-muted-foreground">-</span> :
                      tids.map(id => (
                        <Badge key={id} variant="secondary" className="font-normal text-[10px]">
                          {territories.find(t => t.id === id)?.name ?? "-"}
                        </Badge>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No reps match your filters.</p>}
      </div>

      <div className="table-container hidden lg:block overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Rep Email</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Manager</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Manager Email</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Territories</th>
              <th className="text-right p-2 pr-2 font-medium text-muted-foreground w-20 sticky right-0 bg-muted/30 z-10">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const isEditing = editingId === r.id;
              const tids = repTerritoryIds(r.id);
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  {/* Rep name */}
                  <td className="p-3">
                    {isEditing ? (
                      <Input value={editForm!.name} onChange={e => setEditForm({ ...editForm!, name: e.target.value })} className="h-8" />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground shrink-0">
                          {getInitials(r.name)}
                        </div>
                        <span className="font-medium">{r.name}</span>
                      </div>
                    )}
                  </td>

                  {/* Email */}
                  <td className="p-3">
                    {isEditing ? (
                      <Input value={editForm!.email} onChange={e => setEditForm({ ...editForm!, email: e.target.value })} className="h-8" />
                    ) : (
                      <span className="text-primary">{r.email || "-"}</span>
                    )}
                  </td>

                  {/* Manager */}
                  <td className="p-3">
                    {isEditing ? (
                      <Select value={(editForm!.manager_id && (managerIdMap.get(editForm!.manager_id) ?? editForm!.manager_id)) ?? "none"} onValueChange={v => setEditForm({ ...editForm!, manager_id: v === "none" ? null : v })}>
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Manager" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="none">--- None ---</SelectItem>
                          {displayManagers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-foreground">{resolveMgr(r.manager_id)?.name ?? "-"}</span>
                    )}
                  </td>

                  {/* Manager email */}
                  <td className="p-3 hidden lg:table-cell">
                    <span className="text-muted-foreground text-xs">{managerEmail(r.manager_id)}</span>
                  </td>

                  {/* Territories (names only) */}
                  <td className="p-3">
                    {isEditing ? (
                      <TerritoryMultiSelect
                        options={territories}
                        value={editForm!.territory_ids}
                        onChange={(next) => setEditForm({ ...editForm!, territory_ids: next })}
                        placeholder="Select territories"
                        triggerClassName="h-8 w-48 text-xs"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {tids.length === 0 ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          tids.map(id => (
                            <Badge key={id} variant="secondary" className="font-normal">
                              {territories.find(t => t.id === id)?.name ?? "-"}
                            </Badge>
                          ))
                        )}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-2 sticky right-0 bg-background shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.1)] w-20">
                    <div className="flex items-center justify-end gap-0.5">
                      {isEditing ? (
                        <>
                          <Button size="icon" className="h-6 w-6" onClick={saveEdit} aria-label="Save"><Check className="h-3 w-3" /></Button>
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={cancelEdit} aria-label="Cancel"><X className="h-3 w-3" /></Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(r.id)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteRep(r.id, r.name)}><Trash2 className="h-3 w-3" /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No reps match your filters.</p>}
      </div>

      {/* Add Rep dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Sales Rep</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={newRep.name} onChange={e => setNewRep({ ...newRep, name: e.target.value })} /></div>
            <div><Label>Rep Email</Label><Input type="email" value={newRep.email} onChange={e => setNewRep({ ...newRep, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={newRep.phone} onChange={e => setNewRep({ ...newRep, phone: e.target.value })} /></div>
            <div><Label>Quota</Label><Input type="number" value={newRep.quota} onChange={e => setNewRep({ ...newRep, quota: e.target.value })} /></div>
            <div>
              <Label>Manager</Label>
              <Select value={newRep.manager_id ?? "none"} onValueChange={v => setNewRep({ ...newRep, manager_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">--- None ---</SelectItem>
                  {displayManagers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Territories</Label>
              <div className="mt-1.5">
                <TerritoryMultiSelect
                  options={territories}
                  value={newRep.territory_ids}
                  onChange={(next) => setNewRep({ ...newRep, territory_ids: next })}
                  placeholder="Select territories"
                  triggerClassName="w-full"
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={newRep.status} onValueChange={v => setNewRep({ ...newRep, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addRep}>Add Rep</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
