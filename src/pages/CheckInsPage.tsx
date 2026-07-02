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

// Today's date as YYYY-MM-DD in America/New_York (EST/EDT) so logging a
// visit always resolves to the user's "today" on the East Coast.
const todayEST = (): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
};

// Safely parse a YYYY-MM-DD (or ISO) value as a calendar date without
// timezone drift (avoids `new Date("2025-05-08")` becoming the previous
// day in negative-UTC timezones like EST).
const parseDateOnly = (s: string | null | undefined): Date => {
  if (!s) return new Date();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return new Date(s);
};
import { MapPin, Calendar, NotebookPen, Search, Loader2, Trash2, Users, Navigation } from "lucide-react";
import { STATE_TO_TERRITORY, STATE_NAME_TO_CODE, colorForTerritory } from "@/lib/territoryMap";

// Team member -  match config. We match dealers by rep_owner (authoritative
// when present, e.g. "will") OR by state code (so reps without a rep_owner
// tag still get attributed to the right manager via territory).
type TeamMemberId = "will" | "mateo" | "chris" | "justin";
const TEAM_MEMBERS: {
  id: TeamMemberId;
  name: string;
  managerIds: string[]; // matched against dealers.manager_id (authoritative)
  repOwners: string[]; // legacy fallback: matched case-insensitively against dealers.rep_owner
  states: string[];
  ownerOnly: true;
}[] = [
  {
    id: "will",
    name: "Will Grisack",
    // Both Will manager records (Will Grisack + legacy "Will") map to this owner
    managerIds: [
      "fc3184b3-848c-4921-8770-46127a2821bf",
      "3b3de88e-5bfd-482b-9c26-af5003a79bba",
    ],
    repOwners: ["will"],
    states: [],
    ownerOnly: true,
  },
  {
    id: "mateo",
    name: "Mateo De Lisa",
    managerIds: [
      "b291385c-e5db-470c-93d3-9e034361b3d4",
      "20affa59-6b52-4fc9-8375-e068bc0e2a6d",
    ],
    repOwners: ["mateo"],
    states: [],
    ownerOnly: true,
  },
  {
    id: "chris",
    name: "Chris De Lisa",
    managerIds: ["b09a100d-4ea4-42b2-bcbf-97f1f4538310"],
    repOwners: ["chris"],
    states: [],
    ownerOnly: true,
  },
  {
    id: "justin",
    name: "Kate Jones",
    managerIds: [
      "970f22fb-f3bf-4c14-9b11-ce399b71b70f",
      "9ee7a284-0982-4cd6-94d4-288d9f1e7f71",
    ],
    repOwners: ["justin"],
    states: [],
    ownerOnly: true,
  },
];


// Returns true when a dealer belongs to the given team member, matching by
// manager_id (set during sync/import) OR legacy rep_owner string.
const dealerMatchesTeam = (
  d: { manager_id?: string | null; rep_owner?: string | null },
  m: { managerIds: string[]; repOwners: string[] },
) => {
  const mid = (d.manager_id ?? "").trim();
  if (mid && m.managerIds.includes(mid)) return true;
  const owner = (d.rep_owner ?? "").trim().toLowerCase();
  return !!owner && m.repOwners.some((r) => r.toLowerCase() === owner);
};

interface Dealer {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  street_address?: string | null;
  city: string | null;
  state: string | null;
  status: string;
  rep_id: string | null;
  rep_owner?: string | null;
  manager_id?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  notes?: string | null;
  buying_group?: string | null;
  source?: string | null;
  lat: number | null;
  lng: number | null;
}

const PROSPECT_COLOR = "#36454F"; // charcoal - prospects (not yet a customer in Acctivate)

function isProspectDealer(d: { source?: string | null }): boolean {
  // True only for CRM accounts marked as account_type='prospect' (injected
  // client-side with source='crm_prospect'). Field-only and Acctivate
  // dealers are NOT prospects.
  return (d.source ?? "").toLowerCase() === "crm_prospect";
}

function isCrmInjected(d: { source?: string | null }): boolean {
  const s = (d.source ?? "").toLowerCase();
  return s === "crm_prospect" || s === "crm";
}

function pinColorFor(d: { source?: string | null; daysSince: number | null }): string {
  // Prospects with no check-in yet stay fully charcoal. Once a check-in is
  // logged the fill switches to the recency color, and a charcoal ring (added
  // at marker render time) keeps signalling "still a prospect" until the
  // account is promoted to dealer in Acctivate.
  if (isProspectDealer(d)) {
    return d.daysSince == null ? PROSPECT_COLOR : recencyColor(d.daysSince);
  }
  return recencyColor(d.daysSince);
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

type LoadError = { message?: string } | null;

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

const CHECK_INS_CHANGED_EVENT = "lineage:check-ins-changed";

function notifyCheckInsChanged() {
  const timestamp = String(Date.now());
  window.dispatchEvent(new CustomEvent(CHECK_INS_CHANGED_EVENT, { detail: timestamp }));
  try {
    localStorage.setItem(CHECK_INS_CHANGED_EVENT, timestamp);
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHECK_INS_CHANGED_EVENT);
      channel.postMessage(timestamp);
      channel.close();
    }
  } catch {
    // Best-effort refresh signal only.
  }
}

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

function isRealFieldCheckIn(c: Pick<CheckIn, "log_type" | "outcome" | "notes">): boolean {
  if (c.log_type === "conversion" || c.outcome === "converted") return false;
  return !(c.notes ?? "").toLowerCase().startsWith("converted from crm account");
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
  const [prospectDealers, setProspectDealers] = useState<Dealer[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Dealer | null>(null);
  const [detailCheckIn, setDetailCheckIn] = useState<CheckIn | null>(null);
  const [form, setForm] = useState({
    visit_date: todayEST(),
    log_types: [] as string[],
    new_placement: "",
    brands: [] as string[],
    notes: "",
    follow_up_date: "",
    follow_up_title: "",
  });
  const [recentRange, setRecentRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [recentManagerFilter, setRecentManagerFilter] = useState<TeamMemberId | "all">("all");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [territoriesOnly, setTerritoriesOnly] = useState(false);
  const [teamFilter, setTeamFilter] = useState<TeamMemberId | "all">("all");
  const [colorFilter, setColorFilter] = useState<string | "all">("all");
  const [salesReps, setSalesReps] = useState<{ id: string; name: string }[]>([]);
  const [newDealer, setNewDealer] = useState<{
    first_name: string;
    last_name: string;
    name: string;
    street_address: string;
    city: string;
    state: string;
    phone: string;
    email: string;
    website: string;
    rep_owner: TeamMemberId | "";
    rep_id: string;
    notes: string;
    buying_group: "none" | "fmg" | "furniture_first" | "";
  }>({
    first_name: "",
    last_name: "",
    name: "",
    street_address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
    website: "",
    rep_owner: "",
    rep_id: "",
    notes: "",
    buying_group: "",
  });

  // Load sales reps for the Rep dropdown
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sales_reps")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      setSalesReps((data ?? []) as { id: string; name: string }[]);
    })();
  }, []);

  // Detect which teammate is logged in from their email so new dealers
  // automatically belong to that person's accounts.
  const detectedOwner: TeamMemberId | "" = useMemo(() => {
    const email = (user?.email ?? "").toLowerCase();
    if (email.startsWith("will@")) return "will";
    if (email.startsWith("mateo@")) return "mateo";
    if (email.startsWith("chris@")) return "chris";
    return "";
  }, [user?.email]);

  // When the dialog opens (or the detected user changes) preselect the owner.
  useEffect(() => {
    if (addOpen && !newDealer.rep_owner && detectedOwner) {
      setNewDealer((prev) => ({ ...prev, rep_owner: detectedOwner }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, detectedOwner]);

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
    return [...dealers, ...prospectDealers].map((d) => {
      const last = lastVisitMap.get(d.id) ?? null;
      const days = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
        : null;
      return { ...d, lastVisit: last, daysSince: days };
    });
  }, [dealers, prospectDealers, lastVisitMap]);

  const filteredDealers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const team = teamFilter === "all" ? null : TEAM_MEMBERS.find((t) => t.id === teamFilter);
    return dealersWithMeta.filter((d) => {
      if (team && !dealerMatchesTeam(d, team)) return false;
      if (colorFilter !== "all") {
        const pinColor = pinColorFor(d);
        // Prospect filter: include any prospect, even if the fill color has
        // switched to a recency color after a check-in (the charcoal ring
        // still marks them as a prospect).
        // Recency filter: include prospects whose current fill matches the
        // selected recency color too.
        const matchesProspect = colorFilter === PROSPECT_COLOR && isProspectDealer(d);
        if (!matchesProspect && pinColor !== colorFilter) return false;
      }
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.city ?? "").toLowerCase().includes(q) ||
        (d.state ?? "").toLowerCase().includes(q)
      );
    });
  }, [dealersWithMeta, search, teamFilter, colorFilter]);

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

  // Fetch CRM accounts (prospects AND dealers) and geocode their
  // addresses client-side via Mapbox so every account with an address gets
  // a pin. Cached in localStorage so we only hit the geocoder once per
  // address. For dealer-type accounts we also persist the geocoded
  // coordinates back to the matching dealers row, so the pin survives
  // future loads through the regular dealers query.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const PAGE = 1000;
      type CrmRow = {
        id: string;
        company_name: string;
        account_type: string;
        street_1: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        main_phone: string | null;
        email: string | null;
        website: string | null;
        notes: string | null;
        assigned_rep_id: string | null;
        assigned_manager_id: string | null;
      };
      let from = 0;
      const all: CrmRow[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("crm_accounts")
          .select(
            "id, company_name, account_type, street_1, city, state, zip, main_phone, email, website, notes, assigned_rep_id, assigned_manager_id",
          )
          .range(from, from + PAGE - 1);
        if (error) break;
        const batch = (data ?? []) as CrmRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;

      // Skip CRM accounts that already have a dealers row with lat/lng —
      // those are rendered via the dealers query and don't need a pin here.
      const { data: existingDealers } = await supabase
        .from("dealers")
        .select("id, crm_account_id, lat, lng")
        .not("crm_account_id", "is", null);
      const dealerByCrmId = new Map<string, { id: string; lat: number | null; lng: number | null }>();
      (existingDealers ?? []).forEach((d: any) => {
        if (d.crm_account_id) dealerByCrmId.set(d.crm_account_id, { id: d.id, lat: d.lat, lng: d.lng });
      });

      const CACHE_KEY = "lineage:crm-prospect-geocode:v1";
      let cache: Record<string, { lat: number; lng: number } | null> = {};
      try {
        cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      } catch {
        cache = {};
      }

      const buildAddr = (r: CrmRow) =>
        [r.street_1, r.city, r.state, r.zip].filter((p) => p && String(p).trim()).join(", ");

      const geocode = async (addr: string): Promise<{ lat: number; lng: number } | null> => {
        try {
          const url =
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json` +
            `?access_token=${encodeURIComponent(token)}&country=us&limit=1`;
          const res = await fetch(url);
          if (!res.ok) return null;
          const json = await res.json();
          const feat = json?.features?.[0];
          if (!feat?.center) return null;
          return { lng: Number(feat.center[0]), lat: Number(feat.center[1]) };
        } catch {
          return null;
        }
      };

      const out: Dealer[] = [];
      let pendingFlush = 0;
      const flush = () => {
        if (cancelled) return;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch {
          // ignore quota errors
        }
        setProspectDealers([...out]);
      };

      for (const r of all) {
        const addr = buildAddr(r);
        if (!addr) continue;
        const existing = dealerByCrmId.get(r.id);
        // Already pinned via the dealers query — nothing to do.
        if (existing && existing.lat != null && existing.lng != null) continue;

        let coords = cache[addr];
        if (coords === undefined) {
          coords = await geocode(addr);
          cache[addr] = coords;
          pendingFlush++;
        }
        if (!coords) continue;

        // Persist coords on the linked dealers row so the pin renders via
        // the dealers query on future loads (works for both dealer-type
        // and prospect-shell rows).
        if (existing && (existing.lat == null || existing.lng == null)) {
          await supabase
            .from("dealers")
            .update({ lat: coords.lat, lng: coords.lng })
            .eq("id", existing.id);
        }

        out.push({
          id: existing?.id ?? r.id,
          name: r.company_name,
          first_name: null,
          last_name: null,
          street_address: r.street_1,
          city: r.city,
          state: r.state,
          status: "active",
          rep_id: r.assigned_rep_id,
          rep_owner: null,
          manager_id: r.assigned_manager_id,
          phone: r.main_phone,
          email: r.email,
          website: r.website,
          notes: r.notes,
          buying_group: null,
          source: r.account_type === "dealer" ? "crm" : "crm_prospect",
          lat: coords.lat,
          lng: coords.lng,
        });
        if (pendingFlush >= 10) {
          pendingFlush = 0;
          flush();
        }
      }
      flush();
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);


  // Load dealers + check-ins
  const load = async () => {
    setLoading(true);
    // Fetch all dealers in pages of 1000 (Supabase default cap per request)
    const fetchAllDealers = async (): Promise<{ data: Dealer[] | null; error: LoadError }> => {
      const PAGE = 1000;
      let from = 0;
      const all: Dealer[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("dealers")
          .select("id, name, first_name, last_name, street_address, city, state, status, rep_id, rep_owner, manager_id, phone, email, website, notes, buying_group, source, lat, lng")
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

    const fetchAllCheckIns = async (): Promise<{ data: CheckIn[] | null; error: LoadError }> => {
      const PAGE = 1000;
      let from = 0;
      const all: CheckIn[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("dealer_check_ins")
          .select("id, dealer_id, user_id, visit_date, notes, outcome, log_type, brand, new_placement, created_at")
          .order("visit_date", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) return { data: null, error };
        const batch = (data ?? []) as CheckIn[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return { data: all, error: null };
    };

    try {
      const [dealersRes, checkInsRes] = await Promise.all([
        fetchAllDealers(),
        fetchAllCheckIns(),
      ]);
      if (dealersRes.error) {
        toast({ title: "Failed to load dealers", description: dealersRes.error.message, variant: "destructive" });
      } else {
        setDealers((dealersRes.data ?? []) as Dealer[]);
      }
      if (checkInsRes.error) {
        toast({ title: "Failed to load check-ins", description: checkInsRes.error.message, variant: "destructive" });
      } else {
        const ci = ((checkInsRes.data ?? []) as CheckIn[]).filter(isRealFieldCheckIn);
        setCheckIns(ci);
        const ids = Array.from(new Set(ci.map((c) => c.user_id).filter(Boolean)));
        if (ids.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", ids);
          const map: Record<string, string> = {};
          (profs ?? []).forEach((p: { user_id: string | null; full_name: string | null }) => {
            if (p.user_id) map[p.user_id] = p.full_name || "Unknown";
          });
          setUserNames(map);
        } else {
          setUserNames({});
        }
      }
    } catch (error: unknown) {
      toast({
        title: "Failed to load check-ins",
        description: error instanceof Error ? error.message : "Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side geocoding disabled - too slow at this volume and many
  // street_address values contain business names rather than real streets.
  // Geocoding should be done server-side during the Acctivate sync.
  // (Keeping the state var so existing UI references still work.)

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
          // The GeoJSON uses `properties.name` (full state name) - convert.
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
          const f = e.features?.[0] as any;
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
      const isProspect = isProspectDealer(d);
      const hasCheckIn = d.daysSince != null;
      const ringCharcoal = isProspect && hasCheckIn;
      el.style.cssText = `
        width: 18px; height: 18px; border-radius: 9999px;
        background: ${pinColorFor(d)};
        border: ${ringCharcoal ? `3px solid ${PROSPECT_COLOR}` : "2px solid white"};
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
    notifyCheckInsChanged();
    toast({ title: "Check-in deleted" });
  };

  const saveCheckIn = async () => {
    if (!user || !selected) return;
    if (!form.log_types.length) {
      toast({ title: "Log Type required", description: "Pick at least one log type.", variant: "destructive" });
      return;
    }
    const hasFollowUp = form.log_types.includes("follow_up");
    if (hasFollowUp && !form.follow_up_date) {
      toast({ title: "Follow-up date required", description: "Pick a date for the follow-up task.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const logType = form.log_types.join(",");
    const { data, error } = await supabase.rpc("log_field_check_in", {
      p_dealer_id: selected.id,
      p_dealer_name: selected.name,
      p_visit_date: form.visit_date,
      p_log_type: logType,
      p_new_placement: form.new_placement || null,
      p_brand: form.brands.length ? form.brands.join(", ") : null,
      p_notes: form.notes.trim() || null,
      p_source: isCrmInjected(selected) ? (isProspectDealer(selected) ? "crm_prospect" : "crm") : selected.source || "field_only",
      p_street_address: selected.street_address || null,
      p_city: selected.city || null,
      p_state: selected.state || null,
      p_phone: selected.phone || null,
      p_email: selected.email || null,
      p_website: selected.website || null,
      p_rep_id: selected.rep_id || null,
      p_manager_id: selected.manager_id || null,
      p_lat: selected.lat,
      p_lng: selected.lng,
      p_crm_account_id: isCrmInjected(selected) ? selected.id : null,
    });
    if (error) {
      setSaving(false);
      toast({ title: "Failed to save check-in", description: error.message, variant: "destructive" });
      return;
    }
    // Optimistically update so pin color refreshes immediately
    if (data) {
      setCheckIns((prev) => [data as CheckIn, ...prev]);
      notifyCheckInsChanged();
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
    if (hasFollowUp && form.follow_up_date) {
      const taskTitle = form.follow_up_title.trim() || `Follow up with ${selected.name}`;
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
          body: `${taskTitle} - due ${format(parseDateOnly(form.follow_up_date), "MMM d, yyyy")}`,
          link: "/tasks",
          related_id: taskRow?.id ?? null,
        });
        toast({ title: "Follow-up task created", description: `Due ${format(parseDateOnly(form.follow_up_date), "MMM d, yyyy")}` });
      }
    } else {
      toast({ title: "Check-in logged" });
    }

    setSaving(false);
    setForm({
      visit_date: todayEST(),
      log_types: [],
      new_placement: "",
      brands: [],
      notes: "",
      follow_up_date: "",
      follow_up_title: "",
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
    const owner = newDealer.rep_owner || detectedOwner;
    if (!owner) {
      toast({
        title: "Owner required",
        description: "Pick which teammate this dealer belongs to (Will, Mateo, or Chris).",
        variant: "destructive",
      });
      return;
    }
    setAddSaving(true);
    const { data, error } = await supabase
      .from("dealers")
      .insert({
        name,
        first_name: newDealer.first_name.trim() || null,
        last_name: newDealer.last_name.trim() || null,
        street_address: street,
        city,
        state,
        phone: newDealer.phone.trim() || null,
        email: newDealer.email.trim() || null,
        website: newDealer.website.trim() || null,
        notes: newDealer.notes.trim() || null,
        buying_group: newDealer.buying_group || null,
        status: "active",
        source: "field_only",
        rep_owner: owner,
        rep_id: newDealer.rep_id || null,
      })
      .select("id, name, first_name, last_name, street_address, city, state, status, rep_id, rep_owner, manager_id, phone, email, website, notes, buying_group, source, lat, lng")
      .single();
    setAddSaving(false);
    if (error) {
      toast({ title: "Failed to add dealer", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setDealers((prev) => [...prev, data as Dealer]);
    }
    setNewDealer({ first_name: "", last_name: "", name: "", street_address: "", city: "", state: "", phone: "", email: "", website: "", rep_owner: "", rep_id: "", notes: "", buying_group: "" });
    setAddOpen(false);
    const ownerName = TEAM_MEMBERS.find((t) => t.id === owner)?.name ?? owner;
    toast({ title: "Dealer added", description: `${name} added to ${ownerName}'s accounts. Geocoding will run shortly.` });
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {geocoding && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Geocoding...
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
          { c: "#16a34a", l: "-  2 weeks" },
          { c: "#eab308", l: "-  45 days" },
          { c: "#f97316", l: "-  90 days" },
          { c: "#dc2626", l: "> 90 days" },
          { c: "#94a3b8", l: "Never" },
          { c: PROSPECT_COLOR, l: "Prospect" },
        ].map((x) => {
          const active = colorFilter === x.c;
          return (
            <button
              key={x.l}
              type="button"
              onClick={() => setColorFilter(active ? "all" : x.c)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors cursor-pointer ${active ? "bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-accent/50"}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-white shadow"
                style={{ backgroundColor: x.c }}
              />
              {x.l}
            </button>
          );
        })}
        {colorFilter !== "all" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2"
            onClick={() => setColorFilter("all")}
          >
            Clear color
          </Button>
        )}
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

      {/* My Team - filter dealers on the map by team member */}
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
              const count = dealersWithMeta.filter((d) => dealerMatchesTeam(d, m)).length;
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
          <div className="p-6 text-sm text-muted-foreground">Loading map...</div>
        )}
      </Card>

      {/* Recent activity strip */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold">Recent check-ins</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={recentManagerFilter} onValueChange={(v) => setRecentManagerFilter(v as TeamMemberId | "all")}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="All managers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                {TEAM_MEMBERS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {(recentRange.from || recentRange.to || recentManagerFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => { setRecentRange({ from: "", to: "" }); setRecentManagerFilter("all"); }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        {(() => {
          // Filter by selected manager via the dealer's manager_id / rep_owner.
          const team = recentManagerFilter === "all" ? null : TEAM_MEMBERS.find((t) => t.id === recentManagerFilter);
          const dealerById = new Map(dealers.map((d) => [d.id, d]));
          const teamScoped = checkIns.filter((c) => {
            if (!team) return true;
            const d = dealerById.get(c.dealer_id);
            return !!d && dealerMatchesTeam(d, team);
          });
          const filtered = teamScoped.filter((c) => {
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
                    ? `${filtered.length} in range ... ${teamScoped.length} total`
                    : `${teamScoped.length} total`}
                </span>
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {teamScoped.length === 0
                    ? team
                      ? `No check-ins yet for ${team.name}.`
                      : "No check-ins yet. Click any dealer pin to log your first visit."
                    : "No check-ins in the selected date range."}
                </p>
              ) : (
                <ul className="divide-y max-h-[420px] overflow-y-auto pr-1">
                  {filtered.map((c) => {
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
                            <p className="text-xs font-medium" style={{ color: "#B59A72" }}>
                              Logged by: {userNames[c.user_id] ?? (c.user_id === user?.id ? "You" : "Unknown")}
                            </p>
                            {c.notes && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{c.notes}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">
                              {format(parseDateOnly(c.visit_date), "MMM d, yyyy")}
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
                    {(selected.first_name || selected.last_name) && (
                      <div className="px-3 py-2">
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Contact</dt>
                        <dd className="mt-0.5">
                          {[selected.first_name, selected.last_name].filter(Boolean).join(" ")}
                        </dd>
                      </div>
                    )}
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</dt>
                      <dd className="mt-0.5">
                        {selected.phone ? (
                          <a href={`tel:${selected.phone}`} className="text-primary hover:underline">
                            {selected.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground italic">-</span>
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
                          <span className="text-muted-foreground italic">-</span>
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
                          <span className="text-muted-foreground italic">-</span>
                        )}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Account Owner</dt>
                      <dd className="mt-0.5">
                        {(() => {
                          const member = TEAM_MEMBERS.find((m) => dealerMatchesTeam(selected, m));
                          return member ? (
                            <span className="font-medium">{member.name}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          );
                        })()}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Rep</dt>
                      <dd className="mt-0.5">
                        {(() => {
                          const rep = salesReps.find((r) => r.id === selected.rep_id);
                          return rep ? rep.name : <span className="text-muted-foreground italic">-</span>;
                        })()}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Buying Group</dt>
                      <dd className="mt-0.5">
                        {(() => {
                          const bg = selected.buying_group;
                          const map: Record<string, string> = {
                            none: "Nothing",
                            fmg: "FMG",
                            furniture_first: "Furniture First",
                            nationwide: "Nationwide",
                          };
                          return bg ? (map[bg] ?? bg) : <span className="text-muted-foreground italic">-</span>;
                        })()}
                      </dd>
                    </div>
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Address</dt>
                      <dd className="mt-0.5">
                        {(() => {
                          const addr = [selected.street_address, selected.city, selected.state]
                            .filter(Boolean)
                            .join(", ");
                          if (!addr && selected.lat == null) {
                            return <span className="text-muted-foreground italic">-</span>;
                          }
                          const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                            selected.lat != null && selected.lng != null
                              ? `${selected.lat},${selected.lng}`
                              : addr
                          )}`;
                          const linkTarget = window.self === window.top ? "_blank" : "_top";

                          return (
                            <div className="flex items-start justify-between gap-2">
                              <span className="flex-1">{addr || "-"}</span>
                              <a
                                href={mapsUrl}
                                target={linkTarget}
                                rel="noopener noreferrer external"
                                referrerPolicy="no-referrer"
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                                title="Open directions in Google Maps"
                                className="shrink-0 inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium"
                              >
                                <Navigation className="h-3 w-3" />
                                Directions
                              </a>
                            </div>
                          );
                        })()}
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
                    <div className="px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm">
                        {selected.notes || <span className="text-muted-foreground italic">-</span>}
                      </dd>
                    </div>
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
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <span className={form.log_types.length ? "" : "text-muted-foreground"}>
                              {form.log_types.length
                                ? LOG_TYPES.filter((o) => form.log_types.includes(o.value))
                                    .map((o) => o.label)
                                    .join(", ")
                                : "Select log type(s)"}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
                          {LOG_TYPES.map((o) => {
                            const checked = form.log_types.includes(o.value);
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
                                      log_types: v
                                        ? [...prev.log_types, o.value]
                                        : prev.log_types.filter((b) => b !== o.value),
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
                    {form.log_types.includes("follow_up") && (
                      <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
                        <Label htmlFor="follow-up-title" className="text-xs font-medium">
                          Follow-up task
                        </Label>
                        <Input
                          id="follow-up-title"
                          placeholder={selected ? `Follow up with ${selected.name}` : "Task title"}
                          value={form.follow_up_title}
                          onChange={(e) => setForm({ ...form, follow_up_title: e.target.value })}
                        />
                        <Label htmlFor="follow-up-date" className="text-xs font-medium">
                          Due date
                        </Label>
                        <Input
                          id="follow-up-date"
                          type="date"
                          min={todayEST()}
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
                                {format(parseDateOnly(c.visit_date), "MMM d, yyyy")}
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
                  ... {format(parseDateOnly(detailCheckIn.visit_date), "EEEE, MMM d, yyyy")}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-2 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Visit date
                    </Label>
                    <p className="mt-1 font-medium">
                      {format(parseDateOnly(detailCheckIn.visit_date), "MMM d, yyyy")}
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
                        ?? "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      New placement
                    </Label>
                    <p className="mt-1 font-medium">
                      {PLACEMENT_OPTIONS.find((p) => p.value === detailCheckIn.new_placement)?.label
                        ?? detailCheckIn.new_placement
                        ?? "-"}
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
                      : <span className="text-muted-foreground">-</span>}
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
