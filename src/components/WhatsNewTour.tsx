import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canSeeDealerGoals } from "@/hooks/useDealerAnnualGoals";

export const START_TOUR_EVENT = "lc:start-tour";

// The "what's new" popup - currently announcing 2027 dealer goals. Opens
// by itself exactly once per person per version (first load after their
// next sign-in); closing it any way marks it seen, after which it only
// opens from the account menu's "What's new" item. "Seen" is stored on the
// account (auth user_metadata) so it doesn't reappear on another device or
// browser; localStorage is just a fast local copy. Audience: rep/manager/admin
// accounts that can actually see the 2027 Goal column (same
// canSeeDealerGoals() gate), with wording per role. Dealers never see it.
const ANNOUNCEMENT_VERSION = "2026-10-28-dealer-goals";
const ANNOUNCEMENT_SEEN_KEY = "lc.announcementSeen";
const ANNOUNCEMENT_SEEN_META_KEY = "announcement_seen";
const announcementSeenKeyFor = (email?: string | null) => `${ANNOUNCEMENT_SEEN_KEY}:${(email ?? "").toLowerCase()}`;

const DEALER_REPORTING_PATH = "/?report=dealer-reporting";

type AnnouncementRole = "admin" | "manager" | "rep";

const DEALER_GOALS_COPY: Record<AnnouncementRole, { title: string; body: string }> = {
  rep: {
    title: "Set your 2027 dealer goals",
    body: "You can now set a 2027 goal on each of your dealers in Dealer Reporting and lock it in. Your manager can set or change any goal, and unlock one if you need to revise it. Rep Reporting shows your totals.",
  },
  manager: {
    title: "2027 dealer goals",
    body: "Your reps can now set a 2027 goal on each of their dealers in Dealer Reporting and lock it in. You can set or change any goal on your team's dealers, and unlock one if a rep needs to revise it. Rep Reporting shows each rep's totals.",
  },
  admin: {
    title: "2027 dealer goals",
    body: "Reps can now set a 2027 goal on each of their dealers in Dealer Reporting and lock it in. You can set or change any goal, and unlock one if a rep needs to revise it. Rep Reporting shows each rep's totals.",
  },
};

const announcementRoleFor = (role?: string): AnnouncementRole | null =>
  role === "admin" || role === "manager" || role === "rep" ? role : null;

// Shared with AppLayout.tsx so the account-menu item shows for exactly the
// same audience as the popup.
export function canSeeWhatsNew(role?: string, email?: string | null) {
  return !!announcementRoleFor(role) && canSeeDealerGoals(email);
}

export function WhatsNewTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: roleInfo } = useUserRole();
  const announcementRole = announcementRoleFor(roleInfo?.role);
  const showAnnouncement = canSeeWhatsNew(roleInfo?.role, user?.email);

  const [announcementOpen, setAnnouncementOpen] = useState(false);
  useEffect(() => {
    if (!user?.email || !showAnnouncement) return;
    if (user.user_metadata?.[ANNOUNCEMENT_SEEN_META_KEY] === ANNOUNCEMENT_VERSION) return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(announcementSeenKeyFor(user.email)); } catch { /* ignore */ }
    if (seen === ANNOUNCEMENT_VERSION) return;
    const t = window.setTimeout(() => setAnnouncementOpen(true), 1200);
    return () => window.clearTimeout(t);
    // Deliberately not depending on user_metadata: saving "seen" below
    // updates it, and that must not re-run this check mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, showAnnouncement]);

  // Reopen from the account menu (the item itself is hidden for anyone
  // outside the audience, see AppLayout.tsx).
  useEffect(() => {
    if (!showAnnouncement) return;
    const onStart = () => setAnnouncementOpen(true);
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [showAnnouncement]);

  const dismissAnnouncement = () => {
    setAnnouncementOpen(false);
    try { if (user?.email) localStorage.setItem(announcementSeenKeyFor(user.email), ANNOUNCEMENT_VERSION); } catch { /* ignore */ }
    if (user && user.user_metadata?.[ANNOUNCEMENT_SEEN_META_KEY] !== ANNOUNCEMENT_VERSION) {
      void supabase.auth.updateUser({ data: { [ANNOUNCEMENT_SEEN_META_KEY]: ANNOUNCEMENT_VERSION } }).then(({ error }) => {
        if (error) console.warn("Saving announcement seen failed:", error.message);
      });
    }
  };

  if (!showAnnouncement || !announcementRole) return null;
  const copy = DEALER_GOALS_COPY[announcementRole];

  return (
    <Dialog open={announcementOpen} onOpenChange={(v) => { if (!v) dismissAnnouncement(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => { dismissAnnouncement(); navigate(DEALER_REPORTING_PATH); }}>Go to Dealer Reporting</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
