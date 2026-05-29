import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";

export function canViewCrm(role?: string | null): boolean {
  return role === "admin" || role === "manager";
}

export default function CrmGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!canViewCrm(roleInfo?.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

