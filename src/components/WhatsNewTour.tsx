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
const seenKeyFor = (email?: string | null) => `${SEEN_KEY}:${(email ?? "").toLowerCase()}`;
export const START_TOUR_EVENT = "lc:start-tour";

export function canUseTour(email?: string | null) {
  if (TOUR_AUDIENCE === "everyone") return true;
  return !!email && TESTERS.includes(email.toLowerCase());
}

// Separate walkthrough just for Team Updates, gated to the three people
// trying the feature before it's opened up further - same testers list
// pattern as the Gabriella-only phase above, just a different roster and a
// different tour entirely (it runs on /team-updates, not the homepage).
// Deliberately NOT a once-per-version tour like the main one below - it
// replays every single time one of these three lands on the page, for as
// long as the feature is still in this trial phase with just them.
const TEAM_UPDATES_TOUR_TESTERS = [
  "gabriella@lineage-collections.com",
  "justin@lineage-collections.com",
  "scott@lineage-collections.com",
];

export function canUseTeamUpdatesTour(email?: string | null) {
  return !!email && TEAM_UPDATES_TOUR_TESTERS.includes(email.toLowerCase());
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

// Team Updates walkthrough - only reachable on /team-updates itself, so
// every element it targets is real (an actual post, reaction bar, "Seen
// by" button, attachment) rather than a mock. Every step but the first two
// is skipped gracefully via has() if the feed happens to be empty when
// someone first lands here.
function buildTeamUpdatesSteps(): DriveStep[] {
  const steps: (DriveStep | null)[] = [
    {
      popover: {
        title: "Team Updates",
        description: "A new company blog/announcements section - post news, events and updates for the team, with attachments, reactions and read receipts. You're seeing this early, before it opens up to everyone else.",
      },
    },
    has('[data-tour="team-updates-new-post"]') ? {
      element: '[data-tour="team-updates-new-post"]',
      popover: {
        title: "Post an update",
        description: "Admins and managers can post here. Add a title and/or body text, and up to 6 attachments - images, video, PDFs, Word/Excel/PowerPoint, even zip files, up to 500MB each. Everyone with access gets an in-portal notification and an email as soon as it's posted.",
      },
    } : null,
    has('[data-tour="team-updates-post"]') ? {
      element: '[data-tour="team-updates-post"]',
      popover: {
        title: "A post",
        description: "Pinned posts (admin-only) always float to the top; everything else is newest-first below. The ⋮ menu on a post lets its author (or any admin) pin, edit or delete it.",
      },
    } : null,
    has('[data-tour="team-updates-attachment"]') ? {
      element: '[data-tour="team-updates-attachment"]',
      popover: {
        title: "Click into an attachment",
        description: "Click any attachment to preview it right in the portal - images and video play inline, PDFs render in the browser's own viewer. Whatever the type, the preview always fits the screen and has a Download button, so nothing forces a new tab.",
      },
    } : null,
    has('[data-tour="team-updates-reaction"]') ? {
      element: '[data-tour="team-updates-reaction"]',
      popover: {
        title: "React with more than one emoji",
        description: "Not just a single like - click the smiley to react with 👍 ❤️ 😂 😮 🎉 or 👏, and you can pick more than one on the same post. Each emoji gets its own pill with a live count; hover one to see who reacted.",
      },
    } : null,
    has('[data-tour="team-updates-seen-by"]') ? {
      element: '[data-tour="team-updates-seen-by"]',
      popover: {
        title: "See who's actually read it",
        description: "\"Seen by\" is a real read receipt, not a guess - it counts everyone with access who's genuinely opened Team Updates with this post on their screen. Click it to see exactly who, by name.",
      },
    } : null,
    has('[data-tour="team-updates-post-menu"]') ? {
      element: '[data-tour="team-updates-post-menu"]',
      popover: {
        title: "Managing a post",
        description: "Admins can pin an important post to the top, and edit or delete any post; managers can edit or delete their own.",
      },
    } : null,
    {
      popover: {
        title: "That's Team Updates",
        description: "Emails are still going to me only while this is being tested - once it's ready for everyone, all users will start getting notified too. Any feedback, let me know.",
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

export function runTour(role?: string, email?: string | null) {
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
      try { localStorage.setItem(seenKeyFor(email), TOUR_VERSION); } catch { /* ignore */ }
    },
  });
  d.drive();
}

export function runTeamUpdatesTour() {
  const steps = buildTeamUpdatesSteps();
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
    // No "seen" bookkeeping, unlike the main tour - this one is meant to
    // replay every time (see TEAM_UPDATES_TOUR_TESTERS above), so there's
    // nothing to record here.
    onDestroyed: () => removeCursor(),
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
  const allowedTeamUpdates = canUseTeamUpdatesTour(user?.email);

  // Auto-start after sign-in: once per person per tour version, on any page.
  // If they land somewhere other than Company-wide, take them there first so
  // the tour can show the full set of highlights. Team Updates is excluded
  // from that redirect so it doesn't fight with the tour below - someone
  // landing straight on /team-updates gets that tour first, and picks up
  // the main tour later from another page instead of being bounced away.
  useEffect(() => {
    if (!allowed || !user?.email || !role) return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(seenKeyFor(user.email)); } catch { /* ignore */ }
    if (seen === TOUR_VERSION) return;
    if (location.pathname !== "/" && location.pathname !== "/team-updates") {
      navigate("/", { replace: true });
      return;
    }
    if (location.pathname !== "/") return;
    const t = window.setTimeout(() => runTour(role, user.email), 2500);
    return () => window.clearTimeout(t);
  }, [allowed, user?.email, role, location.pathname, navigate]);

  // Auto-start the Team Updates walkthrough for the three people trying it
  // out - every time they land on the page, not just once (see
  // TEAM_UPDATES_TOUR_TESTERS above for why).
  useEffect(() => {
    if (!allowedTeamUpdates || !user?.email || location.pathname !== "/team-updates") return;
    const t = window.setTimeout(() => runTeamUpdatesTour(), 1500);
    return () => window.clearTimeout(t);
  }, [allowedTeamUpdates, user?.email, location.pathname]);

  // Replay from the account menu - runs whichever tour fits the current
  // page for people who are eligible for the Team Updates one, otherwise
  // always the main tour.
  useEffect(() => {
    if (!allowed && !allowedTeamUpdates) return;
    const onStart = () => {
      if (allowedTeamUpdates && location.pathname === "/team-updates") {
        runTeamUpdatesTour();
        return;
      }
      if (!allowed) return;
      if (location.pathname !== "/") {
        navigate("/");
        window.setTimeout(() => runTour(role, user?.email), 1500);
      } else {
        runTour(role, user?.email);
      }
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [allowed, allowedTeamUpdates, location.pathname, navigate, role, user?.email]);

  return null;
}
