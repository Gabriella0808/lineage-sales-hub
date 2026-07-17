import { format, parseISO } from "date-fns";
import { MapPin, Clock, Users, ChevronRight, AlertCircle, CheckCircle2, Clock3, Archive, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Meeting, MeetingStatus, MeetingType } from "@/types/granola";

const TYPE_LABELS: Record<MeetingType, string> = {
  "dealer-visit": "Dealer Visit",
  "sales-call": "Sales Call",
  "trade-show": "Trade Show",
  "follow-up": "Follow-Up",
  "internal": "Internal",
};

const STATUS_CONFIG: Record<MeetingStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  "completed": { label: "Completed", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  "action-required": { label: "Action Required", icon: AlertCircle, className: "text-amber-600 dark:text-amber-400" },
  "follow-up-pending": { label: "Follow-Up Pending", icon: Clock3, className: "text-blue-600 dark:text-blue-400" },
  "archived": { label: "Archived", icon: Archive, className: "text-muted-foreground" },
};

function MeetingCard({ meeting, onClick }: { meeting: Meeting; onClick: () => void }) {
  const status = STATUS_CONFIG[meeting.status];
  const StatusIcon = status.icon;
  const openItems = meeting.actionItems.filter((a) => a.status === "open").length;

  return (
    <Card
      className="p-4 hover:bg-muted/20 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {/* Mobile layout */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{meeting.dealerCompany || "Internal"}</p>
          </div>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">{TYPE_LABELS[meeting.type]}</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(parseISO(meeting.date), "MMM d")}</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{meeting.repName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={cn("flex items-center gap-1 text-xs", status.className)}>
            <StatusIcon className="h-3.5 w-3.5" />{status.label}
          </span>
          {openItems > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">{openItems} open item{openItems > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden sm:flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">{TYPE_LABELS[meeting.type]}</Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(parseISO(meeting.date), "MMM d, yyyy")}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {meeting.startTime} – {meeting.endTime}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {meeting.repName}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {meeting.location}
              </span>
            )}
          </div>
          {meeting.dealerCompany && meeting.dealerCompany !== "Internal" && (
            <p className="text-xs text-muted-foreground mt-1">{meeting.dealerName} · {meeting.dealerCompany}</p>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {openItems > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap">{openItems} open action{openItems > 1 ? "s" : ""}</span>
          )}
          <span className={cn("flex items-center gap-1 text-xs whitespace-nowrap", status.className)}>
            <StatusIcon className="h-3.5 w-3.5" />{status.label}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </Card>
  );
}

interface Props {
  meetings: Meeting[];
  onSelect: (meeting: Meeting) => void;
}

export function MeetingList({ meetings, onSelect }: Props) {
  return (
    <div className="space-y-2">
      {meetings.map((m) => (
        <MeetingCard key={m.id} meeting={m} onClick={() => onSelect(m)} />
      ))}
    </div>
  );
}
