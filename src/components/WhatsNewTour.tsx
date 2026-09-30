import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const START_TOUR_EVENT = "lc:start-tour";

// Team Updates walkthrough audience - matches the page's own access rule
// (pageAccess.ts's "team-updates" entry: admin or manager, reps excluded).
export function canUseTeamUpdatesTour(role?: string) {
  return role === "admin" || role === "manager";
}

// Pre-Sale walkthrough audience - matches the page's own access rule
// (pageAccess.ts's "pre-sale" entry: admin, manager or dealer - reps
// excluded there too).
export function canUsePreSaleTour(role?: string) {
  return role === "admin" || role === "manager" || role === "dealer";
}

// The "what's changed" popup - shown to literally everyone, including reps,
// once per person per version, right after sign-in/reload. Its button walks
// whoever's eligible through the current feature tours (Team Updates, then
// Pre-Sale); someone with access to neither (a rep, right now) just closes
// the popup, since there's nothing else to show them yet.
const ANNOUNCEMENT_VERSION = "2026-09-30";
const ANNOUNCEMENT_SEEN_KEY = "lc.announcementSeen";
const announcementSeenKeyFor = (email?: string | null) => `${ANNOUNCEMENT_SEEN_KEY}:${(email ?? "").toLowerCase()}`;

const has = (sel: string) => !!document.querySelector(sel);

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
        description: "A new company blog/announcements section - post news, events and updates for the team, with attachments, reactions and read receipts.",
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
        description: "That's the tour. Post something, react to a post, or just browse what's already here.",
      },
    },
  ];
  return steps.filter(Boolean) as DriveStep[];
}

// Pre-Sale walkthrough - only reachable on /promotions/pre-sale itself, so
// every step targets the real page. Every step but the first is skipped
// gracefully via has() if there's nothing currently flagged to show.
function buildPreSaleSteps(): DriveStep[] {
  const steps: (DriveStep | null)[] = [
    {
      popover: {
        title: "Pre-Sale - New Product Intros",
        description: "Tracks every SKU currently flagged as a New Product Intro in Acctivate - what's booked, what's on order, and how attainment is tracking.",
      },
    },
    has('[data-tour="presale-kpis"]') ? {
      element: '[data-tour="presale-kpis"]',
      popover: {
        title: "The headline numbers",
        description: "Total booked, total on PO (excluding completed POs), Pre-Sale progress (% of PO'd value booked), and Remainder of goal - what's still left to sell against what's on order.",
      },
    } : null,
    has('[data-tour="presale-tabs"]') ? {
      element: '[data-tour="presale-tabs"]',
      popover: {
        title: "Three views",
        description: "Overview for the big picture, \"By Dealer, Rep, Collection & SKU\" to drill all the way down to a rep's or dealer's numbers, and Purchase Orders for the raw PO data behind it all.",
      },
    } : null,
    has('[data-tour="presale-heatmap"]') ? {
      element: '[data-tour="presale-heatmap"]',
      popover: {
        title: "Rep × collection heatmap",
        description: "Color-coded by attainment - red under 40%, yellow 40-70%, green 70%+ - so you can spot at a glance which rep/collection combinations need attention.",
      },
    } : null,
    {
      popover: {
        title: "That's Pre-Sale",
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

// Neither of these records its own "seen" state - when run from the
// announcement popup below, that's tracked once at the announcement level;
// when replayed directly from the account menu, replaying on purpose
// obviously doesn't need to be remembered as "already seen".
export function runTeamUpdatesTour(onDone?: () => void) {
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
    onDestroyed: () => { removeCursor(); onDone?.(); },
  });
  d.drive();
}

export function runPreSaleTour(onDone?: () => void) {
  const steps = buildPreSaleSteps();
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

// Navigates to a tour's page if not already there, waits for its content to
// actually exist (rather than guessing one fixed delay - a cold page load
// is much slower than an already-warm in-app navigation), then runs it.
// Gives up waiting after 8s and runs anyway, so a tour still plays (just
// skipping content steps via has()) even if the page has nothing to show.
function goToAndRun(navigate: ReturnType<typeof useNavigate>, currentPath: string, path: string, selectors: string[], run: (onDone: () => void) => void, onDone: () => void) {
  const waitThenRun = () => {
    const deadline = Date.now() + 8000;
    const tick = () => {
      if (selectors.some(has) || Date.now() >= deadline) { run(onDone); return; }
      window.setTimeout(tick, 250);
    };
    window.setTimeout(tick, 1000);
  };
  if (currentPath !== path) {
    navigate(path);
    window.setTimeout(waitThenRun, 400);
  } else {
    waitThenRun();
  }
}

export function WhatsNewTour() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: roleInfo } = useUserRole();
  const role = roleInfo?.role;
  const allowedTeamUpdates = canUseTeamUpdatesTour(role);
  const allowedPreSale = canUsePreSaleTour(role);

  // The "what's changed" popup - everyone, including reps, once per
  // person per version, shortly after sign-in/reload.
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  useEffect(() => {
    if (!user?.email) return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(announcementSeenKeyFor(user.email)); } catch { /* ignore */ }
    if (seen === ANNOUNCEMENT_VERSION) return;
    const t = window.setTimeout(() => setAnnouncementOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, [user?.email]);

  const dismissAnnouncement = () => {
    setAnnouncementOpen(false);
    try { if (user?.email) localStorage.setItem(announcementSeenKeyFor(user.email), ANNOUNCEMENT_VERSION); } catch { /* ignore */ }
  };

  // Walks through Team Updates then Pre-Sale, each on its own page, for
  // whoever has access to them. Someone with access to neither (a rep)
  // gets nothing further - there's no other tour left to fall back to.
  const runNewFeatureTours = () => {
    const queue: { path: string; selectors: string[]; run: (onDone: () => void) => void }[] = [];
    if (allowedTeamUpdates) queue.push({ path: "/team-updates", selectors: ['[data-tour="team-updates-new-post"]', '[data-tour="team-updates-post"]'], run: runTeamUpdatesTour });
    if (allowedPreSale) queue.push({ path: "/promotions/pre-sale", selectors: ['[data-tour="presale-kpis"]'], run: runPreSaleTour });
    if (queue.length === 0) return;

    const step = (i: number, fromPath: string) => {
      if (i >= queue.length) return;
      const { path, selectors, run } = queue[i];
      goToAndRun(navigate, fromPath, path, selectors, run, () => window.setTimeout(() => step(i + 1, path), 400));
    };
    step(0, location.pathname);
  };

  // Replay from the account menu - runs whichever tour fits the current
  // page, for people eligible for Team Updates or Pre-Sale. The menu item
  // itself is hidden for anyone with neither (see AppLayout.tsx), so this
  // is really just picking between the two.
  useEffect(() => {
    if (!allowedTeamUpdates && !allowedPreSale) return;
    const onStart = () => {
      if (allowedTeamUpdates && location.pathname === "/team-updates") { runTeamUpdatesTour(); return; }
      if (allowedPreSale && location.pathname === "/promotions/pre-sale") { runPreSaleTour(); return; }
      // On neither page - run whichever applies, starting there.
      runNewFeatureTours();
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedTeamUpdates, allowedPreSale, location.pathname]);

  // Everyone (including reps) sees the popup itself, but a rep has nothing
  // to actually walk through yet - don't offer a button that would do
  // nothing when clicked.
  const hasAnyTour = allowedTeamUpdates || allowedPreSale;

  return (
    <Dialog open={announcementOpen} onOpenChange={(v) => { if (!v) dismissAnnouncement(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>What's new in the portal</DialogTitle>
          <DialogDescription>
            {hasAnyTour
              ? "There have been some changes to the portal - take a quick look at what's new."
              : "There have been some changes to the portal for admins and managers. Nothing new for your account to walk through just yet."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {hasAnyTour ? (
            <>
              <Button variant="ghost" onClick={dismissAnnouncement}>Not now</Button>
              <Button onClick={() => { dismissAnnouncement(); runNewFeatureTours(); }}>See what's new</Button>
            </>
          ) : (
            <Button onClick={dismissAnnouncement}>Got it</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
