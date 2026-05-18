import { Undo2 } from "lucide-react";

export default function ReturnsPage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Returns & RMAs</h1>
        <p className="page-subtitle">Process return authorizations and replacements</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-12 flex flex-col items-center justify-center text-center gap-3">
        <Undo2 className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-medium">No active RMAs</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Return merchandise authorizations will appear here once submitted.
        </p>
      </div>
    </div>
  );
}
