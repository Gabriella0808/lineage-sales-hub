import type { Meeting, MeetingStats, MeetingFiltersState, GranolaIntegrationStatus, ActionItemStatus } from "@/types/granola";
import {
  MOCK_MEETINGS,
  MOCK_MEETING_STATS,
  MOCK_INTEGRATION_STATUS,
} from "@/mock/granolaMeetings";

function applyFilters(meetings: Meeting[], filters: Partial<MeetingFiltersState>): Meeting[] {
  return meetings.filter((m) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = [m.title, m.dealerName, m.dealerCompany, m.repName, m.summary].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.dateFrom && m.date < filters.dateFrom) return false;
    if (filters.dateTo && m.date > filters.dateTo) return false;
    if (filters.type && m.type !== filters.type) return false;
    if (filters.repId && m.repId !== filters.repId) return false;
    if (filters.dealerCompany && m.dealerCompany !== filters.dealerCompany) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.granolaFolder && m.granolaFolder !== filters.granolaFolder) return false;
    return true;
  });
}

export async function getMeetings(filters?: Partial<MeetingFiltersState>): Promise<Meeting[]> {
  await new Promise((r) => setTimeout(r, 400));
  const sorted = [...MOCK_MEETINGS].sort((a, b) => (a.date < b.date ? 1 : -1));
  return filters ? applyFilters(sorted, filters) : sorted;
}

export async function getMeetingById(id: string): Promise<Meeting | null> {
  await new Promise((r) => setTimeout(r, 200));
  return MOCK_MEETINGS.find((m) => m.id === id) ?? null;
}

export async function getMeetingStats(): Promise<MeetingStats> {
  await new Promise((r) => setTimeout(r, 300));
  return MOCK_MEETING_STATS;
}

export async function updateActionItemStatus(
  _meetingId: string,
  _actionItemId: string,
  _status: ActionItemStatus,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}

export async function getGranolaIntegrationStatus(): Promise<GranolaIntegrationStatus> {
  await new Promise((r) => setTimeout(r, 150));
  return MOCK_INTEGRATION_STATUS;
}
