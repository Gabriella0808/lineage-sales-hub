import { Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import type { GranolaIntegrationStatus } from "@/types/granola";

interface Props {
  status: GranolaIntegrationStatus | null;
}

export function IntegrationStatusCard({ status }: Props) {
  const { toast } = useToast();

  const handleConnect = () => {
    toast({
      title: "Granola Integration",
      description: "API integration coming in the next phase. Stay tuned!",
    });
  };

  if (!status) return null;

  return (
    <Card className="p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${status.connected ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted"}`}>
          {status.connected
            ? <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            : <WifiOff className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Granola Integration</span>
            <Badge variant={status.connected ? "default" : "outline"} className="text-[10px] h-4 px-1.5">
              {status.connected ? "Connected" : "Not Connected"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status.connected
              ? `Last synced: ${status.lastSyncTime} · ${status.meetingsImported} meetings imported`
              : "Connect Granola to automatically sync meeting notes and action items."}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="text-xs h-8 shrink-0" onClick={handleConnect}>
        {status.connected ? "Manage" : "Connect Granola"}
      </Button>
    </Card>
  );
}
