import { PageHeader } from "@/components/PageHeader";

export default function SalesRepsAcctivatePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Rep Database (Acctivate)"
        subtitle="Sales rep records synced from Acctivate. Separate from the portal sales rep database."
      />
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Acctivate-synced sales rep data will appear here. No records yet.
      </div>
    </div>
  );
}
