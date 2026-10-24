import type { Catalog, CatalogProduct } from "./api";
import { limits } from "./options";

/** Could the kiosk sell it now? (A suggestion is checked again here because the menu may have changed since it was set.) */
const sellable = (p: CatalogProduct | undefined): p is CatalogProduct =>
  Boolean(p && p.visible && p.pricing !== "MENU" && p.pricing !== "UNPRICED");

/**
 * A suggestion with a size or a required choice cannot be added from a tile: it opens its own sheet.
 * Optional extras alone do not stop it: it is added as it is.
 */
export const needsChoices = (p: CatalogProduct) => p.sizes.length > 0 || p.optionGroups.some((g) => limits(g).min > 0);

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
    if (!sellable(p) || skip.has(id)) continue;
    picked.push(p);
    if (picked.length === MAX_OFFERED) break;
  }
  return picked;
}

/** How many the basket offers at once. */
export const MAX_IN_BASKET = 6;

/**
 * What the basket screen offers: the restaurant's own basket list when it has one; otherwise the lists of the
 * departments already in the basket, taking one from each in turn (in the order they were added) so a single
 * department does not fill the row. Anything already in the basket, or that cannot be sold, is left out.
 */
export function pickBasketSuggestions(
  catalog: Pick<Catalog, "products" | "suggestions" | "basketSuggestions">,
  inCart: string[],
): CatalogProduct[] {
  const skip = new Set(inCart);
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const offer = (ids: string[]) => {
    const picked: CatalogProduct[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (!sellable(p) || skip.has(id) || picked.includes(p)) continue;
      picked.push(p);
      if (picked.length === MAX_IN_BASKET) break;
    }
    return picked;
  };

  const own = catalog.basketSuggestions ?? [];
  if (own.length > 0) return offer(own);

  const departments = [...new Set(inCart.map((id) => byId.get(id)?.categoryId).filter((d): d is string => Boolean(d)))];
  const lists = departments.map((d) => catalog.suggestions[d] ?? []);
  const turns: string[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) turns.push(l[i]!);
  return offer(turns);
}
