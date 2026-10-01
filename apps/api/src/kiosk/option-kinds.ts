/**
 * The kinds of option unTill knows, and where each comes from in its data. One place decides
 * which groups an article may offer, so the catalog (what the kiosk shows) and the pricing
 * (what the server accepts) can never disagree.
 *
 *   MUST_HAVE    the article's own option groups                   (OrderItemType 1)
 *   FREE_OPTION  the article's free-option group                    (OrderItemType 2)
 *   SUPPLEMENT   the department's supplement group, for every article in it (OrderItemType 3)
 *   CONDIMENT    the department's condiment group, likewise         (OrderItemType 4)
 *
 * A menu's components (OrderItemType 5) are chosen inside a menu article and are not offered yet:
 * menus have no prices in unTill.
 */
export type OptionKind = "MUST_HAVE" | "FREE_OPTION" | "SUPPLEMENT" | "CONDIMENT";

export interface ArticleOptionLink {
  optionGroupId: bigint;
  requiredChoices: number | null;
  isFreeOption: boolean;
}

export interface DepartmentOptions {
  supplementOptionId: bigint | null;
  condimentOptionId: bigint | null;
}

export interface AllowedGroup {
  groupId: bigint;
  kind: OptionKind;
  /** "Choose exactly this many". Only an article's own groups can ask for it. */
  requiredChoices: number | null;
}

const RANK: Record<OptionKind, number> = { MUST_HAVE: 0, FREE_OPTION: 1, SUPPLEMENT: 2, CONDIMENT: 3 };

/** The groups an article may offer, must-have first, then free, supplements, condiments. */
export function allowedGroups(links: ArticleOptionLink[], department?: DepartmentOptions | null): AllowedGroup[] {
  const groups: AllowedGroup[] = links.map((l) => ({
    groupId: l.optionGroupId,
    kind: l.isFreeOption ? "FREE_OPTION" : "MUST_HAVE",
    requiredChoices: l.requiredChoices,
  }));
  const taken = new Set(groups.map((g) => g.groupId));
  const fromDepartment: [bigint | null | undefined, OptionKind][] = [
    [department?.supplementOptionId, "SUPPLEMENT"],
    [department?.condimentOptionId, "CONDIMENT"],
  ];
  for (const [groupId, kind] of fromDepartment) {
    // A group the article already uses itself keeps its own meaning.
    if (groupId === null || groupId === undefined || taken.has(groupId)) continue;
    groups.push({ groupId, kind, requiredChoices: null });
    taken.add(groupId);
  }
  // Array.sort is stable: groups of one kind keep the order unTill gave them.
  return groups.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}
