import { AudioLines } from "lucide-react";

interface Props {
  hasFilters: boolean;
}

export function MeetingEmptyState({ hasFilters }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <AudioLines className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        {hasFilters ? "No meetings match your filters" : "No meetings yet"}
      </p>
      <p className="text-sm text-muted-foreground max-w-xs">
        {hasFilters
          ? "Try adjusting or clearing your filters to see more results."
          : "Meetings synced from Granola will appear here once the integration is connected."}
      </p>
    </div>
  );
}
