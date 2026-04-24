// Maps US state codes to territory names as used in the territories table.
// Non-geographic territories (Hospitality, Internet, Root, Vietnam Warehouse,
// individual people like "Chris House", "Justin", "Skip Camillo") are
// intentionally not assigned to any state.

export const STATE_TO_TERRITORY: Record<string, string> = {
  // Single-state territories
  AR: "Arkansas",
  IN: "Indiana",
  MI: "MI",
  // Multi-state territories
  IL: "IL/WI",
  WI: "IL/WI",
  NC: "NC/SC",
  SC: "NC/SC",
  NY: "NY/NJ",
  NJ: "NY/NJ",
  OH: "OH/WPA",
  PA: "OH/WPA", // Western PA — colored as OH/WPA
  TN: "TN/KY",
  KY: "TN/KY",
  TX: "TX/OK",
  OK: "TX/OK",
  VA: "VA/WV",
  WV: "VA/WV",
  // Florida split
  FL: "South Florida", // default; we override panhandle counties via FIPS below if needed
  // North Florida vs South Florida — without county-level data we color the
  // whole state as one. Keep South Florida as the dominant region.
  // Mid Atlantic
  MD: "Mid Atlantic",
  DE: "Mid Atlantic",
  DC: "Mid Atlantic",
  // New England
  ME: "New England",
  NH: "New England",
  VT: "New England",
  MA: "New England",
  RI: "New England",
  CT: "New England",
  // Panhandle / GA / AL
  GA: "Panhandle/GA/AL",
  AL: "Panhandle/GA/AL",
};

// Stable color per territory. HSL so it adapts well in light/dark mode.
const TERRITORY_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#78716c", "#64748b", "#0891b2",
];

export function colorForTerritory(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TERRITORY_PALETTE[hash % TERRITORY_PALETTE.length];
}
