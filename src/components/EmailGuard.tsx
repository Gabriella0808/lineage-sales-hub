import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ALLOWED_EMAIL = "gabriella@lineage-collections.com";

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
  if (!user || user.email?.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
