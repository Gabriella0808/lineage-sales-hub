import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export interface CompareNote {
  account: string;
  collection: string;
  note: string;
}

const keyFor = (account: string, collection: string) =>
  `${account}__||__${collection}`;

export function useComparePeriodsNotes() {
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("compare_periods_notes")
      .select("account, collection, note");
    const m = new Map<string, string>();
    for (const row of data ?? []) {
      m.set(keyFor((row as any).account, (row as any).collection), (row as any).note ?? "");
    }
    setNotes(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    // Realtime: keep notes & sales fresh
    const ch = supabase
      .channel("compare-periods-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "compare_periods_notes" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dealer_sales" },
        () => {
          qc.invalidateQueries({ queryKey: ["dealer_sales"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dealer_sales_lines" },
        () => {
          qc.invalidateQueries({ queryKey: ["dealer_sales_lines"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh, qc]);

  const saveNote = useCallback(
    async (account: string, collection: string, note: string) => {
      const k = keyFor(account, collection);
      // optimistic
      setNotes((prev) => {
        const n = new Map(prev);
        n.set(k, note);
        return n;
      });
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .from("compare_periods_notes")
        .upsert(
          { account, collection, note, updated_by: user?.id ?? null },
          { onConflict: "account,collection" },
        );
      if (error) console.error("Failed to save note", error);
    },
    [],
  );

  const getNote = useCallback(
    (account: string, collection: string, fallback: string | null) => {
      const k = keyFor(account, collection);
      return notes.has(k) ? notes.get(k)! : (fallback ?? "");
    },
    [notes],
  );

  return { notes, loading, saveNote, getNote, refresh };
}
