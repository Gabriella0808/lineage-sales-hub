import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type DealerBranding = {
  user_id?: string;
  company_name: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  intro_message: string | null;
  footer_message: string | null;
};

const EMPTY: DealerBranding = {
  company_name: "", logo_url: "", contact_email: "", contact_phone: "",
  contact_address: "", intro_message: "", footer_message: "",
};

export default function DealerBrandingDialog({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved?: (b: DealerBranding) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [b, setB] = useState<DealerBranding>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    supabase.from("dealer_branding").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setB({ ...EMPTY, ...data }); else setB(EMPTY); setLoading(false); });
  }, [open, user?.id]);

  const upload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("dealer-logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("dealer-logos").getPublicUrl(path);
      setB((s) => ({ ...s, logo_url: pub.publicUrl }));
    } catch (e: any) {
      toast({ title: "Logo upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload = { ...b, user_id: user.id };
    const { error } = await supabase.from("dealer_branding").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Branding saved" });
    onSaved?.(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quote branding</DialogTitle>
          <DialogDescription>This appears on every customer quote you send.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3 mt-1">
                {b.logo_url ? <img src={b.logo_url} alt="logo" className="h-12 max-w-[160px] object-contain border rounded p-1" /> : <div className="h-12 w-24 border border-dashed rounded grid place-items-center text-xs text-muted-foreground">No logo</div>}
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                    <span>{uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />} Upload</span>
                  </Button>
                </label>
              </div>
            </div>
            <div>
              <Label>Company name</Label>
              <Input value={b.company_name || ""} onChange={(e) => setB({ ...b, company_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact email</Label>
                <Input value={b.contact_email || ""} onChange={(e) => setB({ ...b, contact_email: e.target.value })} />
              </div>
              <div>
                <Label>Contact phone</Label>
                <Input value={b.contact_phone || ""} onChange={(e) => setB({ ...b, contact_phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={b.contact_address || ""} onChange={(e) => setB({ ...b, contact_address: e.target.value })} />
            </div>
            <div>
              <Label>Default intro message</Label>
              <Textarea rows={2} value={b.intro_message || ""} onChange={(e) => setB({ ...b, intro_message: e.target.value })} placeholder="Thanks for stopping by — here is the quote we discussed." />
            </div>
            <div>
              <Label>Default footer / terms</Label>
              <Textarea rows={2} value={b.footer_message || ""} onChange={(e) => setB({ ...b, footer_message: e.target.value })} placeholder="Quote valid for 30 days." />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
