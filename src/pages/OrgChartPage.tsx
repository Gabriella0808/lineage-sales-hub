import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Star, ChevronDown, ChevronRight, Building2, Link2 } from "lucide-react";
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

type DottedLink = {
  id: string;
  position_id: string;
  reports_to_id: string;
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
  const [dotted, setDotted] = useState<DottedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editing, setEditing] = useState<Partial<Position> | null>(null);
  const [editingDotted, setEditingDotted] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Partial<Review>>({
    review_year: new Date().getFullYear(),
    rating: 3,
  });
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: r }, { data: d }] = await Promise.all([
      supabase.from("org_positions").select("*").order("position_order").order("title"),
      supabase.from("org_position_reviews").select("*").order("review_year", { ascending: false }),
      supabase.from("org_position_dotted_reports").select("*"),
    ]);
    setPositions((p ?? []) as Position[]);
    setReviews((r ?? []) as Review[]);
    setDotted((d ?? []) as DottedLink[]);
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

  const posById = useMemo(() => {
    const m = new Map<string, Position>();
    positions.forEach((p) => m.set(p.id, p));
    return m;
  }, [positions]);

  const dottedByPosition = useMemo(() => {
    const m = new Map<string, DottedLink[]>();
    dotted.forEach((d) => {
      if (!m.has(d.position_id)) m.set(d.position_id, []);
      m.get(d.position_id)!.push(d);
    });
    return m;
  }, [dotted]);

  const positionsWithDotted = useMemo(
    () => new Set(dotted.map((d) => d.position_id)),
    [dotted],
  );

  const selected = positions.find((p) => p.id === selectedId) ?? null;
  const selectedReviews = reviews.filter((r) => r.position_id === selectedId);
  const selectedDotted = selected ? (dottedByPosition.get(selected.id) ?? []) : [];

  const startEdit = (pos: Partial<Position> | null) => {
    setEditing(pos);
    if (pos?.id) {
      setEditingDotted((dottedByPosition.get(pos.id) ?? []).map((d) => d.reports_to_id));
    } else {
      setEditingDotted([]);
    }
  };

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
    let positionId = editing.id as string | undefined;
    if (positionId) {
      const { error } = await supabase.from("org_positions").update(payload).eq("id", positionId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("org_positions").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      positionId = data!.id;
    }

    // Sync dotted-line links
    if (positionId) {
      const existing = (dottedByPosition.get(positionId) ?? []).map((d) => d.reports_to_id);
      const desired = editingDotted.filter((id) => id !== positionId);
      const toAdd = desired.filter((id) => !existing.includes(id));
      const toRemove = existing.filter((id) => !desired.includes(id));
      if (toRemove.length) {
        await supabase.from("org_position_dotted_reports")
          .delete().eq("position_id", positionId).in("reports_to_id", toRemove);
      }
      if (toAdd.length) {
        await supabase.from("org_position_dotted_reports").insert(
          toAdd.map((rid) => ({ position_id: positionId!, reports_to_id: rid })),
        );
      }
    }

    toast.success(editing.id ? "Position updated" : "Position added");
    setEditing(null);
    setEditingDotted([]);
    load();
  };

  const deletePosition = async (id: string) => {
    if (!confirm("Delete this position? Reviews and dotted-line links will also be removed.")) return;
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

  const formatPos = (p: Position) =>
    `${p.title}${p.holder_name ? ` — ${p.holder_name}` : ""}`;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Building2 className="h-6 w-6" /> Organizational Chart</h1>
          <p className="page-subtitle">Click any position for job description, objectives, and yearly reviews.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => startEdit({ ...emptyPos })}>
            <Plus className="h-4 w-4 mr-1" /> Add position
          </Button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-8 h-px bg-border" />
          Solid line — direct (primary) reporting
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-8 h-0 border-t-2 border-dashed"
            style={{ borderColor: "hsl(var(--accent))" }}
          />
          Dotted line — secondary / indirect reporting
        </span>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : positions.length === 0 ? (
        <Card><CardContent className="p-8 text-sm text-muted-foreground">
          No positions yet.{isAdmin && " Click 'Add position' to start."}
        </CardContent></Card>
      ) : (
        <ChartViewport>
          <OrgChartCanvas
            roots={byParent.get(null) ?? []}
            byParent={byParent}
            onSelect={setSelectedId}
            selectedId={selectedId}
            positionsWithDotted={positionsWithDotted}
            dotted={dotted}
          />
        </ChartViewport>
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
                <Section title="Reports to (solid line)">
                  {selected.parent_id ? (
                    <p className="text-sm">{formatPos(posById.get(selected.parent_id)!)}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">— Top level —</p>
                  )}
                </Section>

                <Section title="Dotted line reports to">
                  {selectedDotted.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDotted.map((d) => {
                        const p = posById.get(d.reports_to_id);
                        if (!p) return null;
                        return (
                          <Badge key={d.id} variant="outline" className="gap-1 border-dashed">
                            <Link2 className="h-3 w-3" />
                            {formatPos(p)}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </Section>

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
                    <Button size="sm" variant="outline" onClick={() => startEdit(selected)}>
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
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setEditingDotted([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                <Label>Reports to (solid line — primary manager)</Label>
                <Select
                  value={editing.parent_id ?? "__none__"}
                  onValueChange={(v) => setEditing({ ...editing, parent_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Top-level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Top level —</SelectItem>
                    {positions.filter((p) => p.id !== editing.id).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{formatPos(p)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border border-dashed p-3 space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  Dotted line reports to
                  <span className="text-xs font-normal text-muted-foreground">— secondary / indirect</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Optional. Add one or more secondary reporting relationships separate from the primary manager above.
                </p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between">
                      {editingDotted.length === 0
                        ? "Select positions…"
                        : `${editingDotted.length} selected`}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-72 overflow-y-auto">
                    <div className="space-y-1">
                      {positions
                        .filter((p) => p.id !== editing.id && p.id !== editing.parent_id)
                        .map((p) => {
                          const checked = editingDotted.includes(p.id);
                          return (
                            <label key={p.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setEditingDotted((cur) =>
                                    v ? [...cur, p.id] : cur.filter((id) => id !== p.id),
                                  );
                                }}
                              />
                              <span className="truncate">{formatPos(p)}</span>
                            </label>
                          );
                        })}
                      {positions.filter((p) => p.id !== editing.id && p.id !== editing.parent_id).length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">No other positions available.</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {editingDotted.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {editingDotted.map((id) => {
                      const p = posById.get(id);
                      if (!p) return null;
                      return (
                        <Badge key={id} variant="outline" className="gap-1 border-dashed">
                          {formatPos(p)}
                          <button
                            type="button"
                            onClick={() => setEditingDotted((cur) => cur.filter((x) => x !== id))}
                            className="ml-0.5 text-muted-foreground hover:text-foreground"
                          >×</button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
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
            <Button variant="outline" onClick={() => { setEditing(null); setEditingDotted([]); }}>Cancel</Button>
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

type NodeRefMap = Map<string, HTMLElement>;

function ChartViewport({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const fit = () => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    // Reset to measure natural size
    inner.style.transform = "scale(1)";
    const naturalWidth = inner.scrollWidth;
    const available = wrap.clientWidth;
    if (naturalWidth <= available) {
      setZoom(1);
      inner.style.transform = "scale(1)";
      return;
    }
    const next = Math.max(0.4, available / naturalWidth);
    setZoom(next);
    inner.style.transform = `scale(${next})`;
  };

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  return (
    <div className="relative">
      <div className="absolute right-0 -top-9 flex items-center gap-2 text-xs text-muted-foreground">
        <button
          className="px-2 py-0.5 rounded border hover:bg-muted"
          onClick={() => { const z = Math.max(0.4, zoom - 0.1); setZoom(z); if (innerRef.current) innerRef.current.style.transform = `scale(${z})`; }}
        >−</button>
        <span className="tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          className="px-2 py-0.5 rounded border hover:bg-muted"
          onClick={() => { const z = Math.min(1.5, zoom + 0.1); setZoom(z); if (innerRef.current) innerRef.current.style.transform = `scale(${z})`; }}
        >+</button>
        <button
          className="px-2 py-0.5 rounded border hover:bg-muted"
          onClick={fit}
        >Fit</button>
      </div>
      <div ref={wrapRef} className="w-full overflow-auto pb-4">
        <div
          ref={innerRef}
          style={{ transformOrigin: "top left", transform: `scale(${zoom})` }}
          className="inline-block"
        >
          {children}
        </div>
      </div>
    </div>
  );
}


function OrgChartCanvas({
  roots, byParent, onSelect, selectedId, positionsWithDotted, dotted,
}: {
  roots: Position[];
  byParent: Map<string | null, Position[]>;
  onSelect: (id: string) => void;
  selectedId: string | null;
  positionsWithDotted: Set<string>;
  dotted: DottedLink[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<NodeRefMap>(new Map());
  const [lines, setLines] = useState<Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const recompute = () => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    setSize({ w: container.scrollWidth, h: container.scrollHeight });
    const next: typeof lines = [];
    dotted.forEach((d) => {
      const from = nodeRefs.current.get(d.position_id);
      const to = nodeRefs.current.get(d.reports_to_id);
      if (!from || !to) return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      // Connect side-to-side based on horizontal positions
      const fromCenterX = a.left + a.width / 2 - cRect.left;
      const toCenterX = b.left + b.width / 2 - cRect.left;
      const fromOnLeft = fromCenterX < toCenterX;
      const x1 = (fromOnLeft ? a.right : a.left) - cRect.left;
      const y1 = a.top + a.height / 2 - cRect.top;
      const x2 = (fromOnLeft ? b.left : b.right) - cRect.left;
      const y2 = b.top + b.height / 2 - cRect.top;
      next.push({ id: d.id, x1, y1, x2, y2 });
    });
    setLines(next);
  };

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    const t = setTimeout(recompute, 100);
    return () => { ro.disconnect(); window.removeEventListener("resize", recompute); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dotted, roots, byParent, selectedId]);

  const registerNode = (id: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  };

  return (
    <div ref={containerRef} className="relative inline-block min-w-full">
      <div className="flex gap-6 items-start min-w-fit">
        {roots.map((r) => (
          <OrgNode
            key={r.id}
            pos={r}
            byParent={byParent}
            onSelect={onSelect}
            selectedId={selectedId}
            positionsWithDotted={positionsWithDotted}
            registerNode={registerNode}
          />
        ))}
      </div>
      {size.w > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          style={{ overflow: "visible" }}
        >
          {lines.map((l) => {
            const midX = (l.x1 + l.x2) / 2;
            const path = `M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2} ${l.y2}`;
            return (
              <path
                key={l.id}
                d={path}
                fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

function OrgNode({
  pos, byParent, onSelect, selectedId, positionsWithDotted, registerNode, depth = 0,
}: {
  pos: Position;
  byParent: Map<string | null, Position[]>;
  onSelect: (id: string) => void;
  selectedId: string | null;
  positionsWithDotted: Set<string>;
  registerNode: (id: string, el: HTMLElement | null) => void;
  depth?: number;
}) {
  const children = byParent.get(pos.id) ?? [];
  const [open, setOpen] = useState(true);
  const isSelected = selectedId === pos.id;
  const hasDotted = positionsWithDotted.has(pos.id);
  return (
    <div className="flex flex-col items-center">
      <button
        ref={(el) => registerNode(pos.id, el)}
        onClick={() => onSelect(pos.id)}
        className={cn(
          "relative rounded-lg border bg-card px-4 py-3 text-center min-w-[180px] max-w-[220px] shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
          isSelected && "ring-2 ring-primary border-primary",
        )}
      >
        <p className="font-semibold text-sm truncate">{pos.title}</p>
        <p className="text-xs text-muted-foreground truncate">{pos.holder_name || "Vacant"}</p>
        {pos.department && <p className="text-[10px] uppercase tracking-wider text-accent mt-0.5 truncate">{pos.department}</p>}
        {hasDotted && (
          <span
            title="Has dotted-line reporting"
            className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-accent-foreground"
          >
            <Link2 className="h-2.5 w-2.5" />
          </span>
        )}
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
              <div className="w-px h-3 bg-border" />
              <div className="flex items-start">
                {children.map((c, i) => {
                  const isFirst = i === 0;
                  const isLast = i === children.length - 1;
                  const isOnly = children.length === 1;
                  return (
                    <div key={c.id} className="flex flex-col items-center px-3">
                      {!isOnly && (
                        <div className="relative h-3 w-full">
                          <div
                            className={cn(
                              "absolute top-0 h-px bg-border",
                              isFirst ? "left-1/2 right-0" : isLast ? "left-0 right-1/2" : "left-0 right-0",
                            )}
                          />
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 bg-border" />
                        </div>
                      )}
                      {isOnly && <div className="w-px h-3 bg-border" />}
                      <OrgNode pos={c} byParent={byParent} onSelect={onSelect} selectedId={selectedId} positionsWithDotted={positionsWithDotted} registerNode={registerNode} depth={depth + 1} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}