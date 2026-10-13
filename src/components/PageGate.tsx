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
  const { data: roleInfo, isError: roleError, refetch: refetchRole } = useUserRole();
  const { overrides, loading } = usePageAccessOverrides();

  const rule = PAGE_ACCESS[page]?.route;
  if (!rule) return <Navigate to="/" replace />;

  // Bug sweep fix (Finding 1d): the comment below says "if the lookup
  // fails, loading ends and the coded rules take over" - but `loading`
  // here is usePageAccessOverrides()'s loading state, not the role
  // query's. If useUserRole() permanently errors, roleInfo never becomes
  // truthy and (user && !roleInfo) stays true forever - every role-gated
  // page showed an unending "Loading…" spinner with no way out but a hard
  // refresh. An explicit error+retry state replaces that dead end.
  if (user && roleError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>Couldn't verify your access.</p>
        <button type="button" onClick={() => refetchRole()} className="text-sm underline hover:text-foreground">Try again</button>
      </div>
    );
  }

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
