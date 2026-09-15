import { createContext, useContext, useEffect, useMemo, useRef, ReactNode } from "react";

/**
 * Generic, opt-in "current page filter state" channel for the global Report
 * Issue feature (see ReportIssueDialog.tsx). A page that wants its active
 * filters included in a bug report calls useRegisterReportContext(obj) with
 * a plain, JSON-serializable object describing what's currently selected.
 * ReportIssueDialog reads the latest registered value via
 * useCurrentReportContext() when it opens.
 *
 * Only one page is normally mounted at a time under the router, so a single
 * mutable slot (not a stack/map) is enough. Unmounting a registered page
 * clears the slot so stale filters never leak into a report from an
 * unrelated page.
 *
 * Deliberately NOT wired into every page — only pages that explicitly call
 * useRegisterReportContext get their filters attached. Pages that don't
 * register anything simply omit filter context from the report.
 */

type ReportContextValue = Record<string, unknown>;

interface ReportContextApi {
  setContext: (data: ReportContextValue | null) => void;
  getContext: () => ReportContextValue | null;
}

const ReportContext = createContext<ReportContextApi | null>(null);

export function ReportContextProvider({ children }: { children: ReactNode }) {
  const slotRef = useRef<ReportContextValue | null>(null);

  const api = useMemo<ReportContextApi>(() => ({
    setContext: (data) => { slotRef.current = data; },
    getContext: () => slotRef.current,
  }), []);

  return <ReportContext.Provider value={api}>{children}</ReportContext.Provider>;
}

/**
 * Publishes `data` as the current page's report context. Pass a
 * useMemo-stabilized object (or primitives in your own deps) — this effect
 * re-registers whenever the reference changes. Automatically clears on
 * unmount. Pass null/undefined to explicitly clear without unmounting.
 */
export function useRegisterReportContext(data: ReportContextValue | null | undefined): void {
  const ctx = useContext(ReportContext);

  useEffect(() => {
    if (!ctx) return;
    ctx.setContext(data ?? null);
    return () => { ctx.setContext(null); };
  }, [ctx, data]);
}

/** Reads whatever the currently-mounted page has registered, if anything. */
export function useCurrentReportContext(): ReportContextValue | null {
  const ctx = useContext(ReportContext);
  return ctx ? ctx.getContext() : null;
}
