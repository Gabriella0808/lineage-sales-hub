import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type CartItem = {
  sku: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  base_price: number | null;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  updateQty: (sku: string, qty: number) => void;
  removeItem: (sku: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "lineage-cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: items.reduce((n, i) => n + (i.base_price ?? 0) * i.quantity, 0),
    addItem: (item, qty = 1) => {
      setItems((prev) => {
        const existing = prev.find((p) => p.sku === item.sku);
        if (existing) {
          return prev.map((p) => p.sku === item.sku ? { ...p, quantity: p.quantity + qty } : p);
        }
        return [...prev, { ...item, quantity: qty }];
      });
    },
    updateQty: (sku, qty) => {
      setItems((prev) => prev.map((p) => p.sku === sku ? { ...p, quantity: Math.max(1, qty) } : p));
    },
    removeItem: (sku) => setItems((prev) => prev.filter((p) => p.sku !== sku)),
    clear: () => setItems([]),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
