import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";

// Who sees the tour. Set to "everyone" when it is ready to roll out.
const TOUR_AUDIENCE: "gabriella" | "everyone" = "everyone";
const TESTERS = ["gabriella@lineage-collections.com"];
// Bump this when there is a new tour worth showing again.
const TOUR_VERSION = "2026-09-22";
const SEEN_KEY = "lc.tourSeen";
export const START_TOUR_EVENT = "lc:start-tour";

export function canUseTour(email?: string | null) {
  if (TOUR_AUDIENCE === "everyone") return true;
  return !!email && TESTERS.includes(email.toLowerCase());
}

const has = (sel: string) => !!document.querySelector(sel);

function buildSteps(role?: string): DriveStep[] {
  const isLeader = role === "admin" || role === "manager";
  const steps: (DriveStep | null)[] = [
    {
      popover: {
        title: "What's new in the portal",
        description: "A quick tour of the newest features. It takes about a minute, and you can replay it any time from your account menu.",
      },
    },
    has('[data-tour="search"]') ? { element: '[data-tour="search"]', popover: { title: "Jump anywhere", description: "Press Ctrl K (or Cmd K on a Mac) from any page to search for a page and go straight to it." } } : null,
    has('[data-tour="theme"]') ? { element: '[data-tour="theme"]', popover: { title: "Light and dark mode", description: "Switch the whole portal between light and dark. Your choice is remembered." } } : null,
    has('[data-tour="account"]') ? { element: '[data-tour="account"]', popover: { title: "Your account menu", description: "Pick how navigation looks (classic sidebar, top bar, bottom dock or right-side drawer), choose light or dark, and replay this tour." } } : null,
    has('[data-tour="report-tabs"]') ? { element: '[data-tour="report-tabs"]', popover: { title: "All the reports in one place", description: "Switch between Live KPI, Dealer Reporting, Rep Reporting and High-Level Reporting from this bar." } } : null,
    has('[data-tour="goal-card"]') ? { element: '[data-tour="goal-card"]', popover: { title: "Progress against goal", description: "Bookings and invoicing show how far you are toward the month's goal. The small marker shows where you should be by today, and the bar color tells you if you're ahead or behind." } } : null,
    has('[data-tour="tab-executive"]') ? { element: '[data-tour="tab-executive"]', popover: { title: "High-Level Reporting", description: "A business overview with a period switch, target progress, dealer health (slowing, growing, gone quiet) and a rep leaderboard. Click any dealer or rep to open their detail." } } : null,
    {
      popover: {
        title: "Also new",
        description: isLeader
          ? "Click a rep in Rep Reporting to see their progress against their sales target. On the Inventory page, the Prepaid Inventory card now shows the live QuickBooks balance and its full ledger."
          : "That's the tour. You can replay it any time from your account menu.",
      },
    },
  ];
  return steps.filter(Boolean) as DriveStep[];
}

let cursorEl: HTMLDivElement | null = null;

function moveCursor(el?: Element) {
  if (!el) return;
  if (!cursorEl) {
    cursorEl = document.createElement("div");
    cursorEl.setAttribute("aria-hidden", "true");
    cursorEl.style.cssText = "position:fixed;left:0;top:0;z-index:100001;pointer-events:none;transition:transform .7s cubic-bezier(.22,1,.36,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));";
    cursorEl.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"><path d="M4 3l16 7-7 2-2 7z"/></svg>';
    document.body.appendChild(cursorEl);
  }
  const r = el.getBoundingClientRect();
  cursorEl.style.transform = `translate(${Math.round(r.left + r.width / 2)}px, ${Math.round(r.top + r.height / 2)}px)`;
}

function removeCursor() {
  cursorEl?.remove();
  cursorEl = null;
}

export function runTour(role?: string) {
  const steps = buildSteps(role);
  const d = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps,
    onHighlightStarted: (el) => moveCursor(el),
    onDestroyed: () => {
      removeCursor();
      try { localStorage.setItem(SEEN_KEY, TOUR_VERSION); } catch { /* ignore */ }
    },
  });
  d.drive();
}

export function WhatsNewTour() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: roleInfo } = useUserRole();
  const role = roleInfo?.role;
  const allowed = canUseTour(user?.email);

  // Auto-start once per version, on the Company-wide page.
  useEffect(() => {
    if (!allowed || location.pathname !== "/") return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
    if (seen === TOUR_VERSION) return;
    const t = window.setTimeout(() => runTour(role), 2500);
    return () => window.clearTimeout(t);
  }, [allowed, location.pathname, role]);

  // Replay from the account menu.
  useEffect(() => {
    if (!allowed) return;
    const onStart = () => {
      if (location.pathname !== "/") {
        navigate("/");
        window.setTimeout(() => runTour(role), 1500);
      } else {
        runTour(role);
      }
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [allowed, location.pathname, navigate, role]);

  return null;
}
