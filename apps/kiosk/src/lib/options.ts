import type { CartLine } from "@/state/cart";
import type { CatalogOptionGroup, OptionKind } from "./api";

/** The order unTill's kinds are listed in, on the sheet and in the cart. */
export const KIND_ORDER: OptionKind[] = ["MUST_HAVE", "FREE_OPTION", "SUPPLEMENT", "CONDIMENT"];

/** Supplements and condiments are extras: shown folded away until the customer opens them. */
export const isExtra = (g: Pick<CatalogOptionGroup, "kind">) => g.kind === "SUPPLEMENT" || g.kind === "CONDIMENT";

/**
 * How many a customer must and may pick from a group.
 *  - a group that says "exactly N" (composed options) is exactly N, whatever its kind;
 *  - a must-have group needs one choice;
 *  - a free option is one choice or none;
 *  - supplements and condiments are optional and any number may be chosen.
 */
export function limits(g: Pick<CatalogOptionGroup, "kind" | "requiredChoices">): { min: number; max: number } {
  if ((g.kind === "MUST_HAVE" || g.kind === "FREE_OPTION") && g.requiredChoices !== null) {
    return { min: g.requiredChoices, max: g.requiredChoices };
  }
  switch (g.kind) {
    case "MUST_HAVE": return { min: 1, max: 1 };
    case "FREE_OPTION": return { min: 0, max: 1 };
    default: return { min: 0, max: Number.POSITIVE_INFINITY };
  }
}

/** The choices in a group after the customer taps one. A choice is made once: tapping it again undoes it. */
export function toggled(g: Pick<CatalogOptionGroup, "kind" | "requiredChoices">, current: string[], articleId: string): string[] {
  const { min, max } = limits(g);
  if (current.includes(articleId)) {
    // A required single choice is replaced by another, never cleared.
    return min > 0 && max === 1 ? current : current.filter((x) => x !== articleId);
  }
  if (max === 1) return [articleId];
  return current.length >= max ? current : [...current, articleId];
}

/** Has the customer made enough choices in this group? */
export function isComplete(g: Pick<CatalogOptionGroup, "kind" | "requiredChoices">, picked: string[]): boolean {
  const { min, max } = limits(g);
  return picked.length >= min && picked.length <= max;
}

/** A required group with a single choice is pre-chosen, so it can never block the Add button. */
export function preselected(groups: CatalogOptionGroup[]): Record<string, string[]> {
  return Object.fromEntries(
    groups.filter((g) => limits(g).min > 0 && g.items.length === 1).map((g) => [g.id, [g.items[0]!.articleId]]),
  );
}

/**
 * The choices an existing cart line holds, for reopening it. A choice or group that has left the menu
 * since is dropped; groups the line never had are left out so their defaults still apply.
 */
export function previouslyPicked(groups: CatalogOptionGroup[], line: Pick<CartLine, "options">): Record<string, string[]> {
  const picked: Record<string, string[]> = {};
  for (const g of groups) {
    const ids = line.options
      .filter((o) => o.optionGroupId === g.id && g.items.some((i) => i.articleId === o.articleId))
      .map((o) => o.articleId);
    if (ids.length > 0) picked[g.id] = ids;
  }
  return picked;
}
