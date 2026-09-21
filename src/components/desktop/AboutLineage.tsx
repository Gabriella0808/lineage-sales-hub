import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info, Loader2 } from "lucide-react";
import { isDesktop, getDesktopAppInfo, type DesktopAppInfo } from "@/lib/desktop";
import { useConnectivity } from "@/lib/desktop/useConnectivity";
import { useAppUpdater } from "@/lib/desktop/useAppUpdater";

const PLATFORM_LABELS: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

export function AboutLineage() {
  const [appInfo, setAppInfo] = useState<DesktopAppInfo | null>(null);
  const { isConnected } = useConnectivity();
  const { state: updateState, checkForUpdates, installUpdate } = useAppUpdater();

  useEffect(() => {
    getDesktopAppInfo().then(setAppInfo);
  }, []);

  const desktop = isDesktop();
  const environment = import.meta.env.DEV ? "Development" : "Production";

  return (
    <Card className="mb-5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" /> About Lineage Collections
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Application" value="Lineage Collections" />
        <Row label="Delivery" value={desktop ? `Desktop (${PLATFORM_LABELS[appInfo?.platform ?? ""] ?? appInfo?.platform ?? "…"})` : "Web Portal"} />
        <Row label="Version" value={appInfo?.version ?? "1.0.0"} />
        <Row label="Environment" value={environment} />
        <Row
          label="Connection"
          value={
            <Badge variant="secondary" className={isConnected ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          }
        />
        {desktop && (
          <Row
            label="Updates"
            value={<UpdateStatus state={updateState} onCheck={checkForUpdates} onInstall={installUpdate} />}
          />
        )}
      </CardContent>
    </Card>
  );
}

function UpdateStatus({
  state, onCheck, onInstall,
}: {
  state: ReturnType<typeof useAppUpdater>["state"];
  onCheck: () => void;
  onInstall: () => void;
}) {
  switch (state.status) {
    case "checking":
      return <span className="text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</span>;
    case "downloading":
      return <span className="text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Installing…</span>;
    case "up-to-date":
      return <Badge variant="secondary" className="bg-success/10 text-success border-success/20">Up to date</Badge>;
    case "available":
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onInstall}>
          Update to {state.version}
        </Button>
      );
    case "error":
      return <span className="text-destructive text-xs">{state.message}</span>;
    default:
      return (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCheck}>
          Check for Updates
        </Button>
      );
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
