import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2, RefreshCw, LayoutGrid, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Board = {
  id: string;
  name: string;
  description: string | null;
  state: string;
  board_kind: string;
  items_count: number;
  updated_at: string;
  url: string;
  owners: { id: string; name: string; email: string }[] | null;
  workspace: { id: string; name: string } | null;
};

export default function MondayBoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("list-monday-boards");
    if (error) setError(error.message);
    else if (!data?.success) setError(data?.error || "Failed to load boards");
    else setBoards(data.boards || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const workspaces = useMemo(() => {
    const set = new Map<string, string>();
    boards.forEach((b) => b.workspace && set.set(b.workspace.id, b.workspace.name));
    return Array.from(set.entries());
  }, [boards]);

  const filtered = useMemo(() => {
    return boards.filter((b) => {
      const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase());
      const matchesWs = workspace === "all" || b.workspace?.id === workspace;
      return matchesSearch && matchesWs;
    });
  }, [boards, search, workspace]);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Monday Boards</h1>
          <p className="page-subtitle">
            {loading ? "Loading…" : `${boards.length} boards from monday.com`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search boards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">All workspaces</option>
          {workspaces.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <Card className="p-4 mb-6 border-destructive/50 bg-destructive/5 text-sm text-destructive">
          {error}
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Fetching boards from monday.com…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <Card key={b.id} className="p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-lg leading-tight truncate">{b.name}</h3>
                  {b.workspace && (
                    <p className="text-xs text-muted-foreground truncate">{b.workspace.name}</p>
                  )}
                </div>
              </div>

              {b.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{b.description}</p>
              )}

              <div className="flex flex-wrap gap-2 mb-4 mt-auto">
                <Badge variant="secondary">{b.items_count ?? 0} items</Badge>
                <Badge variant="outline" className="capitalize">{b.board_kind}</Badge>
                {b.updated_at && (
                  <Badge variant="outline">
                    {formatDistanceToNow(new Date(b.updated_at), { addSuffix: true })}
                  </Badge>
                )}
              </div>

              <a
                href={b.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Open in monday.com <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card className="p-8 col-span-full text-center text-muted-foreground">
              No boards match your filters.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
