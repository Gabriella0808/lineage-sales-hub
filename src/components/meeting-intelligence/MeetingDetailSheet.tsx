import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  X, Calendar, Clock, MapPin, Users, Tag,
  CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp,
  Package, Lightbulb, CheckSquare, FileText, AlertCircle, Clock3,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Meeting, ActionItem, ActionItemStatus, ProductOutcome } from "@/types/granola";
import { updateActionItemStatus } from "@/services/granolaService";
import { AddToTasksDialog, TaskAddedBanner } from "./AddToTasksDialog";

const OUTCOME_CONFIG: Record<ProductOutcome, { label: string; className: string }> = {
  ordered: { label: "Ordered", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  interested: { label: "Interested", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  "follow-up": { label: "Follow-Up", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  declined: { label: "Declined", className: "bg-muted text-muted-foreground" },
};

interface ActionItemRowProps {
  item: ActionItem;
  meetingId: string;
  onStatusChange: (itemId: string, status: ActionItemStatus) => void;
  linkedTaskId?: string | null;
  onAddToTasks: (item: ActionItem) => void;
}

function ActionItemRow({ item, onStatusChange, linkedTaskId, onAddToTasks }: ActionItemRowProps) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    const next: ActionItemStatus = item.status === "done" ? "open" : "done";
    setToggling(true);
    await updateActionItemStatus("", item.id, next);
    onStatusChange(item.id, next);
    setToggling(false);
  };

  return (
    <div className="flex items-start gap-2.5 py-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={toggling}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        {toggling
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : item.status === "done"
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : item.status === "in-progress"
              ? <Clock3 className="h-4 w-4 text-blue-500" />
              : <Circle className="h-4 w-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm", item.status === "done" && "line-through text-muted-foreground")}>{item.text}</p>
        <div className="flex items-center flex-wrap gap-2 mt-1">
          {item.assignee && <span className="text-xs text-muted-foreground">{item.assignee}</span>}
          {item.dueDate && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Calendar className="h-2.5 w-2.5" />{format(parseISO(item.dueDate), "MMM d")}
            </span>
          )}
          {linkedTaskId
            ? <TaskAddedBanner taskId={linkedTaskId} />
            : item.status !== "done" && (
              <button
                type="button"
                onClick={() => onAddToTasks(item)}
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
              >
                <CheckSquare className="h-3 w-3" /> Add to My Tasks
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  meeting: Meeting | null;
  open: boolean;
  onClose: () => void;
}

export function MeetingDetailSheet({ meeting, open, onClose }: Props) {
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [taskDialogItem, setTaskDialogItem] = useState<ActionItem | null>(null);
  const [linkedTaskIds, setLinkedTaskIds] = useState<Record<string, string>>({});

  if (meeting && actionItems.length === 0 && meeting.actionItems.length > 0) {
    setActionItems(meeting.actionItems);
  }

  const items = meeting ? (actionItems.length > 0 ? actionItems : meeting.actionItems) : [];

  const handleStatusChange = (itemId: string, status: ActionItemStatus) => {
    setActionItems((prev) =>
      prev.length > 0
        ? prev.map((a) => a.id === itemId ? { ...a, status } : a)
        : (meeting?.actionItems ?? []).map((a) => a.id === itemId ? { ...a, status } : a),
    );
  };

  const handleTaskCreated = (itemId: string, taskId: string) => {
    setLinkedTaskIds((prev) => ({ ...prev, [itemId]: taskId }));
  };

  if (!meeting) return null;

  const openItemCount = items.filter((a) => a.status !== "done").length;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setShowTranscript(false); setActionItems([]); } }}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b border-border/70 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <SheetTitle className="text-base leading-snug text-left pr-4">{meeting.title}</SheetTitle>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 mt-0.5" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(parseISO(meeting.date), "EEEE, MMMM d, yyyy")}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{meeting.startTime} – {meeting.endTime}</span>
              {meeting.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{meeting.location}</span>}
              {meeting.attendees && meeting.attendees.length > 0 && (
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{meeting.attendees.join(", ")}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {meeting.tags?.map((t) => (
                <span key={t} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                  <Tag className="h-2.5 w-2.5" />{t}
                </span>
              ))}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-5 space-y-6">
              {/* Overview */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Summary</h3>
                <p className="text-sm text-foreground leading-relaxed">{meeting.summary}</p>
              </section>

              {meeting.keyDecisions.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Lightbulb className="h-3 w-3" /> Key Decisions
                    </h3>
                    <ul className="space-y-1.5">
                      {meeting.keyDecisions.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

              {items.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" /> Action Items
                      </h3>
                      {openItemCount > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">{openItemCount} open</span>
                      )}
                    </div>
                    <div className="divide-y divide-border/40">
                      {items.map((item) => (
                        <ActionItemRow
                          key={item.id}
                          item={item}
                          meetingId={meeting.id}
                          onStatusChange={handleStatusChange}
                          linkedTaskId={linkedTaskIds[item.id] ?? null}
                          onAddToTasks={(i) => setTaskDialogItem(i)}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}

              {meeting.productsDiscussed.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Package className="h-3 w-3" /> Products Discussed
                    </h3>
                    <div className="space-y-2">
                      {meeting.productsDiscussed.map((p) => (
                        <div key={p.sku} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-muted-foreground mr-2">{p.sku}</span>
                            <span className="text-sm text-foreground truncate">{p.name}</span>
                            {p.collection && <span className="text-xs text-muted-foreground ml-2">· {p.collection}</span>}
                          </div>
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0", OUTCOME_CONFIG[p.outcome].className)}>
                            {OUTCOME_CONFIG[p.outcome].label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {meeting.dealerId && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dealer</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{meeting.dealerName}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{meeting.dealerCompany}</span>
                      <a href={`/dealers`} className="text-xs text-primary hover:underline ml-1">View dealer →</a>
                    </div>
                  </section>
                </>
              )}

              {meeting.transcript && (
                <>
                  <Separator />
                  <section>
                    <button
                      type="button"
                      className="flex items-center justify-between w-full text-left"
                      onClick={() => setShowTranscript((v) => !v)}
                    >
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3 w-3" /> Transcript
                      </h3>
                      {showTranscript ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {showTranscript && (
                      <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded-md p-3 max-h-64 overflow-y-auto">
                        {meeting.transcript}
                      </pre>
                    )}
                  </section>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {taskDialogItem && (
        <AddToTasksDialog
          open={!!taskDialogItem}
          onClose={() => setTaskDialogItem(null)}
          defaultTitle={taskDialogItem.text}
          defaultDescription={`From meeting: ${meeting.title}`}
          defaultDueDate={taskDialogItem.dueDate}
          onCreated={(taskId) => handleTaskCreated(taskDialogItem.id, taskId)}
        />
      )}
    </>
  );
}
