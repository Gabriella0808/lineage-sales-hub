import { Card } from "@/components/ui/card";

export default function CustomerQuotesPage() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Customer Quotes</h1>
        <p className="page-subtitle">Quotes submitted by your dealers and customers</p>
      </div>
      <Card className="p-12 text-center text-muted-foreground">
        No customer quotes yet.
      </Card>
    </div>
  );
}
