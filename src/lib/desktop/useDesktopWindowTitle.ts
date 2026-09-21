import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { NAV_SECTIONS } from "@/config/navSections";
import { setWindowTitle, isDesktop } from "@/lib/desktop";

function titleForPath(pathname: string): string | undefined {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.url === pathname) return item.title;
      for (const child of item.children ?? []) {
        if (child.url === pathname) return child.title;
      }
    }
  }
  return undefined;
}

/** Keeps the native window title in sync with the current route, e.g. "Dealer Reporting — Lineage Collections". No-op on web. */
export function useDesktopWindowTitle() {
  const location = useLocation();
  useEffect(() => {
    if (!isDesktop()) return;
    const title = titleForPath(location.pathname) ?? "";
    setWindowTitle(title);
  }, [location.pathname]);
}
