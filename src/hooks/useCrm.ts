import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const LIFECYCLE_STAGES = [
  { id: "lead", label: "Lead", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "prospect", label: "Prospect", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "customer", label: "Customer", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { id: "dealer", label: "Dealer", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { id: "inactive", label: "Inactive", color: "bg-zinc-100 text-zinc-500 border-zinc-200" },
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]["id"];

export interface CrmAccount {
  id: string;
  company_name: string;
  lifecycle_stage: LifecycleStage;
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
  });
}

export function useCrmAccount(id: string | undefined) {
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
    onSuccess: (_d, v) => {
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
