import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAcctivateRepCatalog } from "@/hooks/useAcctivateRepCatalog";

const CRM_STALE_TIME = 60_000;

export const LIFECYCLE_STAGES = [
  { id: "prospect", label: "Prospect", dot: "bg-blue-500" },
  { id: "contact_made", label: "Contact Made", dot: "bg-amber-500" },
  { id: "closed_won", label: "Closed Won", dot: "bg-emerald-500" },
  { id: "closed_lost", label: "Closed Lost", dot: "bg-rose-500" },
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]["id"];

export const BRANDS = ["Cabinet Beds", "Sea Winds", "Finn & Louise", "Lux Lighting"] as const;
export type Brand = (typeof BRANDS)[number];

export const BRAND_COLORS: Record<Brand, string> = {
  "Cabinet Beds": "bg-slate-500",
  "Sea Winds": "bg-cyan-500",
  "Finn & Louise": "bg-violet-500",
  "Lux Lighting": "bg-amber-500",
};

export const ACCOUNT_TYPES = [
  { id: "prospect", label: "Prospect", dot: "bg-blue-500" },
  { id: "dealer", label: "Dealer", dot: "bg-emerald-500" },
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number]["id"];

export type ProspectType = string;

export interface ProspectTypeRow {
  id: string;
  name: string;
}

export function useProspectTypes() {
  return useQuery({
    queryKey: ["crm_prospect_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_prospect_types")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProspectTypeRow[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateProspectType() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name required");
      const { data, error } = await supabase
        .from("crm_prospect_types")
        .insert({ name: trimmed, created_by: user?.id })
        .select("id, name")
        .single();
      if (error) throw error;
      return data as ProspectTypeRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_prospect_types"] }),
  });
}

export interface CrmAccount {
  id: string;
  company_name: string;
  lifecycle_stage: LifecycleStage;
  account_type: AccountType;
  prospect_type: ProspectType | null;
  prospect_types: string[];
  brand: Brand;
  brands: Brand[];
  status: string;
  assigned_rep_id: string | null;
  assigned_manager_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  main_phone: string | null;
  email: string | null;
  website: string | null;
  street_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  rep_owner: string | null;
  buying_group: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Rep {
  id: string;
  name: string;
  email: string | null;
  manager_id: string | null;
  /** True when this rep's name was resolved from the live Acctivate sync.
   *  Pages should filter to acctivateMatched when rendering the "assign to"
   *  picker (strictly Acctivate-sourced, per instruction) - every row stays
   *  in this array regardless, so an existing prospect already assigned to
   *  a non-matched rep still resolves and displays its name correctly. */
  acctivateMatched: boolean;
}


export function useCrmAccounts() {
  return useQuery({
    queryKey: ["crm_accounts"],
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      const allById = new Map<string, CrmAccount>();
      // Paginate past PostgREST's default 1000-row cap so all prospects/dealers load.
      while (true) {
        const { data, error } = await supabase
          .from("crm_accounts")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data ?? []) as CrmAccount[];
        chunk.forEach((account) => allById.set(account.id, account));
        if (chunk.length < PAGE) break;
        from += PAGE;
      }
      return Array.from(allById.values());
    },
    staleTime: CRM_STALE_TIME,
  });
}

export function useCrmAccount(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["crm_account", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as CrmAccount | null;
    },
    staleTime: CRM_STALE_TIME,
    placeholderData: () => {
      const list = qc.getQueryData<CrmAccount[]>(["crm_accounts"]);
      return list?.find((a) => a.id === id) ?? undefined;
    },
  });
}

// Prospects assignment still stores a real public.sales_reps.id FK
// (crm_accounts.assigned_rep_id) - Prospects' own data was explicitly left
// out of the manager/rep dedup migration, so that FK space is untouched.
// This only overlays the display name with Acctivate's name where a rep has
// a matching Acctivate code; a rep with no Acctivate match keeps their
// portal name rather than disappearing from the assignment picker.
export function useCrmReps() {
  const { activeReps, getSalesRepIdByAcId } = useAcctivateRepCatalog();
  const query = useQuery({
    queryKey: ["crm_reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_reps")
        .select("id, name, email, manager_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Rep[];
    },
    staleTime: 5 * 60_000,
  });

  const data = useMemo(() => {
    if (!query.data) return query.data;
    const acctivateNameById = new Map<string, string>();
    for (const r of activeReps) {
      const id = getSalesRepIdByAcId(r.acctivate_id);
      if (id) acctivateNameById.set(id, r.name);
    }
    return query.data
      .map((r) => {
        const acctivateName = acctivateNameById.get(r.id);
        return { ...r, name: acctivateName ?? r.name, acctivateMatched: !!acctivateName };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query.data, activeReps, getSalesRepIdByAcId]);

  return { ...query, data };
}

export interface Manager {
  id: string;
  name: string;
  email: string | null;
  /** True when this manager's name is one of Acctivate's own (Hospitality/
   *  House/Mateo/Will). The other 5 real portal managers (Chris De Lisa,
   *  Justin, Kate, Scott, Sergio) have no Acctivate code at all - kept in
   *  this array (per the "combine both sources" decision for Prospects
   *  specifically) but flagged false so a strict picker can distinguish
   *  them if needed. */
  acctivateMatched: boolean;
}

// Prospects assignment stores a real public.managers.id FK
// (crm_accounts.assigned_manager_id). The bare duplicate manager rows
// ("Mateo"/"Will" alongside "Mateo De Lisa"/"Will Grisack") that used to
// live here are gone now (20261006030000 repointed every remaining
// crm_accounts reference, 20261006040000 deleted the now-fully-orphaned
// rows) - every manager returned here is real. Names are relabeled to
// Acctivate's own name where resolvable; the 5 real managers with no
// Acctivate code (Chris De Lisa, Justin, Kate, Scott, Sergio) keep their
// portal name and acctivateMatched: false, since Prospects intentionally
// keeps using them (unlike the strict-Acctivate-only pages elsewhere).
export function useCrmManagers() {
  const { managers: acctivateManagerNames } = useAcctivateRepCatalog();
  const query = useQuery({
    queryKey: ["crm_managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managers")
        .select("id, name, email")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Manager[];
    },
    staleTime: 5 * 60_000,
  });

  const data = useMemo(() => {
    if (!query.data) return query.data;
    const acctivateByFirstName = new Map(
      acctivateManagerNames.map((n) => [n.split(/\s+/)[0].toLowerCase(), n]),
    );
    return query.data.map((m) => {
      const firstName = m.name.trim().split(/\s+/)[0].toLowerCase();
      const acctivateName = acctivateByFirstName.get(firstName);
      return acctivateName
        ? { ...m, name: acctivateName, acctivateMatched: true }
        : { ...m, acctivateMatched: false };
    });
  }, [query.data, acctivateManagerNames]);

  return { ...query, data };
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CrmAccount> }) => {
      const { error } = await supabase.from("crm_accounts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["crm_accounts"] });
      await qc.cancelQueries({ queryKey: ["crm_account", id] });
      const prevList = qc.getQueryData<CrmAccount[]>(["crm_accounts"]);
      const prevOne = qc.getQueryData<CrmAccount>(["crm_account", id]);
      if (prevList) {
        qc.setQueryData<CrmAccount[]>(
          ["crm_accounts"],
          prevList.map((a) => (a.id === id ? ({ ...a, ...patch } as CrmAccount) : a))
        );
      }
      if (prevOne) {
        qc.setQueryData<CrmAccount>(["crm_account", id], { ...prevOne, ...patch } as CrmAccount);
      }
      return { prevList, prevOne };
    },
    onError: (_e, v, ctx: any) => {
      if (ctx?.prevList) qc.setQueryData(["crm_accounts"], ctx.prevList);
      if (ctx?.prevOne) qc.setQueryData(["crm_account", v.id], ctx.prevOne);
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ["crm_accounts"] });
      qc.invalidateQueries({ queryKey: ["crm_account", v.id] });
      qc.invalidateQueries({ queryKey: ["crm_stage_history", v.id] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from("crm_accounts")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_accounts"] });
      qc.invalidateQueries({ queryKey: ["dealers"] });
      qc.invalidateQueries({ queryKey: ["dealer_check_ins"] });
    },
  });
}

export function useRestoreAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from("crm_accounts")
        .update({ deleted_at: null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_accounts"] });
    },
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (account: Partial<CrmAccount>) => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .insert({ ...account, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as CrmAccount;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_accounts"] }),
  });
}

export function useStageHistory(accountId: string | undefined) {
  return useQuery({
    queryKey: ["crm_stage_history", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_account_stage_history")
        .select("*")
        .eq("account_id", accountId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: CRM_STALE_TIME,
  });
}

export function useAccountLastVisited(accountId: string | undefined) {
  return useQuery({
    queryKey: ["crm_last_visited", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data: linkedDealers, error: dealerError } = await supabase
        .from("dealers")
        .select("id")
        .eq("crm_account_id", accountId!);
      if (dealerError) throw dealerError;
      if (!linkedDealers?.length) return null;
      const dealerIds = linkedDealers.map((d) => d.id);
      const { data: checkIns, error: checkInError } = await supabase
        .from("dealer_check_ins")
        .select("visit_date")
        .in("dealer_id", dealerIds)
        .order("visit_date", { ascending: false })
        .limit(1);
      if (checkInError) throw checkInError;
      return (checkIns?.[0]?.visit_date as string | null) ?? null;
    },
    staleTime: CRM_STALE_TIME,
  });
}

export function useAccountNotes(accountId: string | undefined) {
  return useQuery({
    queryKey: ["crm_notes", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_account_notes")
        .select("*")
        .eq("account_id", accountId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: CRM_STALE_TIME,
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ accountId, body }: { accountId: string; body: string }) => {
      const { error } = await supabase
        .from("crm_account_notes")
        .insert({ account_id: accountId, body, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["crm_notes", v.accountId] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accountId }: { id: string; accountId: string }) => {
      const { error } = await supabase.from("crm_account_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["crm_notes", v.accountId] }),
  });
}
