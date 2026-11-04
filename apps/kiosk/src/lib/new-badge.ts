import type { CatalogProduct } from "./api";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Does the product still carry the "New" ribbon today? The server already leaves it off past the last day, but a
 * kiosk can keep a menu loaded overnight, so the day is checked again here, by the borne's own clock (it stands in
 * the restaurant).
 */
export function isNewToday(p: Pick<CatalogProduct, "isNew" | "newUntil">, now = new Date()): boolean {
  if (!p.isNew) return false;
  if (!p.newUntil) return true;
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` <= p.newUntil;
}
