import { Calendar, CheckSquare, Store, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { MeetingStats } from "@/types/granola";

interface Props {
  stats: MeetingStats | null;
  loading: boolean;
}

function KpiCard({ icon: Icon, label, value, loading }: { icon: typeof Calendar; label: string; value: string; loading: boolean }) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {loading ? (
        <div className="h-8 w-16 rounded bg-muted animate-pulse" />
      ) : (
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      )}
    </Card>
  );
}

export function MeetingKpiCards({ stats, loading }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard icon={Calendar} label="Meetings This Week" value={stats?.meetingsThisWeek.toString() ?? "—"} loading={loading} />
      <KpiCard icon={CheckSquare} label="Open Action Items" value={stats?.openActionItems.toString() ?? "—"} loading={loading} />
      <KpiCard icon={Store} label="Dealer Meetings" value={stats?.dealerMeetings.toString() ?? "—"} loading={loading} />
      <KpiCard icon={RefreshCw} label="Last Sync" value={stats?.lastSyncTime ?? "—"} loading={loading} />
    </div>
  );
}
