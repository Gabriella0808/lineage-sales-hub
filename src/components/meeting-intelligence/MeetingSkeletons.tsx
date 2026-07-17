import { Card } from "@/components/ui/card";

export function MeetingListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-5 w-24 rounded-full bg-muted animate-pulse shrink-0" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-4 space-y-2">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="h-8 w-16 rounded bg-muted animate-pulse" />
        </Card>
      ))}
    </div>
  );
}
