import type { Catalog, CatalogProduct } from "./api";

/** How many are offered at once. */
export const MAX_OFFERED = 4;

/**
 * What to offer after a customer adds something from `departmentId`: that department's own list, in the
 * order the restaurant set, up to four, leaving out anything already in the order and anything that
 * cannot be sold (a suggestion is checked again here because the menu may have changed since it was set).
 */
export function pickSuggestions(
  catalog: Pick<Catalog, "products" | "suggestions">,
  departmentId: string | null,
  inCart: Iterable<string>,
): CatalogProduct[] {
  if (!departmentId) return [];
  const skip = new Set(inCart);
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const picked: CatalogProduct[] = [];
  for (const id of catalog.suggestions[departmentId] ?? []) {
    const p = byId.get(id);
    if (!p || skip.has(id) || !p.visible || p.pricing === "MENU" || p.pricing === "UNPRICED") continue;
    picked.push(p);
    if (picked.length === MAX_OFFERED) break;
  }
  return picked;
}
