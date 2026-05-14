import { Card } from "@/components/ui/card";

export default function MyQuotesPage() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">My Quotes</h1>
        <p className="page-subtitle">Quote requests you've submitted</p>
      </div>
      <Card className="p-12 text-center text-muted-foreground">
        No quotes yet. Submit one from the Quote Cart.
      </Card>
    </div>
  );
}
