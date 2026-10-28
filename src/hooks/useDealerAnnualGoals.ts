import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Per-dealer annual goals (Dealer Reporting "2027 Goal" column). Writes go
// through set_/unlock_dealer_annual_goal, which enforce who can edit - see
// 20261028020000_dealer_annual_goals.sql. Keys are lower/trimmed
// Acctivate customer IDs.
export type DealerGoalAccess = "manage" | "rep";

export interface DealerGoal {
  amount: number;
  locked: boolean;
}

// 2027 Goal columns (and their What's New popup) are in preview - visible
// to these accounts only until rolled out to reps. Local dev shows them to
// every account so rep/manager views can be tested.
const DEALER_GOAL_VISIBLE_TO_EMAILS = new Set([
  "justin@lineage-collections.com",
  "scott@lineage-collections.com",
  "gabriella@lineage-collections.com",
  "chris@lineage-collections.com",
]);

export function canSeeDealerGoals(email?: string | null) {
  return import.meta.env.DEV || DEALER_GOAL_VISIBLE_TO_EMAILS.has((email ?? "").toLowerCase());
}

// PostgREST caps every response at 1000 rows; an admin's access list is
// ~1,400 dealers, so both queries page through with .range().
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return all;
  }
}

export function dealerGoalKey(customerId: string) {
  return customerId.trim().toLowerCase();
}

export function useDealerAnnualGoals(year: number, enabled = true) {
  const goalsQuery = useQuery({
    queryKey: ["dealer_annual_goals", year],
    enabled,
    staleTime: 60_000,
    queryFn: () => fetchAllPages<{ customer_key: string; amount: number; locked: boolean }>((from, to) =>
      (supabase as any)
        .from("dealer_annual_goals")
        .select("customer_key, amount, locked")
        .eq("goal_year", year)
        .order("customer_key")
        .range(from, to)),
  });

  const accessQuery = useQuery({
    queryKey: ["my_dealer_goal_access"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => fetchAllPages<{ customer_key: string; access: DealerGoalAccess }>((from, to) =>
      (supabase as any).rpc("my_dealer_goal_access").order("customer_key").range(from, to)),
  });

  const goals = useMemo(
    () => new Map((goalsQuery.data ?? []).map((g) => [g.customer_key, { amount: Number(g.amount) || 0, locked: g.locked }])),
    [goalsQuery.data],
  );
  const access = useMemo(
    () => new Map((accessQuery.data ?? []).map((a) => [a.customer_key, a.access])),
    [accessQuery.data],
  );

  return { goals, access };
}

// Rep Reporting: each rep's total of the goals on their assigned dealers,
// keyed by lower/trimmed Acctivate rep ID.
export function useDealerGoalTotalsByRep(year: number, enabled = true) {
  const query = useQuery({
    queryKey: ["dealer_goal_totals_by_rep", year],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dealer_goal_totals_by_rep", { p_year: year });
      if (error) throw error;
      return (data ?? []) as { rep_key: string; total_goal: number }[];
    },
  });
  return useMemo(
    () => new Map((query.data ?? []).map((r) => [r.rep_key, Number(r.total_goal) || 0])),
    [query.data],
  );
}

export function useSetDealerAnnualGoal(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, amount }: { customerId: string; amount: number }) => {
      const { error } = await (supabase as any).rpc("set_dealer_annual_goal", {
        p_customer_id: customerId, p_year: year, p_amount: amount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dealer_annual_goals", year] });
      qc.invalidateQueries({ queryKey: ["dealer_goal_totals_by_rep", year] });
    },
  });
}

export function useUnlockDealerAnnualGoal(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customerId: string) => {
      const { error } = await (supabase as any).rpc("unlock_dealer_annual_goal", {
        p_customer_id: customerId, p_year: year,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dealer_annual_goals", year] });
      qc.invalidateQueries({ queryKey: ["dealer_goal_totals_by_rep", year] });
    },
  });
}
