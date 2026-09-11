import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STALE_TIME = 60_000;
const PAGE = 1000;

export type ContactHealth = "healthy" | "watch" | "at_risk" | "neglected" | "no_contact";

export interface ProspectReportingRow {
  id: string;
  company_name: string;
  account_type: "prospect" | "dealer";
  lifecycle_stage: string;
  status: string;
  assigned_manager_id: string | null;
  assigned_rep_id: string | null;
  created_at: string;
  updated_at: string;
  last_contact_at: string | null;
  last_note_preview: string | null;
  days_since_contact: number | null;
  contact_health: ContactHealth;
  contacts_last_60d: number;
  contacts_last_6mo: number;
  converted_at: string | null;
  converted_at_is_exact: boolean;
  is_unassigned: boolean;
}

// Reads v_prospect_reporting_overview — same crm_accounts rows the existing
// Prospects page shows, joined with the (corrected) last-contact logic. Not
// Acctivate, not sales/booking/invoice/open-SO data.
export function useProspectReportingOverview() {
  return useQuery({
    queryKey: ["prospect_reporting_overview"],
    queryFn: async () => {
      const all: ProspectReportingRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("v_prospect_reporting_overview")
          .select("*")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data ?? []) as ProspectReportingRow[];
        all.push(...chunk);
        if (chunk.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: STALE_TIME,
  });
}

export type CrmEventType = "created" | "assigned" | "converted" | "status_changed" | "deleted";

export interface CrmAccountEvent {
  id: string;
  account_id: string | null;
  event_type: CrmEventType;
  company_name_snapshot: string | null;
  from_value: string | null;
  to_value: string | null;
  manager_id: string | null;
  rep_id: string | null;
  occurred_at: string;
  created_by: string | null;
}

// Reads crm_account_events — only exists from the date it shipped onward;
// see the "only counts from" note surfaced in the reporting page itself.
export function useProspectEvents() {
  return useQuery({
    queryKey: ["crm_account_events"],
    queryFn: async () => {
      const all: CrmAccountEvent[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("crm_account_events")
          .select("*")
          .order("occurred_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data ?? []) as CrmAccountEvent[];
        all.push(...chunk);
        if (chunk.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: STALE_TIME,
  });
}
