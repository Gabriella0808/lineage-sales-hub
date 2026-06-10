import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  startOfWeek, format, parseISO,
} from "date-fns";
import {
  Search, XCircle, AlertTriangle, RefreshCw, Zap, Upload,
  CheckCircle2, AlertCircle, Loader2, FileText, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClearanceItem {
  sku: string;
  product: string | null;
  collection: string | null;
  on_hand: number;
  available: number;
  
  list_price: number | null;
  status: string | null;
}

interface ParsedRow {
  sku: string;
  qty: number;
  revenue: number;
  repName: string;
  matched: boolean;
  productName: string;
}

// ─── CSV column detection ─────────────────────────────────────────────────────

const SKU_CANDIDATES     = ["sku", "item", "item #", "item#", "item number", "item_number", "product code", "product_code", "code", "part number", "part_number"];
const QTY_CANDIDATES     = ["qty", "quantity", "units sold", "qty sold", "units_sold", "qty_sold", "quantity sold", "sold", "shipped qty", "shipped", "qty shipped", "quantity shipped"];
const REVENUE_CANDIDATES = ["revenue", "extended price", "extended_price", "ext price", "ext_price", "amount", "total", "subtotal"];
const REP_CANDIDATES     = ["rep", "salesperson", "sales rep", "sales_rep", "rep name", "rep_name", "salesperson name"];

function detectCol(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNum(val: unknown): number {
  if (val == null) return 0;
  const str = String(val).replace(/[$,\s]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const PILL_BASE =
  "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10.5px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ring-1 ring-inset";

function StatusPill({ status, onHand }: { status: string | null; onHand: number }) {
  if (onHand <= 0 || status === "out-of-stock") {
    return (
      <span className={`${PILL_BASE} bg-destructive/10 text-destructive ring-destructive/20`}>
        <XCircle className="h-3 w-3" /> Out of Stock
      </span>
    );
  }
  if (status === "critical") {
    return (
      <span className={`${PILL_BASE} bg-destructive/10 text-destructive ring-destructive/20`}>
        <AlertTriangle className="h-3 w-3" /> Critical
      </span>
    );
  }
  if (status === "reorder-soon" || status === "stockout-risk") {
    return (
      <span className={`${PILL_BASE} bg-warning/10 text-warning ring-warning/20`}>
        <RefreshCw className="h-3 w-3" /> Reorder Soon
      </span>
    );
  }
  if (status === "fast-moving") {
    return (
      <span className={`${PILL_BASE} bg-accent/15 text-accent ring-accent/25`}>
        <Zap className="h-3 w-3" /> Fast Moving
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      In Stock
    </span>
  );
}

// ─── Import dialog ────────────────────────────────────────────────────────────

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  inventory: ClearanceItem[];
  onImportDone: () => void;
}

type ImportStep = "upload" | "preview" | "importing" | "done";

function ImportDialog({ open, onClose, inventory, onImportDone }: ImportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [weekStart, setWeekStart] = useState<string>(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  const inventoryMap = useMemo(() => {
    const m = new Map<string, ClearanceItem>();
    inventory.forEach((i) => m.set(i.sku.toLowerCase(), i));
    return m;
  }, [inventory]);

  function reset() {
    setStep("upload");
    setFileName("");
    setParsedRows([]);
    setParseError("");
    setImportProgress(null);
    setWeekStart(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    setParseError("");
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? [];
        if (headers.length === 0) {
          setParseError("Could not detect column headers. Make sure the first row contains column names.");
          return;
        }

        const skuCol     = detectCol(headers, SKU_CANDIDATES);
        const qtyCol     = detectCol(headers, QTY_CANDIDATES);
        const revenueCol = detectCol(headers, REVENUE_CANDIDATES);
        const repCol     = detectCol(headers, REP_CANDIDATES);

        if (skuCol === -1) {
          setParseError(
            `Could not find a SKU column. Expected one of: ${SKU_CANDIDATES.slice(0, 4).join(", ")}. ` +
            `Found headers: ${headers.slice(0, 6).join(", ")}.`,
          );
          return;
        }
        if (qtyCol === -1) {
          setParseError(
            `Could not find a Quantity column. Expected one of: ${QTY_CANDIDATES.slice(0, 4).join(", ")}. ` +
            `Found headers: ${headers.slice(0, 6).join(", ")}.`,
          );
          return;
        }

        const skuField     = headers[skuCol];
        const qtyField     = headers[qtyCol];
        const revenueField = revenueCol !== -1 ? headers[revenueCol] : null;
        const repField     = repCol !== -1 ? headers[repCol] : null;

        const rows: ParsedRow[] = (results.data as Record<string, unknown>[])
          .map((row) => {
            const sku = String(row[skuField] ?? "").trim();
            if (!sku) return null;
            const qty = Math.round(parseNum(row[qtyField]));
            if (qty <= 0) return null;
            const matched = inventoryMap.has(sku.toLowerCase());
            const inv = inventoryMap.get(sku.toLowerCase());
            return {
              sku: inv?.sku ?? sku,
              qty,
              revenue:  revenueField ? parseNum(row[revenueField]) : 0,
              repName:  repField ? String(row[repField] ?? "").trim() : "",
              matched,
              productName: inv?.product ?? String(row["product"] ?? row["Product"] ?? row["Product Name"] ?? "").trim(),
            } satisfies ParsedRow;
          })
          .filter((r): r is ParsedRow => r !== null);

        if (rows.length === 0) {
          setParseError("No valid rows found. Make sure the CSV has SKUs and positive quantities.");
          return;
        }

        setParsedRows(rows);
        setStep("preview");
      },
      error(err) {
        setParseError(`Failed to parse file: ${err.message}`);
      },
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function runImport() {
    const matched = parsedRows.filter((r) => r.matched);
    if (matched.length === 0) return;

    setStep("importing");
    const importId = crypto.randomUUID();
    const total = matched.length;
    let done = 0;
    setImportProgress({ done: 0, total });

    const errors: string[] = [];

    for (const row of matched) {
      const inv = inventoryMap.get(row.sku.toLowerCase())!;
      const newOnHand = Math.max(0, inv.on_hand - row.qty);
      const newAvailable = Math.max(0, inv.available - row.qty);

      const [invErr, salesErr] = await Promise.all([
        supabase
          .from("inventory")
          .update({ on_hand: newOnHand, available: newAvailable, updated_at: new Date().toISOString() })
          .eq("sku", inv.sku)
          .then(({ error }) => error),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("clearance_weekly_sales")
          .insert({
            import_id: importId,
            import_filename: fileName,
            week_start: weekStart,
            sku: inv.sku,
            product_name: row.productName || inv.product,
            qty_sold: row.qty,
            revenue: row.revenue,
            rep_name: row.repName || null,
            imported_by: user?.id ?? null,
          })
          .then(({ error }: { error: unknown }) => error),
      ]);

      if (invErr)   errors.push(`${row.sku}: ${invErr.message}`);
      if (salesErr) errors.push(`${row.sku} (sales record): ${salesErr.message}`);

      done++;
      setImportProgress({ done, total });
    }

    if (errors.length > 0) {
      toast({
        title: "Import completed with errors",
        description: `${done - errors.length}/${total} rows succeeded. Check console for details.`,
        variant: "destructive",
      });
      console.error("Import errors:", errors);
    } else {
      toast({
        title: "Import complete",
        description: `${total} SKU${total !== 1 ? "s" : ""} updated for week of ${format(parseISO(weekStart), "MMM d, yyyy")}.`,
      });
    }

    setStep("done");
    onImportDone();
  }

  const matchedCount   = parsedRows.filter((r) => r.matched).length;
  const unmatchedCount = parsedRows.filter((r) => !r.matched).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Weekly Sales CSV
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-1">
          {/* Step: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Week selector */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium w-28 shrink-0">Week of</label>
                <input
                  type="date"
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                  value={weekStart}
                  onChange={(e) => {
                    const d = parseISO(e.target.value);
                    setWeekStart(format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
                  }}
                />
              </div>

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer",
                  "hover:border-primary/50 hover:bg-muted/30 transition-colors",
                )}
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
              >
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium">Drop your CSV here or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

            </div>
          )}

          {/* Step: Preview */}
          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate">{fileName}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">Week of {format(parseISO(weekStart), "MMM d, yyyy")}</span>
              </div>

              <div className="flex gap-3">
                <div className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  {matchedCount} matched
                </div>
                {unmatchedCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-warning-foreground">
                    <AlertCircle className="h-4 w-4" />
                    {unmatchedCount} unrecognized SKU{unmatchedCount !== 1 ? "s" : ""} (will be skipped)
                  </div>
                )}
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground"></th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">SKU</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty Sold</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rep</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, i) => (
                        <tr
                          key={i}
                          className={cn(
                            "border-t border-border/40",
                            !row.matched && "bg-warning/5",
                          )}
                        >
                          <td className="px-3 py-1.5">
                            {row.matched ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-warning-foreground" />
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-mono">{row.sku}</td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate">
                            {row.matched ? row.productName || "—" : <span className="text-warning-foreground">Not in clearance inventory</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{row.qty}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {row.revenue > 0 ? `$${row.revenue.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{row.repName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {matchedCount === 0 && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
                  No rows matched clearance inventory SKUs. Nothing will be imported.
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === "importing" && importProgress && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
              <div>
                <p className="font-medium">Importing sales data…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importProgress.done} of {importProgress.total} SKUs updated
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-2 max-w-xs mx-auto">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
              <div>
                <p className="font-semibold text-lg">Import complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {matchedCount} SKU{matchedCount !== 1 ? "s" : ""} updated. Inventory levels have been decreased.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => { setParsedRows([]); setParseError(""); setStep("upload"); }}>
                <X className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={runImport} disabled={matchedCount === 0}>
                Import {matchedCount} SKU{matchedCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClearanceProductsPage() {
  const [items, setItems] = useState<ClearanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("inventory")
      .select("sku, product, collection, on_hand, available, list_price, status")
      .eq("is_clearance", true)
      .order("collection")
      .order("sku");
    setItems(
      ((data ?? []) as ClearanceItem[]).map((r) => ({
        ...r,
        on_hand: Number(r.on_hand ?? 0),
        available: Number(r.available ?? 0),
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const collections = useMemo(
    () => Array.from(new Set(items.map((i) => i.collection ?? "Uncategorized"))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      if (collectionFilter !== "all" && (i.collection ?? "Uncategorized") !== collectionFilter) return false;
      if (q) return i.sku.toLowerCase().includes(q) || (i.product ?? "").toLowerCase().includes(q);
      return true;
    });
  }, [items, search, collectionFilter]);

  const totalOnHand     = useMemo(() => filtered.reduce((s, i) => s + i.available, 0), [filtered]);
  const totalRetailValue = useMemo(
    () => filtered.reduce((s, i) => s + i.available * (i.list_price ?? 0), 0),
    [filtered],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clearance Products</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All clearance SKUs with current inventory levels. Import weekly sales to update quantities.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" />
          Import Sales CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total SKUs</p>
          <p className="text-2xl font-semibold tabular-nums">{filtered.length}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total Available</p>
          <p className="text-2xl font-semibold tabular-nums">{totalOnHand.toLocaleString()}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Collections</p>
          <p className="text-2xl font-semibold tabular-nums">{collections.length}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Retail Value</p>
          <p className="text-2xl font-semibold tabular-nums">
            ${totalRetailValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search SKU or product…"
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button
            size="sm" variant={collectionFilter === "all" ? "default" : "outline"}
            className="h-8 text-xs" onClick={() => setCollectionFilter("all")}
          >
            All Collections
          </Button>
          {collections.map((c) => (
            <Button
              key={c} size="sm"
              variant={collectionFilter === c ? "default" : "outline"}
              className="h-8 text-xs" onClick={() => setCollectionFilter(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* Inventory table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading clearance inventory…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No clearance products found.</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  {["SKU", "Product", "Collection", "Available", "List Price", "Status"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={cn(
                          "px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium",
                          i >= 3 && i <= 4 ? "text-right" : "text-left",
                        )}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr
                    key={item.sku}
                    className={cn(
                      "border-b border-border/40 hover:bg-muted/20 transition-colors",
                      idx % 2 !== 0 && "bg-muted/10",
                    )}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{item.sku}</td>
                    <td className="px-4 py-2.5 text-foreground max-w-[220px] truncate">{item.product ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.collection ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {item.available.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {item.list_price != null ? `$${item.list_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={item.status} onHand={item.available} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        inventory={items}
        onImportDone={load}
      />
    </div>
  );
}
