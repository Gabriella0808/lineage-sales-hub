export type InventoryStatus =
  | "out-of-stock"
  | "critical"
  | "reorder-soon"
  | "stockout-risk"
  | "fast-moving"
  | "overstock"
  | "liquidate"
  | "healthy";

export interface InventoryItem {
  sku: string;
  product: string;
  collection: string;
  supplier: string;
  onHand: number;
  available: number;
  avgMonthlySales: number;
  monthsSupply: number | null;
  status: InventoryStatus;
  link?: string;
  unitCost?: number;
  listPrice?: number;
  isCloseout?: boolean;
  isDiscontinued?: boolean;
  factory?: string;
  moq?: number;
  leadTimeDays?: number;
  forecastMonthly?: number;
}

// Dummy SKUs — modeled on Acctivate-style codes. Replace with real feed once cleaned.
export const inventoryItems: InventoryItem[] = [
  { sku: "LUX-DIN-2204", product: "Marbella Dining Table", collection: "Lux 26", supplier: "Vietnam Atelier", onHand: 0, available: 0, avgMonthlySales: 6, monthsSupply: 0, status: "out-of-stock" },
  { sku: "SW-SOFA-118", product: "Coastline 3-Seat Sofa", collection: "SW 26", supplier: "Pacific Mill", onHand: 2, available: 1, avgMonthlySales: 8, monthsSupply: 0.25, status: "critical" },
  { sku: "FL-OCC-441", product: "Palmetto Accent Chair", collection: "FL 26", supplier: "Gulf Coast Co.", onHand: 4, available: 3, avgMonthlySales: 5, monthsSupply: 0.8, status: "critical" },
  { sku: "LUX-BED-3010", product: "Estoril King Bed", collection: "Lux 26", supplier: "Vietnam Atelier", onHand: 9, available: 7, avgMonthlySales: 4, monthsSupply: 2.25, status: "reorder-soon" },
  { sku: "SW-CST-562", product: "Driftwood Coffee Table", collection: "SW 26", supplier: "Pacific Mill", onHand: 12, available: 10, avgMonthlySales: 6, monthsSupply: 2.0, status: "reorder-soon" },
  { sku: "FL-DIN-887", product: "Sanibel Side Chair", collection: "FL 26", supplier: "Gulf Coast Co.", onHand: 24, available: 22, avgMonthlySales: 14, monthsSupply: 1.7, status: "stockout-risk" },
  { sku: "LUX-OCC-1190", product: "Cascais Lounge Chair", collection: "Lux 26", supplier: "Vietnam Atelier", onHand: 38, available: 36, avgMonthlySales: 12, monthsSupply: 3.2, status: "fast-moving" },
  { sku: "SW-BED-7720", product: "Harbor Queen Bed", collection: "SW 26", supplier: "Pacific Mill", onHand: 45, available: 43, avgMonthlySales: 9, monthsSupply: 5.0, status: "fast-moving" },
  { sku: "CORE-DSK-009", product: "Heritage Writing Desk", collection: "Core", supplier: "Carolina Works", onHand: 110, available: 108, avgMonthlySales: 7, monthsSupply: 15.7, status: "overstock" },
  { sku: "DISC-OCC-301", product: "Aspen Wing Chair (D/C)", collection: "Discontinued", supplier: "Carolina Works", onHand: 62, available: 62, avgMonthlySales: 2, monthsSupply: 31.0, status: "liquidate" },
  { sku: "DISC-DIN-422", product: "Old World Buffet (D/C)", collection: "Discontinued", supplier: "Vietnam Atelier", onHand: 18, available: 18, avgMonthlySales: 1, monthsSupply: 18.0, status: "liquidate" },
  { sku: "FL-CST-661", product: "Mangrove Console", collection: "FL 26", supplier: "Gulf Coast Co.", onHand: 31, available: 28, avgMonthlySales: 6, monthsSupply: 5.2, status: "healthy" },
];
