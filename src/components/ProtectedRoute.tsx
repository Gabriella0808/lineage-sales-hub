import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";

interface Props {
  children: React.ReactNode;
  /** If provided, only these roles can access. Otherwise any authenticated user can. */
  allow?: AppRole[];
}

export default function ProtectedRoute({ children, allow }: Props) {
  const { session, loading } = useAuth();
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();

  if (loading || (session && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;

  if (allow && roleInfo && !allow.includes(roleInfo.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
