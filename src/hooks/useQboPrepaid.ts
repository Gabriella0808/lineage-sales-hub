import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QboPrepaidSummary {
  qbo_account_name: string;
  current_balance: number;
  synced_at: string;
}

export interface QboPrepaidLine {
  id: string;
  qbo_txn_id: string | null;
  transaction_date: string;
  transaction_type: string | null;
  doc_num: string | null;
  vendor_name: string | null;
  memo: string | null;
  amount: number;
  running_balance: number | null;
}

// The "Vendor Prepayments" account in QuickBooks Online, synced by the
// sync-qbo-vendor-prepayments edge function.
export function useQboPrepaidSummary() {
  return useQuery({
    queryKey: ["qbo_prepaid_summary"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("portal_qbo_vendor_prepayments")
        .select("qbo_account_name, current_balance, synced_at")
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      return row ? ({ ...row, current_balance: Number(row.current_balance) } as QboPrepaidSummary) : null;
    },
  });
}

export function useQboPrepaidLines(enabled: boolean) {
  return useQuery({
    queryKey: ["qbo_prepaid_lines"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: QboPrepaidLine[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await (supabase as any)
          .from("portal_qbo_vendor_prepayment_lines")
          .select("id, qbo_txn_id, transaction_date, transaction_type, doc_num, vendor_name, memo, amount, running_balance")
          .order("transaction_date", { ascending: false })
          .order("id", { ascending: true })
          .range(start, start + 999);
        if (error) throw error;
        out.push(...((data ?? []) as QboPrepaidLine[]).map((r) => ({ ...r, amount: Number(r.amount), running_balance: r.running_balance == null ? null : Number(r.running_balance) })));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
}
