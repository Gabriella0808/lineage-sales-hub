import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { MapPin, Calendar, NotebookPen, Search, Loader2, Trash2, Plus } from "lucide-react";

interface Dealer {
  id: string;
  name: string;
  street_address?: string | null;
  city: string | null;
  state: string | null;
  status: string;
  rep_id: string | null;
  lat: number | null;
  lng: number | null;
}

interface CheckIn {
  id: string;
  dealer_id: string;
  user_id: string;
  visit_date: string;
  notes: string | null;
  outcome: string | null;
  created_at: string;
}

const OUTCOMES = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "follow_up", label: "Follow-up needed" },
  { value: "no_contact", label: "No contact" },
];

function recencyColor(days: number | null): string {
  if (days === null) return "#94a3b8"; // never visited - slate
  if (days <= 14) return "#16a34a"; // green
  if (days <= 45) return "#eab308"; // yellow
  if (days <= 90) return "#f97316"; // orange
  return "#dc2626"; // red
}

export default function CheckInsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Dealer | null>(null);
  const [form, setForm] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    outcome: "positive",
    notes: "",
    follow_up_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [newDealer, setNewDealer] = useState({
    name: "",
    street_address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
    website: "",
  });

  // Last visit by dealer
  const lastVisitMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of checkIns) {
      const cur = m.get(c.dealer_id);
      if (!cur || cur < c.visit_date) m.set(c.dealer_id, c.visit_date);
    }
    return m;
  }, [checkIns]);

  const dealersWithMeta = useMemo(() => {
    return dealers.map((d) => {
      const last = lastVisitMap.get(d.id) ?? null;
      const days = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
        : null;
      return { ...d, lastVisit: last, daysSince: days };
    });
  }, [dealers, lastVisitMap]);

  const filteredDealers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dealersWithMeta;
    return dealersWithMeta.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.city ?? "").toLowerCase().includes(q) ||
        (d.state ?? "").toLowerCase().includes(q),
    );
  }, [dealersWithMeta, search]);

  // Fetch token
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("get-mapbox-token");
      if (error || !data?.token) {
        toast({
          title: "Map unavailable",
          description: error?.message || "Mapbox token not configured",
          variant: "destructive",
        });
        return;
      }
      setToken(data.token as string);
    })();
  }, [toast]);

  // Load dealers + check-ins
  const load = async () => {
    setLoading(true);
    const [dealersRes, checkInsRes] = await Promise.all([
      supabase
        .from("dealers")
        .select("id, name, street_address, city, state, status, rep_id, lat, lng")
        .order("name"),
      supabase
        .from("dealer_check_ins")
        .select("*")
        .order("visit_date", { ascending: false }),
    ]);
    if (dealersRes.error) {
      toast({ title: "Failed to load dealers", description: dealersRes.error.message, variant: "destructive" });
    } else {
      setDealers((dealersRes.data ?? []) as Dealer[]);
    }
    if (checkInsRes.error) {
      toast({ title: "Failed to load check-ins", description: checkInsRes.error.message, variant: "destructive" });
    } else {
      setCheckIns((checkInsRes.data ?? []) as CheckIn[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geocode missing dealers
  useEffect(() => {
    if (!token || dealers.length === 0) return;
    const missing = dealers.filter(
      (d) => (d.lat == null || d.lng == null) && (d.street_address || d.city || d.state),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    setGeocoding(true);
    (async () => {
      const updates: Array<{ id: string; lat: number; lng: number }> = [];
      // Throttle ~5 req/s
      for (const d of missing) {
        if (cancelled) break;
        const q = encodeURIComponent(
          [d.street_address, d.city, d.state, "USA"].filter(Boolean).join(", "),
        );
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${token}&country=US&limit=1`,
          );
          const json = await res.json();
          const center = json?.features?.[0]?.center;
          if (Array.isArray(center) && center.length === 2) {
            const [lng, lat] = center;
            updates.push({ id: d.id, lat, lng });
            // persist (RLS allows manager/admin)
            await supabase.from("dealers").update({ lat, lng }).eq("id", d.id);
          }
        } catch {
          // ignore individual failures
        }
        await new Promise((r) => setTimeout(r, 220));
      }
      if (!cancelled && updates.length > 0) {
        setDealers((prev) =>
          prev.map((d) => {
            const u = updates.find((x) => x.id === d.id);
            return u ? { ...d, lat: u.lat, lng: u.lng } : d;
          }),
        );
      }
      if (!cancelled) setGeocoding(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token, dealers]);

  // Init map
  useEffect(() => {
    if (!token || !mapContainer.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-96, 39],
      zoom: 3.4,
      projection: { name: "mercator" } as never,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("style.load", () => {
      try {
        map.setProjection("mercator" as never);
        map.setFog(null as never);
      } catch {
        // ignore if unsupported
      }
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  const didFitRef = useRef(false);

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new mapboxgl.LngLatBounds();
    let added = 0;
    for (const d of filteredDealers) {
      if (d.lat == null || d.lng == null) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${d.name} marker`);
      el.style.cssText = `
        width: 18px; height: 18px; border-radius: 9999px;
        background: ${recencyColor(d.daysSince)};
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.35);
        cursor: pointer; padding: 0;
        transition: background-color 200ms ease;
      `;
      el.onclick = (e) => {
        e.stopPropagation();
        setSelected(d);
      };
      const addressLine = [d.street_address, d.city, d.state].filter(Boolean).join(", ");
      const escape = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const popup = new mapboxgl.Popup({
        offset: 14,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(
        `<div style="font-family: inherit; font-size: 12px; line-height: 1.35; max-width: 220px;">
          <div style="font-weight: 600; margin-bottom: 2px;">${escape(d.name)}</div>
          <div style="color: #475569;">${escape(addressLine || "Location unknown")}</div>
        </div>`,
      );
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([d.lng, d.lat])
        .setPopup(popup)
        .addTo(map);
      el.addEventListener("mouseenter", () => marker.togglePopup());
      el.addEventListener("mouseleave", () => {
        if (popup.isOpen()) popup.remove();
      });
      markersRef.current.push(marker);
      bounds.extend([d.lng, d.lat]);
      added++;
    }
    // Only auto-fit on first render so logging a check-in doesn't jump the map
    if (added > 0 && !bounds.isEmpty() && !didFitRef.current) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 600 });
      didFitRef.current = true;
    }
  }, [filteredDealers]);

  const dealerCheckIns = useMemo(() => {
    if (!selected) return [];
    return checkIns
      .filter((c) => c.dealer_id === selected.id)
      .sort((a, b) => (a.visit_date < b.visit_date ? 1 : -1));
  }, [selected, checkIns]);

  const deleteDealer = async (dealer: Dealer) => {
    if (!confirm(`Delete ${dealer.name}? This removes the pin and all its check-ins.`)) return;
    // Delete child check-ins first (no cascade)
    const { error: ciErr } = await supabase
      .from("dealer_check_ins")
      .delete()
      .eq("dealer_id", dealer.id);
    if (ciErr) {
      toast({ title: "Failed to delete check-ins", description: ciErr.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("dealers").delete().eq("id", dealer.id);
    if (error) {
      toast({ title: "Failed to delete dealer", description: error.message, variant: "destructive" });
      return;
    }
    setDealers((prev) => prev.filter((d) => d.id !== dealer.id));
    setCheckIns((prev) => prev.filter((c) => c.dealer_id !== dealer.id));
    setSelected(null);
    toast({ title: "Dealer deleted" });
  };

  const deleteCheckIn = async (id: string) => {
    if (!confirm("Delete this check-in?")) return;
    const prev = checkIns;
    setCheckIns((p) => p.filter((c) => c.id !== id));
    const { error } = await supabase.from("dealer_check_ins").delete().eq("id", id);
    if (error) {
      setCheckIns(prev);
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Check-in deleted" });
  };

  const saveCheckIn = async () => {
    if (!user || !selected) return;
    if (form.outcome === "follow_up" && !form.follow_up_date) {
      toast({ title: "Follow-up date required", description: "Pick a date for the follow-up task.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("dealer_check_ins")
      .insert({
        dealer_id: selected.id,
        user_id: user.id,
        visit_date: form.visit_date,
        outcome: form.outcome,
        notes: form.notes.trim() || null,
      })
      .select()
      .single();
    if (error) {
      setSaving(false);
      toast({ title: "Failed to save check-in", description: error.message, variant: "destructive" });
      return;
    }
    // Optimistically update so pin color refreshes immediately
    if (data) {
      setCheckIns((prev) => [data as CheckIn, ...prev]);
    }

    // If follow-up, create a task + notification
    if (form.outcome === "follow_up" && form.follow_up_date) {
      const taskTitle = `Follow up with ${selected.name}`;
      const taskDesc = form.notes.trim()
        ? `From check-in on ${form.visit_date}: ${form.notes.trim()}`
        : `From check-in on ${form.visit_date}`;
      const { data: taskRow, error: taskErr } = await supabase
        .from("manager_tasks")
        .insert({
          user_id: user.id,
          assigned_user_id: user.id,
          title: taskTitle,
          description: taskDesc,
          due_date: form.follow_up_date,
          status: "todo",
        })
        .select("id")
        .single();
      if (taskErr) {
        toast({ title: "Check-in saved, task failed", description: taskErr.message, variant: "destructive" });
      } else {
        // Self-notification confirming the follow-up was scheduled
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "follow_up_scheduled",
          title: "Follow-up scheduled",
          body: `${taskTitle} — due ${format(new Date(form.follow_up_date), "MMM d, yyyy")}`,
          link: "/tasks",
          related_id: taskRow?.id ?? null,
        });
        toast({ title: "Follow-up task created", description: `Due ${format(new Date(form.follow_up_date), "MMM d, yyyy")}` });
      }
    } else {
      toast({ title: "Check-in logged" });
    }

    setSaving(false);
    setForm({ visit_date: format(new Date(), "yyyy-MM-dd"), outcome: "positive", notes: "", follow_up_date: "" });
  };

  const addDealer = async () => {
    const name = newDealer.name.trim();
    const street = newDealer.street_address.trim();
    const city = newDealer.city.trim();
    const state = newDealer.state.trim().toUpperCase();
    if (!name) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (name.length > 200) {
      toast({ title: "Name too long", description: "Max 200 characters", variant: "destructive" });
      return;
    }
    if (!street) {
      toast({ title: "Street address required", description: "Please enter the dealer's street address.", variant: "destructive" });
      return;
    }
    if (street.length > 200) {
      toast({ title: "Address too long", description: "Max 200 characters", variant: "destructive" });
      return;
    }
    if (!city) {
      toast({ title: "City required", variant: "destructive" });
      return;
    }
    if (!state) {
      toast({ title: "State required", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    const { data, error } = await supabase
      .from("dealers")
      .insert({
        name,
        street_address: street,
        city,
        state,
        phone: newDealer.phone.trim() || null,
        email: newDealer.email.trim() || null,
        website: newDealer.website.trim() || null,
        status: "active",
      })
      .select("id, name, street_address, city, state, status, rep_id, lat, lng")
      .single();
    setAddSaving(false);
    if (error) {
      toast({ title: "Failed to add dealer", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setDealers((prev) => [...prev, data as Dealer]);
    }
    setNewDealer({ name: "", street_address: "", city: "", state: "", phone: "", email: "", website: "" });
    setAddOpen(false);
    toast({ title: "Dealer added", description: `${name} created. Geocoding will run shortly.` });
  };

  const placedCount = dealersWithMeta.filter((d) => d.lat != null && d.lng != null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-semibold">Check-Ins</h1>
          <p className="text-sm text-muted-foreground">
            Track dealer visits across your team. Tap a pin to log a visit.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search dealers, city, state..."
              className="pl-8 h-9 w-[260px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" /> Add dealer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add a dealer account</DialogTitle>
                <DialogDescription>
                  Create a new dealer. Coordinates are auto-filled from the address.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="d-name">Dealer name *</Label>
                  <Input
                    id="d-name"
                    value={newDealer.name}
                    onChange={(e) => setNewDealer({ ...newDealer, name: e.target.value })}
                    maxLength={200}
                    placeholder="Acme Furniture Co."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-street">Street address *</Label>
                  <Input
                    id="d-street"
                    value={newDealer.street_address}
                    onChange={(e) => setNewDealer({ ...newDealer, street_address: e.target.value })}
                    maxLength={200}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="d-city">City *</Label>
                    <Input
                      id="d-city"
                      value={newDealer.city}
                      onChange={(e) => setNewDealer({ ...newDealer, city: e.target.value })}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-state">State *</Label>
                    <Input
                      id="d-state"
                      value={newDealer.state}
                      onChange={(e) => setNewDealer({ ...newDealer, state: e.target.value })}
                      maxLength={2}
                      placeholder="UT"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="d-phone">Phone</Label>
                    <Input
                      id="d-phone"
                      type="tel"
                      value={newDealer.phone}
                      onChange={(e) => setNewDealer({ ...newDealer, phone: e.target.value })}
                      maxLength={30}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-email">Email</Label>
                    <Input
                      id="d-email"
                      type="email"
                      value={newDealer.email}
                      onChange={(e) => setNewDealer({ ...newDealer, email: e.target.value })}
                      maxLength={255}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-website">Website</Label>
                  <Input
                    id="d-website"
                    type="url"
                    value={newDealer.website}
                    onChange={(e) => setNewDealer({ ...newDealer, website: e.target.value })}
                    maxLength={255}
                    placeholder="https://"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>
                  Cancel
                </Button>
                <Button
                  onClick={addDealer}
                  disabled={
                    addSaving ||
                    !newDealer.name.trim() ||
                    !newDealer.street_address.trim() ||
                    !newDealer.city.trim() ||
                    !newDealer.state.trim()
                  }
                >
                  {addSaving ? "Saving..." : "Add dealer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {geocoding && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Geocoding…
              </span>
            )}
            <span>
              {placedCount}/{dealersWithMeta.length} on map
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium text-foreground">Last visit:</span>
        {[
          { c: "#16a34a", l: "≤ 2 weeks" },
          { c: "#eab308", l: "≤ 45 days" },
          { c: "#f97316", l: "≤ 90 days" },
          { c: "#dc2626", l: "> 90 days" },
          { c: "#94a3b8", l: "Never" },
        ].map((x) => (
          <span key={x.l} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-white shadow"
              style={{ backgroundColor: x.c }}
            />
            {x.l}
          </span>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div
          ref={mapContainer}
          className="w-full"
          style={{ height: "calc(100vh - 280px)", minHeight: 420 }}
        />
        {!token && (
          <div className="p-6 text-sm text-muted-foreground">Loading map…</div>
        )}
      </Card>

      {/* Recent activity strip */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Recent check-ins</h2>
          <span className="text-xs text-muted-foreground">{checkIns.length} total</span>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : checkIns.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No check-ins yet. Click any dealer pin to log your first visit.
          </p>
        ) : (
          <ul className="divide-y">
            {checkIns.slice(0, 8).map((c) => {
              const d = dealers.find((x) => x.id === c.dealer_id);
              const canDelete = c.user_id === user?.id;
              return (
                <li key={c.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d?.name ?? "Unknown dealer"}</p>
                    {c.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{c.notes}</p>
                    )}
                  </div>
                  <div className="flex items-start gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(c.visit_date), "MMM d, yyyy")}
                      </p>
                      {c.outcome && (
                        <Badge variant="secondary" className="text-[10px] mt-0.5">
                          {OUTCOMES.find((o) => o.value === c.outcome)?.label ?? c.outcome}
                        </Badge>
                      )}
                    </div>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteCheckIn(c.id)}
                        aria-label="Delete check-in"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Dealer detail / log check-in sheet */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {selected.name}
                </SheetTitle>
                <SheetDescription>
                  {[selected.street_address, selected.city, selected.state]
                    .filter(Boolean)
                    .join(", ") || "Location unknown"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Last visit
                  </h3>
                  {(() => {
                    const last = lastVisitMap.get(selected.id);
                    if (!last) return <p className="text-sm text-muted-foreground">Never visited</p>;
                    return (
                      <p className="text-sm">
                        {format(new Date(last), "MMM d, yyyy")}{" "}
                        <span className="text-muted-foreground">
                          ({formatDistanceToNow(new Date(last), { addSuffix: true })})
                        </span>
                      </p>
                    );
                  })()}
                </div>

                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteDealer(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete this pin
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <NotebookPen className="h-3.5 w-3.5" /> Log a check-in
                  </h3>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={form.visit_date}
                        onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
                      />
                      <Select
                        value={form.outcome}
                        onValueChange={(v) => setForm({ ...form, outcome: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OUTCOMES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {form.outcome === "follow_up" && (
                      <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 space-y-1.5">
                        <Label htmlFor="follow-up-date" className="text-xs font-medium">
                          Follow-up date
                        </Label>
                        <Input
                          id="follow-up-date"
                          type="date"
                          min={format(new Date(), "yyyy-MM-dd")}
                          value={form.follow_up_date}
                          onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          A task will be added to "My Tasks" and you'll get a notification.
                        </p>
                      </div>
                    )}
                    <Textarea
                      placeholder="Notes from this visit..."
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      maxLength={2000}
                    />
                    <Button onClick={saveCheckIn} disabled={saving} className="w-full">
                      {saving ? "Saving..." : "Save check-in"}
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> History
                  </h3>
                  {dealerCheckIns.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No check-ins yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {dealerCheckIns.map((c) => (
                        <li key={c.id} className="rounded border p-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {format(new Date(c.visit_date), "MMM d, yyyy")}
                            </span>
                            {c.outcome && (
                              <Badge variant="secondary" className="text-[10px]">
                                {OUTCOMES.find((o) => o.value === c.outcome)?.label ?? c.outcome}
                              </Badge>
                            )}
                          </div>
                          {c.notes && (
                            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                              {c.notes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
