import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "lc.theme";

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

// Switches instantly: .theme-switching (index.css) suspends every
// transition for the one frame the class flips in. Otherwise the global
// 100ms color fade runs on every element at once - thousands of rows on
// the reporting tables - and the page repaints in a staggered, half-light/
// half-dark mess.
export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const dark = resolveTheme(mode) === "dark";
  if (root.classList.contains("dark") === dark) return;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", dark);
  void root.offsetHeight; // commit the new colors before transitions come back
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(getStoredTheme);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    applyTheme(m);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  return { mode, setMode, resolved: resolveTheme(mode) };
}
