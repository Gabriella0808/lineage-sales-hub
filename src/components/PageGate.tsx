import { Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import EmailGuard from "@/components/EmailGuard";
import CrmGuard from "@/components/CrmGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { usePageAccessOverrides } from "@/hooks/usePageAccessOverrides";
import { overrideFor } from "@/config/accessOverrides";
import { PAGE_ACCESS } from "@/config/pageAccess";

/**
 * Applies a page's route rule. Order of precedence:
 *   1. a deliberate change made in Portal Access (blocks or grants the page), then
 *   2. the coded rule from config/pageAccess.ts - layered with the exact same
 *      components the routes used to spell out by hand (ProtectedRoute on the
 *      outside, then EmailGuard/CrmGuard inside).
 *
 * With no changes saved (or if they can't be loaded) it behaves exactly as the
 * coded rules alone. An unknown page key fails CLOSED (redirects home).
 * Home is never blockable, since it is where blocked people are sent.
 */
export default function PageGate({ page, children }: { page: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: roleInfo } = useUserRole();
  const { overrides, loading } = usePageAccessOverrides();

  const rule = PAGE_ACCESS[page]?.route;
  if (!rule) return <Navigate to="/" replace />;

  // Wait for the answer before showing (or hiding) a page, so a blocked page
  // never flashes on screen first. If the lookup fails, `loading` ends and the
  // coded rules below take over.
  if (loading || (user && !roleInfo)) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const change = roleInfo ? overrideFor(page, "route", user?.email, roleInfo.role, overrides) : undefined;
  if (change === false) return <Navigate to="/" replace />;
  if (change === true) return <>{children}</>;

  let el: React.ReactNode = children;
  if (rule.guard === "email") el = <EmailGuard>{el}</EmailGuard>;
  if (rule.guard === "crm") el = <CrmGuard>{el}</CrmGuard>;
  if (rule.protected) {
    el = (
      <ProtectedRoute allow={rule.allow} allowEmails={rule.allowEmails} denyEmails={rule.denyEmails}>
        {el}
      </ProtectedRoute>
    );
  }
  return <>{el}</>;
}
