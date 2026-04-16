import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types matching DB schema ──────────────────────────────────────

export interface DbSalesRep {
  id: string;
  acctivate_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  manager_id: string | null;
  status: string;
  kpi_score: number | null;
  quota: number | null;
  revenue: number | null;
  tasks_completed: number | null;
  tasks_pending: number | null;
  tasks_overdue: number | null;
  last_activity: string | null;
  created_at: string;
}

export interface DbTerritory {
  id: string;
  acctivate_id: string | null;
  name: string;
  region: string | null;
  state: string | null;
  revenue: number | null;
  quota: number | null;
  kpi_score: number | null;
  status: string;
  created_at: string;
}

export interface DbDealer {
  id: string;
  acctivate_id: string | null;
  name: string;
  rep_id: string | null;
  territory_id: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  engagement: string | null;
  last_contact: string | null;
  revenue: number | null;
  created_at: string;
}

export interface DbManager {
  id: string;
  acctivate_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  region: string | null;
  created_at: string;
}

export interface DbActivity {
  id: string;
  type: string | null;
  title: string;
  description: string | null;
  timestamp: string;
  related_to: string | null;
  related_type: string | null;
  manager_id: string | null;
  created_at: string;
}

export interface DbContact {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  title: string | null;
  phone: string | null;
  cell: string | null;
  email: string | null;
  website: string | null;
  territory: string | null;
  assigned_to: string | null;
  created_at: string;
}

export interface DbRepTerritory {
  rep_id: string;
  territory_id: string;
}

export interface DbDealerSale {
  id: string;
  dealer_id: string;
  year: number;
  month: string;
  revenue: number | null;
  order_count: number | null;
  bookings: number | null;
  invoices: number | null;
  booking_count: number | null;
  invoice_count: number | null;
}

export interface DbTravelLog {
  id: string;
  rep_id: string | null;
  territory_id: string | null;
  travel_date: string;
  notes: string | null;
  monday_id: string | null;
  created_at: string;
}

// ── Hooks ─────────────────────────────────────────────────────────

export function useSalesReps() {
  return useQuery({
    queryKey: ["sales_reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_reps")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbSalesRep[];
    },
  });
}

export function useTerritories() {
  return useQuery({
    queryKey: ["territories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("territories")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbTerritory[];
    },
  });
}

export function useDealers() {
  return useQuery({
    queryKey: ["dealers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealers")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbDealer[];
    },
  });
}

export function useManagers() {
  return useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managers")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as DbManager[];
    },
  });
}

export function useActivities() {
  return useQuery({
    queryKey: ["activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as DbActivity[];
    },
  });
}

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbContact[];
    },
  });
}

export function useDealerSales() {
  return useQuery({
    queryKey: ["dealer_sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealer_sales")
        .select("*");
      if (error) throw error;
      return (data ?? []) as DbDealerSale[];
    },
  });
}

export function useRepTerritories() {
  return useQuery({
    queryKey: ["rep_territories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rep_territories")
        .select("*");
      if (error) throw error;
      return (data ?? []) as DbRepTerritory[];
    },
  });
}

export function useTravelLog() {
  return useQuery({
    queryKey: ["travel_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_log")
        .select("*")
        .order("travel_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DbTravelLog[];
    },
  });
}

// ── Display helpers ───────────────────────────────────────────────

export function getRepName(reps: DbSalesRep[], id: string | null): string {
  if (!id) return "Unassigned";
  return reps.find((r) => r.id === id)?.name || "Unknown";
}

export function getTerritoryName(territories: DbTerritory[], id: string | null): string {
  if (!id) return "Unassigned";
  return territories.find((t) => t.id === id)?.name || "Unknown";
}

export function getRepsByTerritory(reps: DbSalesRep[], repTerritories: DbRepTerritory[], territoryId: string): DbSalesRep[] {
  const repIds = repTerritories.filter((rt) => rt.territory_id === territoryId).map((rt) => rt.rep_id);
  return reps.filter((r) => repIds.includes(r.id));
}

export function getDealersByRep(dealers: DbDealer[], repId: string): DbDealer[] {
  return dealers.filter((d) => d.rep_id === repId);
}

export function getDealersByTerritory(dealers: DbDealer[], territoryId: string): DbDealer[] {
  return dealers.filter((d) => d.territory_id === territoryId);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const formatCurrency = (n: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n ?? 0);

export const formatPercent = (n: number) => `${Math.round(n * 100)}%`;
