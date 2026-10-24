import type { CatalogOptionGroup } from "./api";
import { KIND_ORDER, limits } from "./options";

/**
 * The order the sheet asks a product's option groups in: every group that needs a choice first, in the till's own
 * order, then the optional ones (free options, then supplements, then condiments).
 */
export function orderedSteps<G extends Pick<CatalogOptionGroup, "kind" | "requiredChoices">>(groups: G[]): G[] {
  const required = groups.filter((g) => limits(g).min > 0);
  const kindRank = (g: G) => {
    const i = KIND_ORDER.indexOf(g.kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  // sort is stable, so groups of the same kind keep the till's order.
  const optional = groups.filter((g) => limits(g).min === 0).sort((a, b) => kindRank(a) - kindRank(b));
  return [...required, ...optional];
}
