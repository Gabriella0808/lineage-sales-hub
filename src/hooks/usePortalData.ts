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
  source: string | null;
  manager_id: string | null;
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
  manager_id: string | null;
  salesperson_name: string | null;
  purpose: string | null;
  approval_status: string | null;
  travel_end_date: string | null;
}

export interface DbProduct {
  id: string;
  acctivate_id: string | null;
  sku: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  collection: string | null;
}

export interface DbDealerSalesLine {
  id: string;
  dealer_id: string;
  product_id: string;
  year: number;
  month: string;
  bookings: number | null;
  invoices: number | null;
  booking_count: number | null;
  invoice_count: number | null;
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

// Fetch all rows from a table, paginating past Supabase's 1000-row default cap.
async function fetchAllRows<T>(table: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Loop until a page returns fewer rows than requested.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(table as never)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export function useDealers() {
  return useQuery({
    queryKey: ["dealers", "commercial", "ytd_invoices"],
    queryFn: async () => {
      const rows = await fetchAllRows<DbDealer>("dealers");
      const commercial = rows.filter((d) => {
        if ((d.source ?? "acctivate") === "field_only") return false;
        const salesperson = ((d as any).salesperson ?? "").trim();
        const territory = ((d as any).territory ?? "").trim();
        return Boolean(salesperson || territory);
      });

      // Overlay YTD invoice totals from dealer_invoices onto dealer.revenue
      // so dealer cards and the detail panel show live Acctivate revenue.
      const currentYear = new Date().getFullYear();
      const startOfYear = `${currentYear}-01-01`;
      const invRows: { dealer_id: string | null; total: number | null }[] = [];
      let from = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("dealer_invoices")
          .select("dealer_id, total")
          .gte("invoice_date", startOfYear)
          .not("dealer_id", "is", null)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as { dealer_id: string | null; total: number | null }[];
        invRows.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      const ytdByDealer = new Map<string, number>();
      for (const r of invRows) {
        if (!r.dealer_id) continue;
        ytdByDealer.set(r.dealer_id, (ytdByDealer.get(r.dealer_id) ?? 0) + Number(r.total ?? 0));
      }

      return commercial
        .map((d) => ({ ...d, revenue: ytdByDealer.get(d.id) ?? d.revenue ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
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

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function useDealerSales() {
  return useQuery({
    queryKey: ["dealer_sales", "from_invoices_and_lines"],
    queryFn: async () => {
      // Bookings come from dealer_sales_lines (sparse). Invoices + revenue come from
      // the live dealer_invoices table synced from Acctivate.
      const [lines, invoices] = await Promise.all([
        fetchAllRows<DbDealerSalesLine>("dealer_sales_lines"),
        (async () => {
          const out: { dealer_id: string | null; invoice_date: string | null; total: number | null }[] = [];
          let from = 0;
          const pageSize = 1000;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { data, error } = await supabase
              .from("dealer_invoices")
              .select("dealer_id, invoice_date, total")
              .not("dealer_id", "is", null)
              .range(from, from + pageSize - 1);
            if (error) throw error;
            const batch = (data ?? []) as typeof out;
            out.push(...batch);
            if (batch.length < pageSize) break;
            from += pageSize;
          }
          return out;
        })(),
      ]);

      const map = new Map<string, DbDealerSale>();
      const ensure = (dealer_id: string, year: number, month: string): DbDealerSale => {
        const key = `${dealer_id}|${year}|${month}`;
        let cur = map.get(key);
        if (!cur) {
          cur = { id: key, dealer_id, year, month, revenue: 0, order_count: 0, bookings: 0, invoices: 0, booking_count: 0, invoice_count: 0 };
          map.set(key, cur);
        }
        return cur;
      };

      for (const l of lines) {
        const cur = ensure(l.dealer_id, l.year, l.month);
        cur.bookings = (cur.bookings ?? 0) + (l.bookings ?? 0);
        cur.booking_count = (cur.booking_count ?? 0) + (l.booking_count ?? 0);
      }

      for (const inv of invoices) {
        if (!inv.dealer_id || !inv.invoice_date) continue;
        const d = new Date(inv.invoice_date);
        if (Number.isNaN(d.getTime())) continue;
        const year = d.getUTCFullYear();
        const month = MONTH_ABBR[d.getUTCMonth()];
        const cur = ensure(inv.dealer_id, year, month);
        cur.invoices = (cur.invoices ?? 0) + Number(inv.total ?? 0);
        cur.invoice_count = (cur.invoice_count ?? 0) + 1;
      }

      for (const cur of map.values()) {
        cur.revenue = (cur.invoices ?? 0) > 0 ? cur.invoices : cur.bookings;
        cur.order_count = (cur.invoice_count ?? 0) > 0 ? cur.invoice_count : cur.booking_count;
      }

      return Array.from(map.values());
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

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("sku");
      if (error) throw error;
      return (data ?? []) as DbProduct[];
    },
  });
}

export function useDealerSalesLines() {
  return useQuery({
    queryKey: ["dealer_sales_lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dealer_sales_lines").select("*");
      if (error) throw error;
      return (data ?? []) as DbDealerSalesLine[];
    },
  });
}

// ── Display helpers ───────────────────────────────────────────────

export function getRepName(reps: DbSalesRep[], id: string | null): string {
  if (!id) return "";
  return reps.find((r) => r.id === id)?.name || "Unknown";
}

export function getTerritoryName(territories: DbTerritory[], id: string | null): string {
  if (!id) return "";
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
