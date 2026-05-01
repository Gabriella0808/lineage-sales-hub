import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "already" }
  | { kind: "error"; message: string }
  | { kind: "submitting" }
  | { kind: "done" };

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "error", message: "No unsubscribe token provided." });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const data = await res.json();
        if (data.valid) setState({ kind: "ready" });
        else if (data.reason === "already_unsubscribed") setState({ kind: "already" });
        else setState({ kind: "error", message: data.error || "Invalid or expired link." });
      } catch (e) {
        setState({ kind: "error", message: "Could not validate link." });
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success || data.reason === "already_unsubscribed") setState({ kind: "done" });
      else setState({ kind: "error", message: data.error || "Unsubscribe failed." });
    } catch {
      setState({ kind: "error", message: "Network error." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <h1 className="font-serif text-2xl mb-2">Email Preferences</h1>

        {state.kind === "loading" && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Validating link…
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              Click below to confirm you'd like to unsubscribe from these emails.
            </p>
            <Button onClick={confirm} className="w-full">Confirm Unsubscribe</Button>
          </>
        )}

        {state.kind === "submitting" && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing…
          </div>
        )}

        {state.kind === "done" && (
          <div className="py-4">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
            <p className="text-sm">You've been unsubscribed. You won't receive these emails anymore.</p>
          </div>
        )}

        {state.kind === "already" && (
          <div className="py-4">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">You're already unsubscribed.</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="py-4">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
