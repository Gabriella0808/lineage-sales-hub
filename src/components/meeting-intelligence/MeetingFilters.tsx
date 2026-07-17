import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MeetingFiltersState, MeetingType, MeetingStatus } from "@/types/granola";
import { MOCK_GRANOLA_FOLDERS, MOCK_REPS } from "@/mock/granolaMeetings";

const MEETING_TYPES: { value: MeetingType; label: string }[] = [
  { value: "dealer-visit", label: "Dealer Visit" },
  { value: "sales-call", label: "Sales Call" },
  { value: "trade-show", label: "Trade Show" },
  { value: "follow-up", label: "Follow-Up" },
  { value: "internal", label: "Internal" },
];

const STATUSES: { value: MeetingStatus; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "action-required", label: "Action Required" },
  { value: "follow-up-pending", label: "Follow-Up Pending" },
  { value: "archived", label: "Archived" },
];

interface Props {
  filters: MeetingFiltersState;
  onChange: (filters: MeetingFiltersState) => void;
}

const DEFAULT_FILTERS: MeetingFiltersState = {
  search: "", dateFrom: "", dateTo: "", type: "", repId: "", dealerCompany: "", status: "", granolaFolder: "",
};

function hasActiveFilters(f: MeetingFiltersState) {
  return Object.values(f).some((v) => v !== "");
}

export function MeetingFilters({ filters, onChange }: Props) {
  const set = (key: keyof MeetingFiltersState, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search meetings, dealers, reps..."
            className="pl-8 h-8 text-sm"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>

        <Select value={filters.type || "all"} onValueChange={(v) => set("type", v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Meeting type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {MEETING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.repId || "all"} onValueChange={(v) => set("repId", v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Sales rep" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reps</SelectItem>
            {MOCK_REPS.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.status || "all"} onValueChange={(v) => set("status", v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.granolaFolder || "all"} onValueChange={(v) => set("granolaFolder", v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Granola folder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Folders</SelectItem>
            {MOCK_GRANOLA_FOLDERS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex gap-1.5 items-center">
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={filters.dateFrom}
            onChange={(e) => set("dateFrom", e.target.value)}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={filters.dateTo}
            onChange={(e) => set("dateTo", e.target.value)}
          />
        </div>

        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => onChange(DEFAULT_FILTERS)}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
