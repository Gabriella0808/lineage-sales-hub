import { useCallback, useEffect, useState } from "react";

// Favorites/pinned pages - localStorage-only, same key the sidebar config
// previously reserved (PINS_KEY) but never wired up. Pure client-side
// preference, no backend, no effect on NAV_SECTIONS or access control -
// just which existing pages a user has starred for quick access.
const STORAGE_KEY = "lc.navPins";

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeStored(urls: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
  } catch {
    // ignore
  }
}

export function useNavPins() {
  const [pinned, setPinned] = useState<string[]>(() => readStored());

  const isPinned = useCallback((url: string) => pinned.includes(url), [pinned]);

  const togglePin = useCallback((url: string) => {
    setPinned((prev) => {
      const next = prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url];
      writeStored(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPinned(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { pinned, isPinned, togglePin };
}
