import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

export const PROSPECT_TYPES = [
  { id: "night_and_day", label: "Night & Day", dot: "bg-violet-500" },
  { id: "top_100", label: "Top 100 Furniture Stores", dot: "bg-amber-500" },
] as const;
export type ProspectType = (typeof PROSPECT_TYPES)[number]["id"];

export interface CrmAccount {
  id: string;
  company_name: string;
  lifecycle_stage: LifecycleStage;
  account_type: AccountType;
  brand: Brand;
  status: string;
  assigned_rep_id: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface Rep {
  id: string;
  name: string;
  email: string | null;
}

export function useCrmAccounts() {
  return useQuery({
    queryKey: ["crm_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmAccount[];
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

export function useCrmReps() {
  return useQuery({
    queryKey: ["crm_reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_reps")
        .select("id, name, email")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Rep[];
    },
    staleTime: 5 * 60_000,
  });
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
