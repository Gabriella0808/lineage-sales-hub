import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Star, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Position = {
  id: string;
  title: string;
  holder_name: string | null;
  department: string | null;
  parent_id: string | null;
  job_description: string | null;
  main_objectives: string | null;
  position_order: number;
};

type Review = {
  id: string;
  position_id: string;
  review_year: number;
  reviewer_name: string | null;
  rating: number | null;
  strengths: string | null;
  areas_for_improvement: string | null;
  goals_next_year: string | null;
  notes: string | null;
  created_at: string;
};

const emptyPos = {
  title: "", holder_name: "", department: "",
  parent_id: null as string | null,
  job_description: "", main_objectives: "",
};

export default function OrgChartPage() {
  const { data: roleInfo } = useUserRole();
  const isAdmin = roleInfo?.role === "admin";

  const [positions, setPositions] = useState<Position[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editing, setEditing] = useState<Partial<Position> | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Partial<Review>>({
    review_year: new Date().getFullYear(),
    rating: 3,
  });
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("org_positions").select("*").order("position_order").order("title"),
      supabase.from("org_position_reviews").select("*").order("review_year", { ascending: false }),
    ]);
    setPositions((p ?? []) as Position[]);
    setReviews((r ?? []) as Review[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const byParent = useMemo(() => {
    const map = new Map<string | null, Position[]>();
    positions.forEach((p) => {
      const k = p.parent_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return map;
  }, [positions]);

  const selected = positions.find((p) => p.id === selectedId) ?? null;
  const selectedReviews = reviews.filter((r) => r.position_id === selectedId);

  const savePosition = async () => {
    if (!editing?.title?.trim()) { toast.error("Title required"); return; }
    const payload = {
      title: editing.title!.trim(),
      holder_name: editing.holder_name || null,
      department: editing.department || null,
      parent_id: editing.parent_id || null,
      job_description: editing.job_description || null,
      main_objectives: editing.main_objectives || null,
    };
    if (editing.id) {
      const { error } = await supabase.from("org_positions").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Position updated");
    } else {
      const { error } = await supabase.from("org_positions").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Position added");
    }
    setEditing(null);
    load();
  };

  const deletePosition = async (id: string) => {
    if (!confirm("Delete this position? Reviews will also be removed.")) return;
    const { error } = await supabase.from("org_positions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    if (selectedId === id) setSelectedId(null);
    load();
  };

  const saveReview = async () => {
    if (!selectedId) return;
    const payload = {
      position_id: selectedId,
      review_year: Number(reviewDraft.review_year) || new Date().getFullYear(),
      reviewer_name: reviewDraft.reviewer_name || null,
      rating: reviewDraft.rating ?? null,
      strengths: reviewDraft.strengths || null,
      areas_for_improvement: reviewDraft.areas_for_improvement || null,
      goals_next_year: reviewDraft.goals_next_year || null,
      notes: reviewDraft.notes || null,
    };
    if (editingReviewId) {
      const { error } = await supabase.from("org_position_reviews").update(payload).eq("id", editingReviewId);
      if (error) return toast.error(error.message);
      toast.success("Review updated");
    } else {
      const { error } = await supabase.from("org_position_reviews").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Review added");
    }
    setReviewOpen(false);
    setEditingReviewId(null);
    setReviewDraft({ review_year: new Date().getFullYear(), rating: 3 });
    load();
  };

  const deleteReview = async (id: string) => {
    if (!confirm("Delete this review?")) return;
    const { error } = await supabase.from("org_position_reviews").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Review deleted");
    load();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Building2 className="h-6 w-6" /> Org Chart</h1>
          <p className="page-subtitle">Click any position for job description, objectives, and yearly reviews.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setEditing({ ...emptyPos })}>
            <Plus className="h-4 w-4 mr-1" /> Add position
          </Button>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : positions.length === 0 ? (
        <Card><CardContent className="p-8 text-sm text-muted-foreground">
          No positions yet.{isAdmin && " Click 'Add position' to start."}
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto pb-4">
          <OrgTree
            roots={byParent.get(null) ?? []}
            byParent={byParent}
            onSelect={setSelectedId}
            selectedId={selectedId}
          />
        </div>
      )}

      {/* Position detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>
                  {selected.holder_name || "Vacant"}
                  {selected.department ? ` · ${selected.department}` : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-5">
                <Section title="Job description">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {selected.job_description || "—"}
                  </p>
                </Section>
                <Section title="Main objectives">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {selected.main_objectives || "—"}
                  </p>
                </Section>

                {isAdmin && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(selected)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deletePosition(selected.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Yearly reviews</h3>
                    {isAdmin && (
                      <Button size="sm" onClick={() => {
                        setEditingReviewId(null);
                        setReviewDraft({ review_year: new Date().getFullYear(), rating: 3 });
                        setReviewOpen(true);
                      }}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add review
                      </Button>
                    )}
                  </div>
                  {selectedReviews.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No reviews yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedReviews.map((r) => (
                        <Card key={r.id}>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{r.review_year}</span>
                                {r.reviewer_name && (
                                  <span className="text-xs text-muted-foreground">· {r.reviewer_name}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star key={i} className={cn(
                                    "h-3.5 w-3.5",
                                    i < (r.rating ?? 0) ? "fill-accent text-accent" : "text-muted-foreground/40"
                                  )} />
                                ))}
                              </div>
                            </div>
                            {r.strengths && <Field label="Strengths" value={r.strengths} />}
                            {r.areas_for_improvement && <Field label="Areas to improve" value={r.areas_for_improvement} />}
                            {r.goals_next_year && <Field label="Goals next year" value={r.goals_next_year} />}
                            {r.notes && <Field label="Notes" value={r.notes} />}
                            {isAdmin && (
                              <div className="flex gap-2 pt-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setEditingReviewId(r.id);
                                    setReviewDraft(r);
                                    setReviewOpen(true);
                                  }}>
                                  <Pencil className="h-3 w-3 mr-1" /> Edit
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                  onClick={() => deleteReview(r.id)}>
                                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Position editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit position" : "Add position"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Title *</Label>
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Holder name</Label>
                  <Input value={editing.holder_name ?? ""} onChange={(e) => setEditing({ ...editing, holder_name: e.target.value })} />
                </div>
                <div>
                  <Label>Department</Label>
                  <Input value={editing.department ?? ""} onChange={(e) => setEditing({ ...editing, department: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Reports to</Label>
                <Select
                  value={editing.parent_id ?? "__none__"}
                  onValueChange={(v) => setEditing({ ...editing, parent_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Top-level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Top level —</SelectItem>
                    {positions.filter((p) => p.id !== editing.id).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}{p.holder_name ? ` (${p.holder_name})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Job description</Label>
                <Textarea rows={4} value={editing.job_description ?? ""} onChange={(e) => setEditing({ ...editing, job_description: e.target.value })} />
              </div>
              <div>
                <Label>Main objectives</Label>
                <Textarea rows={4} value={editing.main_objectives ?? ""} onChange={(e) => setEditing({ ...editing, main_objectives: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={savePosition}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review editor dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingReviewId ? "Edit review" : "Add yearly review"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Year</Label>
                <Input type="number" value={reviewDraft.review_year ?? ""} onChange={(e) => setReviewDraft({ ...reviewDraft, review_year: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Rating (1-5)</Label>
                <Input type="number" min={1} max={5} value={reviewDraft.rating ?? ""} onChange={(e) => setReviewDraft({ ...reviewDraft, rating: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Reviewer</Label>
              <Input value={reviewDraft.reviewer_name ?? ""} onChange={(e) => setReviewDraft({ ...reviewDraft, reviewer_name: e.target.value })} />
            </div>
            <div>
              <Label>Strengths</Label>
              <Textarea rows={2} value={reviewDraft.strengths ?? ""} onChange={(e) => setReviewDraft({ ...reviewDraft, strengths: e.target.value })} />
            </div>
            <div>
              <Label>Areas to improve</Label>
              <Textarea rows={2} value={reviewDraft.areas_for_improvement ?? ""} onChange={(e) => setReviewDraft({ ...reviewDraft, areas_for_improvement: e.target.value })} />
            </div>
            <div>
              <Label>Goals next year</Label>
              <Textarea rows={2} value={reviewDraft.goals_next_year ?? ""} onChange={(e) => setReviewDraft({ ...reviewDraft, goals_next_year: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={reviewDraft.notes ?? ""} onChange={(e) => setReviewDraft({ ...reviewDraft, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button onClick={saveReview}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function OrgTree({
  roots, byParent, onSelect, selectedId,
}: {
  roots: Position[];
  byParent: Map<string | null, Position[]>;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <div className="flex gap-6 items-start min-w-fit">
      {roots.map((r) => (
        <OrgNode key={r.id} pos={r} byParent={byParent} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  );
}

function OrgNode({
  pos, byParent, onSelect, selectedId, depth = 0,
}: {
  pos: Position;
  byParent: Map<string | null, Position[]>;
  onSelect: (id: string) => void;
  selectedId: string | null;
  depth?: number;
}) {
  const children = byParent.get(pos.id) ?? [];
  const [open, setOpen] = useState(true);
  const isSelected = selectedId === pos.id;
  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => onSelect(pos.id)}
        className={cn(
          "rounded-lg border bg-card px-4 py-3 text-center min-w-[180px] max-w-[220px] shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
          isSelected && "ring-2 ring-primary border-primary",
        )}
      >
        <p className="font-semibold text-sm truncate">{pos.title}</p>
        <p className="text-xs text-muted-foreground truncate">{pos.holder_name || "Vacant"}</p>
        {pos.department && <p className="text-[10px] uppercase tracking-wider text-accent mt-0.5 truncate">{pos.department}</p>}
      </button>
      {children.length > 0 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            className="mt-1 mb-1 text-muted-foreground hover:text-foreground"
            aria-label="Toggle"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {open && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="flex gap-6 items-start relative pt-2">
                {children.length > 1 && (
                  <div className="absolute top-0 left-[90px] right-[90px] h-px bg-border" />
                )}
                {children.map((c) => (
                  <div key={c.id} className="flex flex-col items-center">
                    <div className="w-px h-2 bg-border" />
                    <OrgNode pos={c} byParent={byParent} onSelect={onSelect} selectedId={selectedId} depth={depth + 1} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
