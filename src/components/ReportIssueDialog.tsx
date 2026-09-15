import { useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Paperclip, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentReportContext } from "@/contexts/ReportContextProvider";
import { getVisibleNavSections, type NavSection } from "@/config/navSections";

type PageOption = { title: string; url: string };

// Flattened, deduplicated (by url) list of the pages THIS user can actually
// see — built from the same role/email-gated filter the sidebar itself
// uses (getVisibleNavSections), so a rep is never offered an admin-only
// page here and vice versa.
function flattenPages(sections: NavSection[]): PageOption[] {
  const seen = new Set<string>();
  const out: PageOption[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (!seen.has(item.url)) { seen.add(item.url); out.push({ title: item.title, url: item.url }); }
      for (const child of item.children ?? []) {
        if (!seen.has(child.url)) { seen.add(child.url); out.push({ title: child.title, url: child.url }); }
      }
    }
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  out.push({ title: "Other / not listed", url: "" });
  return out;
}

const ISSUE_TYPES = [
  "Data looks incorrect",
  "Something isn't working",
  "Error message",
  "Display / visual issue",
  "Feature request",
  "Other",
] as const;

const PRIORITIES = ["Low", "Normal", "High", "Blocking"] as const;

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const BUCKET = "issue-report-attachments";

interface FormState {
  issueType: string;
  title: string;
  description: string;
  reportedPage: string; // page title from the role-filtered page list, not a raw path
  priority: string;
}

function emptyForm(currentPath: string, pageOptions: PageOption[]): FormState {
  const match = pageOptions.find((p) => p.url && p.url === currentPath);
  return {
    issueType: "",
    title: "",
    description: "",
    reportedPage: match?.title ?? "",
    priority: "Normal",
  };
}

export function ReportIssueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { data: roleInfo } = useUserRole();
  const location = useLocation();
  const reportContext = useCurrentReportContext();

  const pageOptions = useMemo(
    () => flattenPages(getVisibleNavSections(roleInfo?.role ?? "rep", user)),
    [roleInfo?.role, user],
  );

  const [form, setForm] = useState<FormState>(() => emptyForm(location.pathname, pageOptions));
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false); // guards against a second click landing before React re-renders

  const resetAndClose = () => {
    setForm(emptyForm(location.pathname, pageOptions));
    setFile(null);
    setFileError(null);
    setFieldErrors({});
    setSubmitError(null);
    setSucceeded(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && succeeded) {
      // Closing via the X/overlay after success should still reset for next time.
      resetAndClose();
      return;
    }
    onOpenChange(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(picked.type)) {
      setFileError("Only PNG, JPG, or WEBP images are supported.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setFileError("Image is too large — please attach a file under 5MB.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(picked);
  };

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.issueType) errors.issueType = "Please select an issue type.";
    if (!form.title.trim()) errors.title = "Please give the issue a short title.";
    else if (form.title.length > TITLE_MAX) errors.title = `Title must be ${TITLE_MAX} characters or fewer.`;
    if (!form.description.trim()) errors.description = "Please describe what happened.";
    else if (form.description.length > DESCRIPTION_MAX) errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting || submittingRef.current) return;
    setSubmitError(null);
    if (!validate()) return;
    if (fileError) return; // a previously-rejected file must be cleared before submitting

    submittingRef.current = true;
    setSubmitting(true);
    try {
      let storagePath: string | null = null;

      if (file && user) {
        const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (uploadErr) {
          setSubmitError("We couldn't upload your screenshot, so the report wasn't sent. Please try again, or remove the screenshot and resubmit.");
          return;
        }
        storagePath = path;
      }

      const payload = {
        issueType: form.issueType,
        title: form.title.trim(),
        description: form.description.trim(),
        reportedPage: form.reportedPage || null,
        priority: form.priority,
        screenshotPath: storagePath,
        clientTimestamp: new Date().toISOString(),
        role: roleInfo?.role ?? null,
        managerId: roleInfo?.managerId ?? null,
        repId: roleInfo?.repId ?? null,
        dealerId: roleInfo?.dealerId ?? null,
        route: location.pathname,
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        viewport: typeof window !== "undefined" ? { width: window.innerWidth, height: window.innerHeight } : null,
        filterContext: reportContext ?? null,
      };

      const { data, error } = await supabase.functions.invoke("report-portal-issue", { body: payload });

      if (error || !data?.ok) {
        setSubmitError("We couldn't send your report. Please try again.");
        return;
      }

      setSucceeded(true);
    } catch {
      setSubmitError("We couldn't send your report. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {succeeded ? (
          <>
            <DialogHeader>
              <DialogTitle>Issue reported</DialogTitle>
              <DialogDescription>
                Thanks — your report has been sent to the portal team.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report an Issue</DialogTitle>
              <DialogDescription>
                Found something that doesn't look right? Let us know what happened and we'll take a look.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label htmlFor="issue-type">Issue Type</Label>
                <Select
                  value={form.issueType}
                  onValueChange={(v) => setForm((f) => ({ ...f, issueType: v }))}
                >
                  <SelectTrigger id="issue-type" aria-invalid={!!fieldErrors.issueType}>
                    <SelectValue placeholder="Select an issue type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.issueType && <p className="text-xs text-destructive">{fieldErrors.issueType}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="issue-title">Issue Title</Label>
                <Input
                  id="issue-title"
                  value={form.title}
                  maxLength={TITLE_MAX}
                  placeholder="What is the issue in a few words?"
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  aria-invalid={!!fieldErrors.title}
                />
                {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="issue-description">What happened?</Label>
                <Textarea
                  id="issue-description"
                  value={form.description}
                  maxLength={DESCRIPTION_MAX}
                  rows={4}
                  placeholder="Please describe what you were doing, what you expected to happen, and what happened instead."
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  aria-invalid={!!fieldErrors.description}
                />
                {fieldErrors.description && <p className="text-xs text-destructive">{fieldErrors.description}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="issue-page">Which page is this about?</Label>
                <Select
                  value={form.reportedPage}
                  onValueChange={(v) => setForm((f) => ({ ...f, reportedPage: v }))}
                >
                  <SelectTrigger id="issue-page">
                    <SelectValue placeholder="Select a page" />
                  </SelectTrigger>
                  <SelectContent>
                    {pageOptions.map((p) => (
                      <SelectItem key={p.url || "other"} value={p.title}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="issue-priority">Priority / Impact</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                >
                  <SelectTrigger id="issue-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="issue-screenshot">Attach screenshot <span className="text-muted-foreground font-normal">(optional)</span></Label>
                {file ? (
                  <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-[13px]">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Input
                    id="issue-screenshot"
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileChange}
                  />
                )}
                {fileError && <p className="text-xs text-destructive">{fileError}</p>}
              </div>

              {submitError && (
                <p className="text-xs text-destructive" role="alert">{submitError}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Sending…" : "Send Report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
