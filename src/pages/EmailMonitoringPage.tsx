import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Mail, AlertCircle, CheckCircle2, Ban, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Delivery = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type Suppressed = {
  email: string;
  reason: string;
  created_at: string;
};

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function statusBadge(status: string) {
  switch (status) {
    case "sent":
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Delivered</Badge>;
    case "bounced":
      return <Badge variant="destructive">Bounced</Badge>;
    case "complained":
      return <Badge variant="destructive">Spam complaint</Badge>;
    case "suppressed":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Suppressed</Badge>;
    case "dlq":
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "pending":
      return <Badge variant="secondary">Sending…</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function EmailMonitoringPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [suppressed, setSuppressed] = useState<Suppressed[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("admin-list-email-deliveries", {
      body: {},
      method: "GET" as never,
      // pass `days` via URL by using fetch fallback below
    });
    // The SDK doesn't easily set query params for GET, so use direct fetch:
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const url = `https://tsbrvpgzawbbmuloxlkz.supabase.co/functions/v1/admin-list-email-deliveries?days=${days}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setDeliveries(json.deliveries ?? []);
      setSuppressed(json.suppressed ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
    void data; void error;
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const stats = useMemo(() => {
    const total = deliveries.length;
    const delivered = deliveries.filter((d) => d.status === "sent").length;
    const failed = deliveries.filter((d) =>
      ["bounced", "complained", "dlq", "failed"].includes(d.status),
    ).length;
    const pending = deliveries.filter((d) => d.status === "pending").length;
    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, failed, pending, rate };
  }, [deliveries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deliveries;
    return deliveries.filter(
      (d) =>
        d.recipient_email.toLowerCase().includes(q) ||
        d.template_name.toLowerCase().includes(q) ||
        (d.error_message ?? "").toLowerCase().includes(q),
    );
  }, [deliveries, search]);

  const failedOnly = useMemo(
    () => filtered.filter((d) => ["bounced", "complained", "dlq", "failed"].includes(d.status)),
    [filtered],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif text-primary flex items-center gap-2">
            <Mail className="h-7 w-7" />
            Email Delivery
          </h1>
          <p className="text-muted-foreground mt-1">
            See which emails were delivered and which recipients didn't receive them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              variant={days === r.days ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total emails</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700">{stats.delivered}</div>
            <div className="text-xs text-muted-foreground mt-1">{stats.rate}% delivery rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Not delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Ban className="h-4 w-4 text-amber-600" />
              Suppressed addresses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-700">{suppressed.length}</div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Email log</CardTitle>
            <Input
              placeholder="Search by email, template, or error…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
              <TabsTrigger value="failed">Not delivered ({failedOnly.length})</TabsTrigger>
              <TabsTrigger value="suppressed">Suppression list ({suppressed.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <DeliveryTable rows={filtered} loading={loading} />
            </TabsContent>
            <TabsContent value="failed" className="mt-4">
              <DeliveryTable rows={failedOnly} loading={loading} showError />
            </TabsContent>
            <TabsContent value="suppressed" className="mt-4">
              <SuppressedTable rows={suppressed} loading={loading} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function DeliveryTable({
  rows,
  loading,
  showError,
}: {
  rows: Delivery[];
  loading: boolean;
  showError?: boolean;
}) {
  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  if (rows.length === 0)
    return <div className="py-8 text-center text-muted-foreground">No emails in this range.</div>;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recipient</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Status</TableHead>
            {showError && <TableHead>Reason</TableHead>}
            <TableHead className="text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.recipient_email}</TableCell>
              <TableCell className="text-muted-foreground">{r.template_name}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              {showError && (
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {r.error_message ?? "—"}
                </TableCell>
              )}
              <TableCell className="text-right text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SuppressedTable({ rows, loading }: { rows: Suppressed[]; loading: boolean }) {
  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  if (rows.length === 0)
    return (
      <div className="py-8 text-center text-muted-foreground">
        No suppressed addresses in this range.
      </div>
    );

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.email}-${r.created_at}`}>
              <TableCell className="font-medium">{r.email}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {r.reason}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
