import { Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LaborDayPromoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Labor Day Promo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and manage the Labor Day promotional campaign for dealers and reps.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Gift className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">This section is coming soon.</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            Promo details, eligible products, discount rules, and dealer/rep visibility will appear here.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: "Promo Overview", desc: "Campaign name, description, and key dates." },
          { title: "Promo Products", desc: "SKUs and collections included in the promotion." },
          { title: "Discount Rules", desc: "Percentage off, tiered pricing, or flat discounts." },
          { title: "Start / End Dates", desc: "Active window for the promotion." },
          { title: "Dealer & Rep Visibility", desc: "Which dealers and reps can see and apply this promo." },
        ].map(({ title, desc }) => (
          <Card key={title} className="border-dashed opacity-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
