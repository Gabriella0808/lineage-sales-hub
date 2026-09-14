import { Card } from "@/components/ui/card";

/**
 * Shown to a rep-role user whose account has no linked sales_reps record
 * (no user_reps row). Never fall back to showing unscoped/company data —
 * this is the safe stop state until an admin links their rep profile.
 */
export function RepNotConfigured() {
  return (
    <Card className="py-14">
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Rep profile not configured</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Your account isn't linked to a sales rep record yet, so there's no data to show.
          Contact an admin to get your rep profile set up.
        </p>
      </div>
    </Card>
  );
}
