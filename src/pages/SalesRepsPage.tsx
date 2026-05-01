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
  acctivate_id: string;
  email: string;
  manager_id: string | null;
  territory_ids: string[];
  status: string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on-leave", label: "On Leave" },
];

interface TerritoryOpt { id: string; name: string; acctivate_id: string | null; }

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
  // Hide territories whose code looks like a raw UUID/hex string (letter+number jumble)
  const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
  const filteredOptions = options.filter(o => !o.acctivate_id || !UUID_RE.test(o.acctivate_id));

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
            .map(o => o!.acctivate_id || o!.name)
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
          {filteredOptions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No territories available</div>
          )}
          {filteredOptions.map(t => {
            const selected = value.includes(t.id);
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => toggle(t.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
              >
                <Checkbox checked={selected} className="pointer-events-none" />
                <span className="flex-1 truncate">
                  {t.acctivate_id ? (
                    <>
                      <span className="font-medium">{t.acctivate_id}</span>
                      <span className="text-muted-foreground"> · {t.name}</span>
                    </>
                  ) : (
                    t.name
                  )}
                </span>
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

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RepEditState | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRep, setNewRep] = useState<RepEditState>({
    name: "", acctivate_id: "", email: "", manager_id: null, territory_ids: [], status: "active",
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
      acctivate_id: r.acctivate_id ?? "",
      email: r.email ?? "",
      manager_id: r.manager_id,
      territory_ids: repTerritoryIds(repId),
      status: r.status,
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
    const { error } = await supabase.from("sales_reps").update({
      name: editForm.name.trim(),
      acctivate_id: editForm.acctivate_id.trim() || null,
      email: editForm.email.trim() || null,
      manager_id: editForm.manager_id,
      status: editForm.status,
    }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }

    // Sync rep_territories — replace with the selected set
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
    const { data, error } = await supabase.from("sales_reps").insert({
      name: newRep.name.trim(),
      acctivate_id: newRep.acctivate_id.trim() || null,
      email: newRep.email.trim() || null,
      manager_id: newRep.manager_id,
      status: newRep.status,
    }).select("id").single();
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    if (newRep.territory_ids.length > 0) {
      await supabase.from("rep_territories").insert(newRep.territory_ids.map(tid => ({ rep_id: data.id, territory_id: tid })));
    }
    toast.success("Rep added");
    setAddOpen(false);
    setNewRep({ name: "", acctivate_id: "", email: "", manager_id: null, territory_ids: [], status: "active" });
    invalidate();
  };

  const filtered = reps.filter(r => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const managerEmail = (mid: string | null) => managers.find(m => m.id === mid)?.email ?? "—";
  const territoryName = (tid: string | null) => territories.find(t => t.id === tid)?.name ?? "—";
  const territoryCode = (tid: string | null) => territories.find(t => t.id === tid)?.acctivate_id ?? "—";

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
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Sales Rep Database</h1>
          <p className="page-subtitle">{reps.length} reps • inline edit any field</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
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

      <div className="table-container">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium text-muted-foreground">Rep</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Rep Code</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Territory Code</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Rep Email</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Manager</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Manager Email</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
              <th className="text-right p-3 font-medium text-muted-foreground w-28">Actions</th>
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

                  {/* Rep code */}
                  <td className="p-3">
                    {isEditing ? (
                      <Input value={editForm!.acctivate_id} onChange={e => setEditForm({ ...editForm!, acctivate_id: e.target.value })} className="h-8 w-24" />
                    ) : (
                      <span className="text-muted-foreground">{r.acctivate_id || "—"}</span>
                    )}
                  </td>

                  {/* Territory code(s) — editable multi-select */}
                  <td className="p-3">
                    {isEditing ? (
                      <TerritoryMultiSelect
                        options={territories}
                        value={editForm!.territory_ids}
                        onChange={(next) => setEditForm({ ...editForm!, territory_ids: next })}
                        placeholder="Select territories"
                        triggerClassName="h-8 w-44 text-xs"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {tids.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          tids.map(id => (
                            <Badge key={id} variant="outline" className="font-normal text-[11px]">
                              {territories.find(t => t.id === id)?.acctivate_id ?? "—"}
                            </Badge>
                          ))
                        )}
                      </div>
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <Input value={editForm!.email} onChange={e => setEditForm({ ...editForm!, email: e.target.value })} className="h-8" />
                    ) : (
                      <span className="text-primary">{r.email || "—"}</span>
                    )}
                  </td>

                  {/* Manager (name) */}
                  <td className="p-3">
                    {isEditing ? (
                      <Select value={editForm!.manager_id ?? "none"} onValueChange={v => setEditForm({ ...editForm!, manager_id: v === "none" ? null : v })}>
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Manager" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-foreground">{managers.find(m => m.id === r.manager_id)?.name ?? "—"}</span>
                    )}
                  </td>

                  {/* Manager email */}
                  <td className="p-3 hidden lg:table-cell">
                    <span className="text-muted-foreground text-xs">{managerEmail(r.manager_id)}</span>
                  </td>

                  {/* Region(s) — derived from selected territories */}
                  <td className="p-3">
                    {isEditing ? (
                      <span className="text-xs text-muted-foreground">
                        {editForm!.territory_ids.length === 0
                          ? "—"
                          : editForm!.territory_ids.map(id => territories.find(t => t.id === id)?.name).filter(Boolean).join(", ")}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {tids.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          tids.map(id => (
                            <Badge key={id} variant="secondary" className="font-normal">
                              {territories.find(t => t.id === id)?.name ?? "—"}
                            </Badge>
                          ))
                        )}
                      </div>
                    )}
                  </td>



                  {/* Actions */}
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(r.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRep(r.id, r.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <div><Label>Rep Code</Label><Input value={newRep.acctivate_id} onChange={e => setNewRep({ ...newRep, acctivate_id: e.target.value })} /></div>
            <div><Label>Rep Email</Label><Input type="email" value={newRep.email} onChange={e => setNewRep({ ...newRep, email: e.target.value })} /></div>
            <div>
              <Label>Manager Email</Label>
              <Select value={newRep.manager_id ?? "none"} onValueChange={v => setNewRep({ ...newRep, manager_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.email || m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Territories / Regions</Label>
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
                <SelectContent>
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
