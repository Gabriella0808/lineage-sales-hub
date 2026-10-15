import { useCallback, useEffect, useState } from "react";

// Lightweight, localStorage-only "recently viewed pages" tracker - no
// backend involved. Caps at MAX_ENTRIES, most-recent first, de-duped by
// path (revisiting a page moves it back to the front instead of
// duplicating it).
export interface RecentlyViewedEntry {
  path: string;
  title: string;
  ts: number;
}

const STORAGE_KEY = "lc.recentlyViewed";
const MAX_ENTRIES = 8;

function readStored(): RecentlyViewedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored(entries: RecentlyViewedEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore (private browsing / storage full / disabled)
  }
}

export function useRecentlyViewed() {
  const [entries, setEntries] = useState<RecentlyViewedEntry[]>(() => readStored());

  const record = useCallback((path: string, title: string) => {
    setEntries((prev) => {
      const next = [{ path, title, ts: Date.now() }, ...prev.filter((e) => e.path !== path)].slice(0, MAX_ENTRIES);
      writeStored(next);
      return next;
    });
  }, []);

  // Keep in sync if another tab updates it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEntries(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { entries, record };
}
