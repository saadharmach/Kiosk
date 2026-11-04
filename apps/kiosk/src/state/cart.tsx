"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { OptionKind } from "@/lib/api";

export interface CartOption {
  optionGroupId: string;
  articleId: string;
  name: string;
  price: number;
  /** Which of unTill's option kinds it is, so the cart can name it. */
  kind: OptionKind;
}

export interface CartLine {
  key: string;
  articleId: string;
  name: string;
  /** Display only: thumbnail shown in the cart. */
  imageUrl?: string | null;
  quantity: number;
  sizeItemId?: string;
  sizeName?: string;
  options: CartOption[];
  /** Display only. The server recomputes every price and is the authority. */
  unitPrice: number;
}

interface CartApi {
  lines: CartLine[];
  count: number;
  total: number;
  add: (line: Omit<CartLine, "key" | "quantity">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  /** Saves an edited line in place of the line `oldKey`. */
  replace: (oldKey: string, line: Omit<CartLine, "key" | "quantity">, qty: number) => void;
  clear: () => void;
}

const Ctx = createContext<CartApi | null>(null);

/** Identical configurations merge into one line instead of stacking. */
const keyOf = (l: Omit<CartLine, "key" | "quantity">) =>
  [
    l.articleId,
    l.sizeItemId ?? "",
    ...l.options.map((o) => `${o.optionGroupId}:${o.articleId}`).sort(),
  ].join("|");

/**
 * Puts an edited line where the old one was. If the edit makes it identical to another line, the
 * two merge (quantities add) rather than showing the same dish twice.
 */
export function replaceLine(
  lines: CartLine[], oldKey: string, line: Omit<CartLine, "key" | "quantity">, qty: number,
): CartLine[] {
  const key = keyOf(line);
  const twin = lines.find((l) => l.key === key && l.key !== oldKey);
  const merged = twin ? twin.quantity + qty : qty;
  return lines
    .filter((l) => !(twin && l.key === oldKey))
    .map((l) => (l.key === oldKey || (twin && l.key === key) ? { ...line, key, quantity: merged } : l));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const api = useMemo<CartApi>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      total: lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0),
      add: (line, qty = 1) => {
        const key = keyOf(line);
        setLines((prev) => {
          const found = prev.find((l) => l.key === key);
          if (found) {
            return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + qty } : l));
          }
          return [...prev, { ...line, key, quantity: qty }];
        });
      },
      setQty: (key, qty) =>
        setLines((prev) =>
          qty <= 0
            ? prev.filter((l) => l.key !== key)
            : prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
        ),
      remove: (key) => setLines((prev) => prev.filter((l) => l.key !== key)),
      replace: (oldKey, line, qty) => setLines((prev) => replaceLine(prev, oldKey, line, qty)),
      clear: () => setLines([]),
    }),
    [lines],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}