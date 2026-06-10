import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { BRANDS } from "@/hooks/useCrm";

const EXPECTED_COLUMNS = [
  "company_name","brand","contact_first_name","contact_last_name","email","main_phone",
  "website","street_1","city","state","zip","account_type","prospect_type","notes",
];

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const cleaned = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (!cleaned.length) return [];
  const headers = cleaned[0].map((h) => h.trim().toLowerCase());
  return cleaned.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

export function ImportAccountsDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) throw new Error("CSV appears empty");

      const payload = rows
        .filter((r) => (r.company_name || "").trim().length > 0)
        .map((r) => {
          const brand = BRANDS.includes(r.brand as any) ? r.brand : "Sea Winds";
          const account_type = r.account_type === "dealer" ? "dealer" : "prospect";
          return {
            company_name: r.company_name,
            brand,
            account_type,
            lifecycle_stage: "prospect",
            status: "active",
            contact_first_name: r.contact_first_name || null,
            contact_last_name: r.contact_last_name || null,
            email: r.email || null,
            main_phone: r.main_phone || null,
            website: r.website || null,
            street_1: r.street_1 || null,
            city: r.city || null,
            state: r.state || null,
            zip: r.zip || null,
            prospect_type: r.prospect_type || null,
            notes: r.notes || null,
            created_by: user?.id ?? null,
          };
        });

      if (!payload.length) throw new Error("No rows with company_name found");

      const { error } = await supabase.from("crm_accounts").insert(payload as any);
      if (error) throw error;

      toast({ title: "Import complete", description: `${payload.length} account${payload.length === 1 ? "" : "s"} added.` });
      qc.invalidateQueries({ queryKey: ["crm_accounts"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1.5" />Import CSV
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import accounts from CSV</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border border-dashed p-6 flex flex-col items-center gap-3 text-center">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Select a .csv file to upload</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? "Importing…" : "Choose CSV"}
            </Button>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" asChild>
              <a href="/sample-accounts-import.csv" download>
                <Download className="h-4 w-4 mr-1.5" />Download sample CSV
              </a>
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
