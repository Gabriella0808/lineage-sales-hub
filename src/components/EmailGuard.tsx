import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const ALLOWED_EMAILS = [
  "gabriella@lineage-collections.com",
  "tammy@lineage-collections.com",
  "jessica@lineage-collections.com",
  "melissa@lineage-collections.com",
  "michelle@lineage-collections.com",
  "miranda@lineage-collections.com",
  "sarah@lineage-collections.com",
];

export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}

interface Props {
  children: React.ReactNode;
}

export default function EmailGuard({ children }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!isAllowedEmail(user?.email)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
