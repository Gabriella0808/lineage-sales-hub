import { BookMarked } from "lucide-react";

export default function KnowledgeBasePage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Knowledge Base</h1>
        <p className="page-subtitle">Internal articles, scripts, and product references</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-12 flex flex-col items-center justify-center text-center gap-3">
        <BookMarked className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-medium">Articles coming soon</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Curated help articles and standard responses will live here.
        </p>
      </div>
    </div>
  );
}
