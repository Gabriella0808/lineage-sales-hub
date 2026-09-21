import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineScreen({ onRetry, checking }: { onRetry: () => void; checking: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="max-w-sm text-center px-6">
        <div className="mx-auto mb-5 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <WifiOff className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-base font-semibold text-foreground mb-1.5">Lineage Collections cannot connect</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Please check your internet connection and try again. Lineage relies on live business data — it won't
          show cached information as though it's current.
        </p>
        <Button onClick={onRetry} disabled={checking} size="sm">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking..." : "Try Again"}
        </Button>
      </div>
    </div>
  );
}
