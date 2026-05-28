import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const CRM_ALLOWED_EMAILS = ["gabriella@lineage-collections.com"];

export function canViewCrm(email?: string | null): boolean {
  if (!email) return false;
  return CRM_ALLOWED_EMAILS.includes(email.toLowerCase());
}

export default function CrmGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!canViewCrm(user?.email)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
