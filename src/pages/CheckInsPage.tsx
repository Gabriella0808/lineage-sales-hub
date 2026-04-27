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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { MapPin, Calendar, NotebookPen, Search, Loader2, Trash2, Plus, Users } from "lucide-react";
import { STATE_TO_TERRITORY, STATE_NAME_TO_CODE, colorForTerritory } from "@/lib/territoryMap";

// Team member → match config. We match dealers by rep_owner (authoritative
// when present, e.g. "will") OR by state code (so reps without a rep_owner
// tag still get attributed to the right manager via territory).
type TeamMemberId = "will" | "mateo" | "chris";
const TEAM_MEMBERS: {
  id: TeamMemberId;
  name: string;
  repOwners: string[]; // matched case-insensitively against dealers.rep_owner
  states: string[]; // kept for reference; unused while ownerOnly is true
  // Strict ownership: only dealers with matching rep_owner are shown.
  // This guarantees no account appears in more than one teammate's section.
  ownerOnly: true;
}[] = [
  {
    id: "will",
    name: "Will Grisack",
    repOwners: ["will"],
    states: [],
    ownerOnly: true,
  },
  {
    id: "mateo",
    name: "Mateo De Lisa",
    repOwners: ["mateo"],
    states: [],
    ownerOnly: true,
  },
  {
    id: "chris",
    name: "Chris De Lisa",
    repOwners: ["chris"],
    states: [],
    ownerOnly: true,
  },
];

interface Dealer {
  id: string;
  name: string;
  street_address?: string | null;
  city: string | null;
  state: string | null;
  status: string;
  rep_id: string | null;
  rep_owner?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  notes?: string | null;
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
  log_type?: string | null;
  brand?: string | null;
  new_placement?: string | null;
  created_at: string;
}

const LOG_TYPES = [
  { value: "meeting", label: "Meeting" },
  { value: "phone_call", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "letter", label: "Letter" },
  { value: "follow_up", label: "Follow-up" },
];

const PLACEMENT_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const BRAND_OPTIONS = [
  { value: "sea_winds", label: "Sea Winds" },
  { value: "finn_and_louise", label: "Finn & Louise" },
  { value: "lux_lighting", label: "Lux Lighting" },
];

// Kept for backwards compatibility with existing records that used the old "outcome" field
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
  const territoryPopupRef = useRef<mapboxgl.Popup | null>(null);
  const dealerHoverRef = useRef(false);

  const [token, setToken] = useState<string | null>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Dealer | null>(null);
  const [detailCheckIn, setDetailCheckIn] = useState<CheckIn | null>(null);
  const [form, setForm] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    log_type: "",
    new_placement: "",
    brands: [] as string[],
    notes: "",
    follow_up_date: "",
  });
  const [recentRange, setRecentRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [territoriesOnly, setTerritoriesOnly] = useState(false);
  const [teamFilter, setTeamFilter] = useState<TeamMemberId | "all">("all");
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
    const team = teamFilter === "all" ? null : TEAM_MEMBERS.find((t) => t.id === teamFilter);
    const stateSet = team ? new Set(team.states) : null;
    const ownerSet = team ? new Set(team.repOwners.map((s) => s.toLowerCase())) : null;
    return dealersWithMeta.filter((d) => {
      if (team && stateSet && ownerSet) {
        const owner = (d.rep_owner ?? "").trim().toLowerCase();
        const code = (d.state ?? "").trim().toUpperCase();
        const ownerMatch = owner && ownerSet.has(owner);
        const stateMatch = code && stateSet.has(code);
        if (team.ownerOnly) {
          // Restrict strictly to rep_owner matches (e.g. Mateo, fully tagged).
          if (!ownerMatch) return false;
        } else if (!ownerMatch && !stateMatch) {
          // Match if EITHER signal points to this teammate.
          return false;
        }
      }
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.city ?? "").toLowerCase().includes(q) ||
        (d.state ?? "").toLowerCase().includes(q)
      );
    });
  }, [dealersWithMeta, search, teamFilter]);

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
    // Fetch all dealers in pages of 1000 (Supabase default cap per request)
    const fetchAllDealers = async (): Promise<{ data: Dealer[] | null; error: any }> => {
      const PAGE = 1000;
      let from = 0;
      const all: Dealer[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("dealers")
          .select("id, name, street_address, city, state, status, rep_id, rep_owner, phone, email, website, notes, lat, lng")
          .order("name")
          .range(from, from + PAGE - 1);
        if (error) return { data: null, error };
        const batch = (data ?? []) as Dealer[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return { data: all, error: null };
    };

    const [dealersRes, checkInsRes] = await Promise.all([
      fetchAllDealers(),
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
      const ci = (checkInsRes.data ?? []) as CheckIn[];
      setCheckIns(ci);
      const ids = Array.from(new Set(ci.map((c) => c.user_id).filter(Boolean)));
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          if (p.user_id) map[p.user_id] = p.full_name || "Unknown";
        });
        setUserNames(map);
      }
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
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-96, 39],
      zoom: 3.4,
      projection: { name: "mercator" } as never,
      renderWorldCopies: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const hoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
    });
    territoryPopupRef.current = hoverPopup;

    map.on("style.load", async () => {
      try {
        map.setProjection("mercator" as never);
        map.setFog(null as never);
      } catch {
        // ignore if unsupported
      }

      // Load US states boundaries and color by territory
      try {
        const res = await fetch(
          "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json",
        );
        const geo = await res.json();
        // Tag each feature with its territory
        for (const f of geo.features ?? []) {
          // Feature 'id' is the FIPS code; we need the 2-letter state code.
          // The GeoJSON uses `properties.name` (full state name) — convert.
          const code = STATE_NAME_TO_CODE[f.properties?.name] ?? null;
          const territory = code ? STATE_TO_TERRITORY[code] ?? null : null;
          f.properties.territory = territory;
          f.properties.fillColor = territory ? colorForTerritory(territory) : "#00000000";
        }

        if (!map.getSource("us-states")) {
          map.addSource("us-states", { type: "geojson", data: geo });
        }
        if (!map.getLayer("us-states-fill")) {
          map.addLayer(
            {
              id: "us-states-fill",
              type: "fill",
              source: "us-states",
              paint: {
                "fill-color": ["get", "fillColor"],
                "fill-opacity": [
                  "case",
                  ["==", ["get", "territory"], null], 0,
                  ["boolean", ["feature-state", "hover"], false], 0.55,
                  0.35,
                ],
              },
            },
            // Insert beneath labels so place names stay visible
            map.getStyle().layers?.find((l) => l.type === "symbol")?.id,
          );
        }
        if (!map.getLayer("us-states-outline")) {
          map.addLayer({
            id: "us-states-outline",
            type: "line",
            source: "us-states",
            paint: {
              "line-color": ["get", "fillColor"],
              "line-width": 1,
              "line-opacity": [
                "case",
                ["==", ["get", "territory"], null], 0,
                0.8,
              ],
            },
          });
        }

        let hoveredId: number | string | null = null;
        map.on("mousemove", "us-states-fill", (e) => {
          const f = e.features?.[0];
          if (!f || !f.properties?.territory) return;
          if (dealerHoverRef.current) {
            // Suppress territory hover while pointer is over a dealer pin
            hoverPopup.remove();
            return;
          }
          map.getCanvas().style.cursor = "pointer";
          if (hoveredId !== null) {
            map.setFeatureState({ source: "us-states", id: hoveredId }, { hover: false });
          }
          hoveredId = (f.id as number | string | undefined) ?? null;
          if (hoveredId !== null) {
            map.setFeatureState({ source: "us-states", id: hoveredId }, { hover: true });
          }
          hoverPopup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family: inherit; font-size: 12px; padding: 2px 4px;">
                <div style="font-weight: 600;">${String(f.properties.territory).replace(/</g, "&lt;")}</div>
                <div style="color:#64748b; font-size: 11px;">${String(f.properties.name ?? "").replace(/</g, "&lt;")}</div>
              </div>`,
            )
            .addTo(map);
        });
        map.on("mouseleave", "us-states-fill", () => {
          map.getCanvas().style.cursor = "";
          if (hoveredId !== null) {
            map.setFeatureState({ source: "us-states", id: hoveredId }, { hover: false });
          }
          hoveredId = null;
          hoverPopup.remove();
        });
      } catch {
        // territory layer is best-effort; ignore failures
      }
    });

    mapRef.current = map;
    return () => {
      hoverPopup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  const didFitRef = useRef(false);
  const lastFitTeamRef = useRef<TeamMemberId | "all">("all");

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (territoriesOnly) return;

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
      el.addEventListener("mouseenter", () => {
        dealerHoverRef.current = true;
        territoryPopupRef.current?.remove();
        marker.togglePopup();
      });
      el.addEventListener("mouseleave", () => {
        dealerHoverRef.current = false;
        if (popup.isOpen()) popup.remove();
      });
      markersRef.current.push(marker);
      bounds.extend([d.lng, d.lat]);
      added++;
    }
    // Auto-fit on first render and whenever the team filter changes,
    // so switching to a teammate re-centers the map on their dealers.
    const teamChanged = lastFitTeamRef.current !== teamFilter;
    if (added > 0 && !bounds.isEmpty() && (!didFitRef.current || teamChanged)) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 600 });
      didFitRef.current = true;
      lastFitTeamRef.current = teamFilter;
    }
  }, [filteredDealers, territoriesOnly, teamFilter]);

  // Bump territory fill opacity when in "territories only" mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("us-states-fill")) return;
      map.setPaintProperty("us-states-fill", "fill-opacity", [
        "case",
        ["==", ["get", "territory"], null], 0,
        ["boolean", ["feature-state", "hover"], false], territoriesOnly ? 0.75 : 0.55,
        territoriesOnly ? 0.6 : 0.35,
      ] as never);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [territoriesOnly, token]);

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
    if (!form.log_type) {
      toast({ title: "Log Type required", description: "Pick a log type.", variant: "destructive" });
      return;
    }
    if (form.log_type === "follow_up" && !form.follow_up_date) {
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
        outcome: form.log_type,
        log_type: form.log_type,
        new_placement: form.new_placement || null,
        brand: form.brands.length ? form.brands.join(", ") : null,
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
      if (user && !userNames[user.id]) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        setUserNames((prev) => ({ ...prev, [user.id]: prof?.full_name || user.email || "You" }));
      }
    }

    // If follow-up, create a task + notification
    if (form.log_type === "follow_up" && form.follow_up_date) {
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
    setForm({
      visit_date: format(new Date(), "yyyy-MM-dd"),
      log_type: "",
      new_placement: "",
      brands: [],
      notes: "",
      follow_up_date: "",
    });
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
      .select("id, name, street_address, city, state, status, rep_id, rep_owner, lat, lng")
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
        <Button
          type="button"
          size="sm"
          variant={territoriesOnly ? "default" : "outline"}
          className="ml-auto h-7 text-xs"
          onClick={() => setTerritoriesOnly((v) => !v)}
        >
          {territoriesOnly ? "Show pins" : "View territories only"}
        </Button>
      </div>

      {/* My Team — filter dealers on the map by team member */}
      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> My Team
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant={teamFilter === "all" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setTeamFilter("all")}
            >
              All
            </Button>
            {TEAM_MEMBERS.map((m) => {
              const active = teamFilter === m.id;
              const owners = new Set(m.repOwners.map((s) => s.toLowerCase()));
              const states = new Set(m.states);
              const count = dealersWithMeta.filter((d) => {
                const owner = (d.rep_owner ?? "").trim().toLowerCase();
                const code = (d.state ?? "").trim().toUpperCase();
                const ownerMatch = owner && owners.has(owner);
                const stateMatch = code && states.has(code);
                return m.ownerOnly ? ownerMatch : ownerMatch || stateMatch;
              }).length;
              return (
                <Button
                  key={m.id}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setTeamFilter(m.id)}
                >
                  {m.name}
                  <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>
          {teamFilter !== "all" && (
            <span className="text-xs text-muted-foreground ml-auto">
              Showing {filteredDealers.length} dealer{filteredDealers.length === 1 ? "" : "s"} for{" "}
              {TEAM_MEMBERS.find((m) => m.id === teamFilter)?.name}
            </span>
          )}
        </div>
      </Card>

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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold">Recent check-ins</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="recent-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="recent-from"
                type="date"
                value={recentRange.from}
                onChange={(e) => setRecentRange((r) => ({ ...r, from: e.target.value }))}
                className="h-8 w-[140px] text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="recent-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="recent-to"
                type="date"
                value={recentRange.to}
                onChange={(e) => setRecentRange((r) => ({ ...r, to: e.target.value }))}
                className="h-8 w-[140px] text-xs"
              />
            </div>
            {(recentRange.from || recentRange.to) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setRecentRange({ from: "", to: "" })}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        {(() => {
          const filtered = checkIns.filter((c) => {
            const d = c.visit_date.slice(0, 10);
            if (recentRange.from && d < recentRange.from) return false;
            if (recentRange.to && d > recentRange.to) return false;
            return true;
          });
          const hasRange = !!(recentRange.from || recentRange.to);
          return (
            <>
              <div className="flex items-center justify-end -mt-1 mb-2">
                <span className="text-xs text-muted-foreground">
                  {hasRange
                    ? `${filtered.length} in range • ${checkIns.length} total`
                    : `${checkIns.length} total`}
                </span>
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {checkIns.length === 0
                    ? "No check-ins yet. Click any dealer pin to log your first visit."
                    : "No check-ins in the selected date range."}
                </p>
              ) : (
                <ul className="divide-y">
                  {(hasRange ? filtered : filtered.slice(0, 8)).map((c) => {
                    const d = dealers.find((x) => x.id === c.dealer_id);
                    const canDelete = c.user_id === user?.id;
                    return (
                      <li key={c.id} className="py-2 flex items-stretch justify-between gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => setDetailCheckIn(c)}
                          className="flex-1 min-w-0 flex items-start justify-between gap-3 text-left rounded-md px-2 -mx-2 py-1 hover:bg-accent/50 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d?.name ?? "Unknown dealer"}</p>
                            {c.notes && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{c.notes}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(c.visit_date), "MMM d, yyyy")}
                            </p>
                            {c.outcome && (
                              <Badge variant="secondary" className="text-[10px] mt-0.5">
                                {OUTCOMES.find((o) => o.value === c.outcome)?.label ?? c.outcome}
                              </Badge>
                            )}
                          </div>
                        </button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 self-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCheckIn(c.id);
                            }}
                            aria-label="Delete check-in"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          );
        })()}
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
                <div className="rounded-lg border bg-card">
                  <div className="px-3 py-2 border-b bg-muted/40">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Account Details
                    </h3>
                  </div>
                  <dl className="divide-y text-sm">
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</dt>
                      <dd className="mt-0.5">
                        {selected.phone ? (
                          <a href={`tel:${selected.phone}`} className="text-primary hover:underline">
                            {selected.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</dt>
                      <dd className="mt-0.5 break-all">
                        {selected.email ? (
                          <a href={`mailto:${selected.email}`} className="text-primary hover:underline">
                            {selected.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Website</dt>
                      <dd className="mt-0.5 break-all">
                        {selected.website ? (
                          <a
                            href={selected.website.startsWith("http") ? selected.website : `https://${selected.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {selected.website}
                          </a>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Account Owner</dt>
                      <dd className="mt-0.5">
                        {(() => {
                          const owner = (selected.rep_owner ?? "").trim().toLowerCase();
                          const member = TEAM_MEMBERS.find((m) =>
                            m.repOwners.some((r) => r.toLowerCase() === owner)
                          );
                          return member ? (
                            <span className="font-medium">{member.name}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          );
                        })()}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Address</dt>
                      <dd className="mt-0.5">
                        {[selected.street_address, selected.city, selected.state]
                          .filter(Boolean)
                          .join(", ") || <span className="text-muted-foreground italic">—</span>}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Last check-in</dt>
                      <dd className="mt-0.5">
                        {(() => {
                          const last = lastVisitMap.get(selected.id);
                          if (!last)
                            return <span className="text-muted-foreground italic">No check-ins</span>;
                          return (
                            <>
                              {format(new Date(last), "MMM d, yyyy")}{" "}
                              <span className="text-muted-foreground">
                                ({formatDistanceToNow(new Date(last), { addSuffix: true })})
                              </span>
                            </>
                          );
                        })()}
                      </dd>
                    </div>
                    {selected.notes && (
                      <div className="px-3 py-2">
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-sm">{selected.notes}</dd>
                      </div>
                    )}
                  </dl>
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
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium mb-1.5 block">Visit date</Label>
                      <Input
                        type="date"
                        value={form.visit_date}
                        onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1.5 block">Log Type</Label>
                      <Select
                        value={form.log_type}
                        onValueChange={(v) => setForm({ ...form, log_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a log type" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOG_TYPES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1.5 block">New Placement</Label>
                      <Select
                        value={form.new_placement}
                        onValueChange={(v) => setForm({ ...form, new_placement: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLACEMENT_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1.5 block">Brand</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <span className={form.brands.length ? "" : "text-muted-foreground"}>
                              {form.brands.length
                                ? BRAND_OPTIONS.filter((o) => form.brands.includes(o.value))
                                    .map((o) => o.label)
                                    .join(", ")
                                : "Select brand(s)"}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
                          {BRAND_OPTIONS.map((o) => {
                            const checked = form.brands.includes(o.value);
                            return (
                              <label
                                key={o.value}
                                className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-accent"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    setForm((prev) => ({
                                      ...prev,
                                      brands: v
                                        ? [...prev.brands, o.value]
                                        : prev.brands.filter((b) => b !== o.value),
                                    }));
                                  }}
                                />
                                <span className="text-sm">{o.label}</span>
                              </label>
                            );
                          })}
                        </PopoverContent>
                      </Popover>
                    </div>
                    {form.log_type === "follow_up" && (
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
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDetailCheckIn(c);
                            }}
                            className="w-full text-left rounded border p-2 text-sm hover:bg-accent/50 hover:border-primary/40 transition-colors cursor-pointer"
                          >
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
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Logged by {userNames[c.user_id] ?? (c.user_id === user?.id ? "You" : "Unknown")}
                            </p>
                            {c.notes && (
                              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-2">
                                {c.notes}
                              </p>
                            )}
                          </button>
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

      {/* Check-in details popup */}
      <Dialog open={!!detailCheckIn} onOpenChange={(o) => !o && setDetailCheckIn(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          {detailCheckIn && (
            <>
              <DialogHeader>
                <DialogTitle>Visit details</DialogTitle>
                <DialogDescription>
                  {(selected?.id === detailCheckIn.dealer_id
                    ? selected?.name
                    : dealers.find((d) => d.id === detailCheckIn.dealer_id)?.name) ?? "Dealer"}{" "}
                  • {format(new Date(detailCheckIn.visit_date), "EEEE, MMM d, yyyy")}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-2 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Visit date
                    </Label>
                    <p className="mt-1 font-medium">
                      {format(new Date(detailCheckIn.visit_date), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Logged by
                    </Label>
                    <p className="mt-1 font-medium">
                      {userNames[detailCheckIn.user_id] ??
                        (detailCheckIn.user_id === user?.id ? "You" : "Unknown")}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Log type
                    </Label>
                    <p className="mt-1 font-medium">
                      {LOG_TYPES.find((l) => l.value === (detailCheckIn.log_type ?? detailCheckIn.outcome))?.label
                        ?? detailCheckIn.log_type
                        ?? detailCheckIn.outcome
                        ?? "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      New placement
                    </Label>
                    <p className="mt-1 font-medium">
                      {PLACEMENT_OPTIONS.find((p) => p.value === detailCheckIn.new_placement)?.label
                        ?? detailCheckIn.new_placement
                        ?? "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Brand(s)
                  </Label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {detailCheckIn.brand
                      ? detailCheckIn.brand.split(",").map((b) => {
                          const v = b.trim();
                          const label = BRAND_OPTIONS.find((o) => o.value === v)?.label ?? v;
                          return (
                            <Badge key={v} variant="secondary" className="text-[11px]">
                              {label}
                            </Badge>
                          );
                        })
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Notes
                  </Label>
                  <div className="mt-1 rounded-md border bg-muted/30 p-3 min-h-[80px] whitespace-pre-wrap">
                    {detailCheckIn.notes?.trim() ? detailCheckIn.notes : (
                      <span className="text-muted-foreground italic">No notes</span>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  Logged {formatDistanceToNow(new Date(detailCheckIn.created_at), { addSuffix: true })}
                </div>

                {detailCheckIn.user_id === user?.id && (
                  <div className="pt-2 border-t">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        const id = detailCheckIn.id;
                        setDetailCheckIn(null);
                        await deleteCheckIn(id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete visit
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
