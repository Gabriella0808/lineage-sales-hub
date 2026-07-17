export type MeetingType = "dealer-visit" | "sales-call" | "trade-show" | "follow-up" | "internal";
export type MeetingStatus = "completed" | "action-required" | "follow-up-pending" | "archived";
export type ActionItemStatus = "open" | "in-progress" | "done";
export type ProductOutcome = "interested" | "ordered" | "declined" | "follow-up";

export interface ActionItem {
  id: string;
  text: string;
  status: ActionItemStatus;
  assignee?: string;
  dueDate?: string;
  linkedTaskId?: string | null;
}

export interface ProductDiscussed {
  sku: string;
  name: string;
  collection?: string;
  outcome: ProductOutcome;
}

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  date: string;
  startTime: string;
  endTime: string;
  repName: string;
  repId: string;
  dealerName: string;
  dealerCompany: string;
  dealerId?: string;
  location?: string;
  granolaFolder?: string;
  summary: string;
  keyDecisions: string[];
  actionItems: ActionItem[];
  productsDiscussed: ProductDiscussed[];
  transcript?: string;
  tags?: string[];
  attendees?: string[];
}

export interface MeetingStats {
  meetingsThisWeek: number;
  openActionItems: number;
  dealerMeetings: number;
  lastSyncTime: string;
}

export interface MeetingFiltersState {
  search: string;
  dateFrom: string;
  dateTo: string;
  type: MeetingType | "";
  repId: string;
  dealerCompany: string;
  status: MeetingStatus | "";
  granolaFolder: string;
}

export interface GranolaIntegrationStatus {
  connected: boolean;
  workspaceName?: string;
  lastSyncTime?: string;
  meetingsImported?: number;
}
