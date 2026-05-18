import { LifeBuoy } from "lucide-react";

export default function TicketsPage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Tickets & Cases</h1>
        <p className="page-subtitle">Track and resolve customer support cases</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-12 flex flex-col items-center justify-center text-center gap-3">
        <LifeBuoy className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-medium">No tickets yet</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Customer cases will appear here once the ticketing workflow is connected.
        </p>
      </div>
    </div>
  );
}
