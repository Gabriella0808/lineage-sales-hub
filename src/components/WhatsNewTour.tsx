import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const START_TOUR_EVENT = "lc:start-tour";

// High-Level Reporting walkthrough audience - matches the page's own
// access rule (CompanyWidePage.tsx's canSeeExecutive: admin/manager only,
// reps and dealers excluded).
export function canUseHighLevelReportingTour(role?: string) {
  return role === "admin" || role === "manager";
}

// The "what's changed" popup - shown only to admin/manager accounts (the
// only audience with anything to see right now), once per person per
// version, shortly after sign-in/reload. Reps and dealers get nothing -
// there's no rep/dealer-facing feature to announce here.
const ANNOUNCEMENT_VERSION = "2026-10-08";
const ANNOUNCEMENT_SEEN_KEY = "lc.announcementSeen";
const announcementSeenKeyFor = (email?: string | null) => `${ANNOUNCEMENT_SEEN_KEY}:${(email ?? "").toLowerCase()}`;

const has = (sel: string) => !!document.querySelector(sel);

// High-Level Reporting walkthrough - only reachable on the Company-wide
// page with the executive tab active (/company-wide?report=executive), so
// every element it targets is real rather than a mock. Every step but the
// first two is skipped gracefully via has() if something isn't on screen
// yet (e.g. the manager filter for someone scoped to a single manager).
function buildHighLevelReportingSteps(): DriveStep[] {
  const steps: (DriveStep | null)[] = [
    {
      popover: {
        title: "High-Level Reporting",
        description: "A new executive-style overview - revenue, targets, dealer health and rep performance at a glance, all on one page.",
      },
    },
    has('[data-tour="hlr-insights"]') ? {
      element: '[data-tour="hlr-insights"]',
      popover: {
        title: "Insights",
        description: "The headline call-outs - invoicing pace vs target, how bookings are trending, dealers that have gone quiet, and how concentrated revenue is in your top dealers.",
      },
    } : null,
    has('[data-tour="hlr-kpis"]') ? {
      element: '[data-tour="hlr-kpis"]',
      popover: {
        title: "The numbers",
        description: "Bookings, invoiced, active dealers and open order backlog, each with a trend line and a comparison to the prior period.",
      },
    } : null,
    has('[data-tour="hlr-period"]') ? {
      element: '[data-tour="hlr-period"]',
      popover: {
        title: "Change the period",
        description: "Switch between Month, Quarter, 30 days, 90 days or Since Jul 1 - everything on the page updates to match.",
      },
    } : null,
    has('[data-tour="hlr-manager-filter"]') ? {
      element: '[data-tour="hlr-manager-filter"]',
      popover: {
        title: "Filter by manager",
        description: "Admins can scope the whole page to one sales manager's team; managers see their own team automatically.",
      },
    } : null,
    has('[data-tour="hlr-dealer-tabs"]') ? {
      element: '[data-tour="hlr-dealer-tabs"]',
      popover: {
        title: "Dealer movement",
        description: "Top, Slowing, Growing, Gone quiet and New - click into any of these to see exactly which dealers, and export the list to CSV.",
      },
    } : null,
    {
      popover: {
        title: "That's High-Level Reporting",
        description: "That's the tour. You can replay it any time from your account menu.",
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

// Doesn't record its own "seen" state - when run from the announcement
// popup below, that's tracked once at the announcement level; when
// replayed directly from the account menu, replaying on purpose obviously
// doesn't need to be remembered as "already seen".
export function runHighLevelReportingTour(onDone?: () => void) {
  const steps = buildHighLevelReportingSteps();
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
    onDestroyed: () => { removeCursor(); onDone?.(); },
  });
  d.drive();
}

// Navigates to the tour's page (including its ?report= query, so it lands
// on the right tab even when the pathname alone already matches - e.g.
// someone on Dealer Reporting replaying the tour from the account menu),
// waits for its content to actually exist (rather than guessing one fixed
// delay - a cold page load is much slower than an already-warm in-app
// navigation), then runs it. Gives up waiting after 8s and runs anyway, so
// the tour still plays (just skipping content steps via has()) even if
// the page has nothing to show yet. navigate() to the same resolved URL
// is a harmless no-op in React Router, so this always re-navigates rather
// than trying to detect whether it's already needed.
function goToAndRun(navigate: ReturnType<typeof useNavigate>, path: string, selectors: string[], run: (onDone: () => void) => void, onDone: () => void) {
  navigate(path);
  window.setTimeout(() => {
    const deadline = Date.now() + 8000;
    const tick = () => {
      if (selectors.some(has) || Date.now() >= deadline) { run(onDone); return; }
      window.setTimeout(tick, 250);
    };
    tick();
  }, 400);
}

const HLR_PATH = "/company-wide?report=executive";
const HLR_SELECTORS = ['[data-tour="hlr-insights"]', '[data-tour="hlr-kpis"]'];

export function WhatsNewTour() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: roleInfo } = useUserRole();
  const role = roleInfo?.role;
  const allowed = canUseHighLevelReportingTour(role);

  // The "what's changed" popup - admin/manager only, once per person per
  // version, shortly after sign-in/reload. Reps and dealers never see it.
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  useEffect(() => {
    if (!user?.email || !allowed) return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(announcementSeenKeyFor(user.email)); } catch { /* ignore */ }
    if (seen === ANNOUNCEMENT_VERSION) return;
    const t = window.setTimeout(() => setAnnouncementOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, [user?.email, allowed]);

  const dismissAnnouncement = () => {
    setAnnouncementOpen(false);
    try { if (user?.email) localStorage.setItem(announcementSeenKeyFor(user.email), ANNOUNCEMENT_VERSION); } catch { /* ignore */ }
  };

  const runNewFeatureTour = () => {
    if (!allowed) return;
    goToAndRun(navigate, HLR_PATH, HLR_SELECTORS, runHighLevelReportingTour, () => {});
  };

  // Replay from the account menu - admin/manager only (the menu item
  // itself is hidden for anyone else, see AppLayout.tsx).
  useEffect(() => {
    if (!allowed) return;
    const onStart = () => runNewFeatureTour();
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, location.pathname]);

  if (!allowed) return null;

  return (
    <Dialog open={announcementOpen} onOpenChange={(v) => { if (!v) dismissAnnouncement(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>What's new in High-Level Reporting</DialogTitle>
          <DialogDescription>
            A new executive-style overview page - revenue, targets, dealer health and rep performance at a glance. Take a quick look at what's new.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => { dismissAnnouncement(); runNewFeatureTour(); }}>See what's new</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
