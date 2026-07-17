import { useEffect, useState, useMemo } from "react";
import { AudioLines, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import type { Meeting, MeetingFiltersState, MeetingStats, GranolaIntegrationStatus } from "@/types/granola";
import {
  getMeetings,
  getMeetingStats,
  getGranolaIntegrationStatus,
} from "@/services/granolaService";
import { MeetingKpiCards } from "@/components/meeting-intelligence/MeetingKpiCards";
import { MeetingFilters } from "@/components/meeting-intelligence/MeetingFilters";
import { MeetingList } from "@/components/meeting-intelligence/MeetingList";
import { MeetingDetailSheet } from "@/components/meeting-intelligence/MeetingDetailSheet";
import { IntegrationStatusCard } from "@/components/meeting-intelligence/IntegrationStatusCard";
import { MeetingEmptyState } from "@/components/meeting-intelligence/MeetingEmptyState";
import { MeetingListSkeleton } from "@/components/meeting-intelligence/MeetingSkeletons";

type TabView = "all" | "mine" | "dealers" | "action-required";

const DEFAULT_FILTERS: MeetingFiltersState = {
  search: "", dateFrom: "", dateTo: "", type: "", repId: "", dealerCompany: "", status: "", granolaFolder: "",
};

function hasActiveFilters(f: MeetingFiltersState) {
  return Object.values(f).some((v) => v !== "");
}

export default function MeetingIntelligencePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: roleInfo } = useUserRole();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [stats, setStats] = useState<MeetingStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [integration, setIntegration] = useState<GranolaIntegrationStatus | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [filters, setFilters] = useState<MeetingFiltersState>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState<TabView>("all");

  useEffect(() => {
    void Promise.all([
      getMeetingStats().then((s) => { setStats(s); setLoadingStats(false); }),
      getGranolaIntegrationStatus().then(setIntegration),
    ]);
  }, []);

  useEffect(() => {
    setLoadingMeetings(true);
    getMeetings(filters).then((data) => {
      setMeetings(data);
      setLoadingMeetings(false);
    });
  }, [filters]);

  const tabFilteredMeetings = useMemo(() => {
    switch (activeTab) {
      case "mine":
        return meetings.filter((m) => {
          const name = user?.email?.split("@")[0] ?? "";
          return m.repName.toLowerCase().includes(name.toLowerCase());
        });
      case "dealers":
        return meetings.filter((m) => m.type === "dealer-visit" || m.type === "sales-call" || m.type === "follow-up");
      case "action-required":
        return meetings.filter((m) => m.status === "action-required" || m.actionItems.some((a) => a.status === "open"));
      default:
        return meetings;
    }
  }, [meetings, activeTab, user]);

  const handleSync = () => {
    toast({ title: "Granola Sync", description: "Connect Granola to enable automatic sync." });
  };

  const handleManageIntegration = () => {
    toast({ title: "Manage Integration", description: "Integration management coming in the next phase." });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <AudioLines className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Meeting Intelligence</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-powered meeting notes, action items, and dealer insights from Granola.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleSync}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync Granola
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleManageIntegration}>
            Manage Integration
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <MeetingKpiCards stats={stats} loading={loadingStats} />

      {/* Integration status */}
      <IntegrationStatusCard status={integration} />

      {/* Filters */}
      <MeetingFilters filters={filters} onChange={setFilters} />

      {/* Tab views */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabView)}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs h-7">All Meetings</TabsTrigger>
          <TabsTrigger value="mine" className="text-xs h-7">My Meetings</TabsTrigger>
          <TabsTrigger value="dealers" className="text-xs h-7">Dealer Meetings</TabsTrigger>
          <TabsTrigger value="action-required" className="text-xs h-7">Action Required</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Meeting list */}
      {loadingMeetings ? (
        <MeetingListSkeleton />
      ) : tabFilteredMeetings.length === 0 ? (
        <MeetingEmptyState hasFilters={hasActiveFilters(filters) || activeTab !== "all"} />
      ) : (
        <MeetingList
          meetings={tabFilteredMeetings}
          onSelect={setSelectedMeeting}
        />
      )}

      <MeetingDetailSheet
        meeting={selectedMeeting}
        open={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
      />
    </div>
  );
}
