import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LayoutTemplate, Plus, ExternalLink, ListChecks, KanbanSquare } from "lucide-react";
import TaskBoardsView from "@/components/TaskBoardsView";
import TodosView from "@/components/TodosView";
import BoardTemplatesView from "@/components/BoardTemplatesView";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

interface BoardTemplate {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_builtin: boolean;
}

interface SopBoard {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
}

interface TemplateGroup {
  id: string;
  template_id: string;
}

interface TemplateTask {
  id: string;
  template_id: string;
}

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState("todos");
  const [boardsViewKey, setBoardsViewKey] = useState(0);
  const { toast } = useToast();
  const { data: roleInfo } = useUserRole();
  const isAdmin = roleInfo?.isAdmin ?? false;

  // Template-from-board picker state
  const [templates, setTemplates] = useState<BoardTemplate[]>([]);
  const [templateGroupCounts, setTemplateGroupCounts] = useState<Record<string, number>>({});
  const [templateTaskCounts, setTemplateTaskCounts] = useState<Record<string, number>>({});
  const [sopBoards, setSopBoards] = useState<SopBoard[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplate | null>(null);
  const [boardName, setBoardName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTemplates = useCallback(async () => {
    const [tmplRes, grpRes, taskRes, sopRes] = await Promise.all([
      supabase.from("board_templates" as any).select("id, name, description, color, is_builtin").order("is_builtin", { ascending: false }).order("name"),
      supabase.from("board_template_groups" as any).select("id, template_id"),
      supabase.from("board_template_tasks" as any).select("id, template_id"),
      supabase.from("task_boards" as any).select("id, name, color, description").ilike("name", "%SOP%").order("name"),
    ]);
    setTemplates(((tmplRes.data ?? []) as unknown) as BoardTemplate[]);
    const grpCounts: Record<string, number> = {};
    ((grpRes.data ?? []) as TemplateGroup[]).forEach((g) => {
      grpCounts[g.template_id] = (grpCounts[g.template_id] ?? 0) + 1;
    });
    const taskCounts: Record<string, number> = {};
    ((taskRes.data ?? []) as TemplateTask[]).forEach((t) => {
      taskCounts[t.template_id] = (taskCounts[t.template_id] ?? 0) + 1;
    });
    setTemplateGroupCounts(grpCounts);
    setTemplateTaskCounts(taskCounts);
    setSopBoards(((sopRes.data ?? []) as unknown) as SopBoard[]);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const switchToBoards = (boardId?: string) => {
    if (boardId) localStorage.setItem("active_task_board_id", boardId);
    if (activeTab === "boards") {
      // Already on Boards tab - bump the key to remount TaskBoardsView
      // so it re-reads localStorage and fetches the new board.
      setBoardsViewKey((k) => k + 1);
    } else {
      setActiveTab("boards");
    }
  };

  const openPicker = () => {
    setSelectedTemplate(null);
    setBoardName("");
    loadTemplates();
    setPickerOpen(true);
  };

  const confirmCreate = async () => {
    if (!selectedTemplate) {
      toast({ title: "Select a template first", variant: "destructive" });
      return;
    }
    if (!boardName.trim()) {
      toast({ title: "Board name is required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc("create_board_from_template" as any, {
      p_template_id: selectedTemplate.id,
      p_board_name: boardName.trim(),
    });
    setCreating(false);
    if (error) {
      toast({ title: "Failed to create board", description: error.message, variant: "destructive" });
      return;
    }
    setPickerOpen(false);
    setBoardName("");
    setSelectedTemplate(null);
    toast({ title: `Board "${boardName.trim()}" created` });
    switchToBoards(data as string);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command Center"
        title="My Tasks"
        subtitle="Your to-dos, team boards and templates in one place."
        actions={isAdmin && activeTab === "boards" && templates.length > 0 ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openPicker}>
            <Plus className="h-3.5 w-3.5" />New board from template
          </Button>
        ) : undefined}
      />

      <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v);
            if (v === "boards") loadTemplates();
          }}
          className="w-full"
        >
        <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
          {([
            ["todos", "To Do's", ListChecks, true],
            ["boards", "Boards", KanbanSquare, isAdmin],
            ["templates", "Templates", LayoutTemplate, isAdmin],
          ] as const).filter(([, , , show]) => show).map(([value, label, Icon]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-2 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Icon className="h-4 w-4" />{label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="todos" className="mt-4">
          <TodosView onSwitchToBoards={isAdmin ? switchToBoards : undefined} />
        </TabsContent>

        <TabsContent value="boards" className="mt-4 space-y-4">
          <TaskBoardsView key={boardsViewKey} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="templates" className="mt-4 space-y-8">
            <BoardTemplatesView
              onBoardCreated={(id) => {
                loadTemplates();
                switchToBoards(id);
              }}
            />

            {sopBoards.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">SOP Boards</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Standard operating procedure boards. Click to open.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sopBoards.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => switchToBoards(b.id)}
                      className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-4 text-left hover:border-border hover:shadow-sm transition-all"
                    >
                      <span
                        className="mt-1 h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: b.color ?? "#94a3b8" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{b.name}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </div>
                        {b.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{b.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ── Template picker dialog ── */}
      <Dialog open={pickerOpen} onOpenChange={(o) => { if (!o) setPickerOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Board from Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Template selection */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Choose a template</p>
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(t);
                      if (!boardName) setBoardName(t.name);
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      selectedTemplate?.id === t.id
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <div
                      className="mt-0.5 h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: t.color ?? "#94a3b8" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{t.name}</span>
                        {t.is_builtin && (
                          <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {templateGroupCounts[t.id] ?? 0} groups · {templateTaskCounts[t.id] ?? 0} tasks
                      </p>
                    </div>
                    {selectedTemplate?.id === t.id && (
                      <div className="shrink-0 h-4 w-4 rounded-full bg-primary flex items-center justify-center mt-0.5">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Board name */}
            {selectedTemplate && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Board name
                </label>
                <Input
                  autoFocus
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  placeholder="Board name"
                  maxLength={100}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmCreate(); }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={confirmCreate} disabled={creating || !selectedTemplate}>
              {creating ? "Creating…" : "Create Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
