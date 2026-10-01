import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../common/storage.service.js";
import { pickLocalized, readLocalizedMap, resolveLocale } from "../common/locale.js";
import { allowedGroups } from "./option-kinds.js";
import { readTableRanges } from "../common/table-ranges.js";

const dec = (v: { toNumber(): number } | null | undefined): number | null =>
  v === null || v === undefined ? null : v.toNumber();
const pick = pickLocalized;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Branding, settings and the zones a customer can choose from. */
  async bootstrap(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      include: { settings: true, tpapi: { select: { isEnabled: true, lastSuccessAt: true, lastSyncAt: true } } },
    });
    if (!restaurant || restaurant.status !== "ACTIVE") throw new NotFoundException("Restaurant not available");

    const salesAreas = await this.prisma.tpapiSalesArea.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { number: "asc" },
      select: { untillId: true, name: true, tableRanges: true, priceLevelId: true },
    });

    const mappings = await this.prisma.orderTypeMapping.findMany({
      where: { restaurantId: restaurant.id, isEnabled: true },
    });

    const typeEnabled: Record<string, boolean> = {
      EAT_IN: restaurant.settings?.eatInEnabled ?? true,
      TAKE_AWAY: restaurant.settings?.takeAwayEnabled ?? false,
      DELIVERY: restaurant.settings?.deliveryEnabled ?? false,
    };

    // The kiosk needs the resolved sales area per order type so it can reject a
    // bad table number the moment it is typed, instead of at checkout. The server
    // still re-validates everything at order time: this is speed, not trust.
    const orderTypes = (["EAT_IN", "TAKE_AWAY", "DELIVERY"] as const)
      .filter((t) => typeEnabled[t])
      .map((t) => {
        const mapping = mappings.find((m) => m.orderType === t);
        const area = mapping
          ? salesAreas.find((a) => a.untillId === mapping.salesAreaId)
          : undefined;
        const askTable = t === "EAT_IN" ? (restaurant.settings?.askTableForEatIn ?? true) : false;
        // Mirrors OrdersService.resolveTable: an order type that cannot be given a table
        // would let a customer fill a cart and then fail at checkout, so it is not offered.
        const hasTableSource = askTable
          ? readTableRanges(area?.tableRanges).length > 0
          : Boolean(mapping?.fixedTableNumber || mapping?.tableRangeFrom);
        return {
          orderType: t,
          configured: Boolean(mapping && area && hasTableSource),
          salesAreaId: area ? String(area.untillId) : null,
          salesAreaName: area?.name ?? null,
          askTable,
          tableRanges: t === "EAT_IN" ? (area?.tableRanges ?? []) : [],
          fixedTableNumber: mapping?.fixedTableNumber ?? null,
        };
      });

    return {
      restaurant: {
        slug: restaurant.slug,
        name: restaurant.name,
        currency: restaurant.currency,
        locale: restaurant.locale,
        logoPath: restaurant.logoPath,
        logoUrl: this.storage.publicUrl(restaurant.logoPath),
        heroImageUrl: this.storage.publicUrl(restaurant.heroImagePath),
        tagline: readLocalizedMap(restaurant.tagline),
        primaryColor: restaurant.primaryColor,
      },
      ordering: {
        eatIn: restaurant.settings?.eatInEnabled ?? true,
        takeAway: restaurant.settings?.takeAwayEnabled ?? false,
        delivery: restaurant.settings?.deliveryEnabled ?? false,
        askTableForEatIn: restaurant.settings?.askTableForEatIn ?? true,
        idleTimeoutSec: restaurant.settings?.kioskIdleTimeoutSec ?? 90,
        resetDelaySec: restaurant.settings?.kioskResetDelaySec ?? 15,
        showAllergens: restaurant.settings?.showAllergens ?? false,
        showProductImages: restaurant.settings?.showProductImages ?? true,
      },
      salesAreas,
      orderTypes,
      pos: {
        connected: Boolean(restaurant.tpapi?.isEnabled),
        lastSuccessAt: restaurant.tpapi?.lastSuccessAt ?? null,
        lastSyncAt: restaurant.tpapi?.lastSyncAt ?? null,
      },
      catalogReady: Boolean(restaurant.tpapi?.lastSyncAt),
    };
  }

  /**
   * The full menu for one sales area, priced at that area's price level,
   * with the local presentation layer merged on top.
   */
  async catalog(slug: string, salesAreaIdParam?: string, localeParam?: string) {
    // Sales area ids are unTill numbers; reject anything else before BigInt() throws a 500.
    if (salesAreaIdParam && !/^\d{1,20}$/.test(salesAreaIdParam)) {
      throw new BadRequestException("salesAreaId must be a number");
    }
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        currency: true,
        status: true,
        locale: true,
        settings: { select: { showAllergens: true } },
      },
    });
    if (!restaurant || restaurant.status !== "ACTIVE") throw new NotFoundException("Restaurant not available");
    const restaurantId = restaurant.id;
    const showAllergens = restaurant.settings?.showAllergens ?? false;
        // The server resolves the language. The browser never receives three of everything.
    const locale = resolveLocale(localeParam, restaurant.locale);
    const salesArea = salesAreaIdParam
      ? await this.prisma.tpapiSalesArea.findFirst({
          where: { restaurantId, untillId: BigInt(salesAreaIdParam) },
        })
      : await this.prisma.tpapiSalesArea.findFirst({ where: { restaurantId }, orderBy: { number: "asc" } });
    if (!salesArea) throw new NotFoundException("Sales area not found — has the catalog been synchronised?");

    const areaId = salesArea.untillId;
    const priceLevelId = salesArea.priceLevelId ?? 0n;

    const [groups, departments, articles, prices, sizePrices, sizeItems, artOptions, optGroups, optItems, prodPres, catPres, allergenLinks, allergenRows] =
      await Promise.all([
        this.prisma.tpapiGroup.findMany({ where: { restaurantId } }),
        this.prisma.tpapiDepartment.findMany({
          where: { restaurantId, availableSalesAreaIds: { has: areaId } },
          orderBy: { number: "asc" },
        }),
        this.prisma.tpapiArticle.findMany({
          where: { restaurantId, isActive: true, isPresent: true, availableSalesAreaIds: { has: areaId } },
          orderBy: { number: "asc" },
        }),
        this.prisma.tpapiArticlePrice.findMany({ where: { restaurantId, priceLevelId } }),
        this.prisma.tpapiArticleSizePrice.findMany({ where: { restaurantId, priceLevelId } }),
        this.prisma.tpapiSizeModifierItem.findMany({ where: { restaurantId, isActive: true } }),
        this.prisma.tpapiArticleOption.findMany({ where: { restaurantId } }),
        this.prisma.tpapiOptionGroup.findMany({
          where: { restaurantId, availableSalesAreaIds: { has: areaId } },
        }),
        this.prisma.tpapiOptionItem.findMany({ where: { restaurantId, priceLevelId } }),
        this.prisma.productPresentation.findMany({ where: { restaurantId } }),
        this.prisma.categoryPresentation.findMany({ where: { restaurantId } }),
        // Nothing leaves the database when the switch is off.
        showAllergens
          ? this.prisma.productAllergen.findMany({ where: { restaurantId } })
          : Promise.resolve([]),
        // Deliberately not filtered on isActive: an allergen already linked to a
        // product must stay visible to the customer even if unTill later retires it.
        showAllergens
          ? this.prisma.tpapiAllergen.findMany({
              where: { restaurantId },
              orderBy: { number: "asc" },
              select: { untillId: true, number: true, name: true },
            })
          : Promise.resolve([]),
      ]);

    // ---- indexes
    const priceOf = new Map(prices.map((p) => [p.articleId.toString(), p]));
    const sizesOf = new Map<string, typeof sizePrices>();
    for (const s of sizePrices) {
      const k = s.articleId.toString();
      sizesOf.set(k, [...(sizesOf.get(k) ?? []), s]);
    }
    const sizeItemName = new Map(sizeItems.map((i) => [i.untillId.toString(), i.name]));
    const articleName = new Map(articles.map((a) => [a.untillId.toString(), a.name]));
    const presOf = new Map(prodPres.map((p) => [p.articleId.toString(), p]));
    const catPresOf = new Map(catPres.map((c) => [`${c.scope}:${c.untillId.toString()}`, c]));
    const groupName = new Map(groups.map((g) => [g.untillId.toString(), g.name]));
    const allergenById = new Map(allergenRows.map((a) => [a.untillId.toString(), a]));
    const allergenIdsOf = new Map<string, string[]>();
    for (const l of allergenLinks) {
      const k = l.articleId.toString();
      allergenIdsOf.set(k, [...(allergenIdsOf.get(k) ?? []), l.allergenId.toString()]);
    }
    const optGroupById = new Map(optGroups.map((g) => [g.untillId.toString(), g]));
    const departmentById = new Map(departments.map((d) => [d.untillId.toString(), d]));

    const itemsOfGroup = new Map<string, typeof optItems>();
    for (const i of optItems) {
      const k = i.optionGroupId.toString();
      itemsOfGroup.set(k, [...(itemsOfGroup.get(k) ?? []), i]);
    }
    const optionsOfArticle = new Map<string, typeof artOptions>();
    for (const o of artOptions) {
      const k = o.articleId.toString();
      optionsOfArticle.set(k, [...(optionsOfArticle.get(k) ?? []), o]);
    }

    // ---- categories = departments, with their group as the parent tab
    const categories = departments
      .map((d) => {
        const pres = catPresOf.get(`DEPARTMENT:${d.untillId.toString()}`);
        return {
          id: d.untillId.toString(),
          groupId: d.groupId?.toString() ?? null,
          groupName: d.groupId ? groupName.get(d.groupId.toString()) ?? null : null,
          name: pick(pres?.displayName, locale, d.name) ?? d.name,
          description: pick(pres?.description, locale, null),
          imagePath: pres?.imagePath ?? null,
          imageUrl: this.storage.publicUrl(pres?.imagePath ?? null),
          sortOrder: pres?.sortOrder ?? d.number,
          visible: pres?.isVisible ?? true,
        };
      })
      .filter((c) => c.visible)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    // ---- option groups: each one's name and choices, built once and shared by every product that uses it
    const groupDefs = new Map<string, { name: string; items: { articleId: string; name: string; price: number }[] } | null>();
    const groupDef = (id: string) => {
      if (!groupDefs.has(id)) {
        const g = optGroupById.get(id);
        const items = g
          ? (itemsOfGroup.get(id) ?? []).map((i) => ({
              articleId: i.articleId.toString(),
              name: articleName.get(i.articleId.toString()) ?? i.articleId.toString(),
              price: dec(i.amount) ?? 0,
            }))
          : [];
        groupDefs.set(id, g && items.length > 0 ? { name: g.name, items } : null);   // skip empty groups
      }
      return groupDefs.get(id) ?? null;
    };

    // ---- products
    const products = articles
      .map((a) => {
        const key = a.untillId.toString();
        const pres = presOf.get(key);
        const price = priceOf.get(key);
        const sizes = (sizesOf.get(key) ?? []).map((s) => ({
          sizeItemId: s.sizeItemId.toString(),
          name: sizeItemName.get(s.sizeItemId.toString()) ?? s.sizeItemId.toString(),
          price: dec(s.amount) ?? 0,
        })).sort((x, y) => x.price - y.price);

        // The article's own groups, plus its department's supplement and condiment groups. A group is
        // sent once for the whole catalog (groupDefs); a product only says which ones it uses.
        const department = a.departmentId ? departmentById.get(a.departmentId.toString()) : undefined;
        const optionGroups = allowedGroups(optionsOfArticle.get(key) ?? [], department)
          .map((allowed) => {
            const def = groupDef(allowed.groupId.toString());
            if (!def) return null;
            return { id: allowed.groupId.toString(), kind: allowed.kind, requiredChoices: allowed.requiredChoices, items: def.items };
          })
          .filter((g): g is NonNullable<typeof g> => g !== null);

        /** Three pricing shapes, as proven by the data. */
        // A base price of zero is only sellable when a paid option makes the line cost
        // something: the order path refuses a zero-priced line, so such a product
        // would be a tile that always fails at checkout.
        // Only a group the customer must choose from, and only if every choice costs something, counts:
        // an optional supplement can be skipped, which would leave a zero-priced line.
        const paidByOptions = optionGroups.some((g) => g.kind === "MUST_HAVE" && g.items.every((i) => i.price > 0));
        const pricing =
          a.isMenu && !price ? "MENU"
          : a.sizeModifierId && sizes.length > 0 ? "SIZE"
          : price && ((dec(price.amount) ?? 0) > 0 || paidByOptions) ? "BASE"
          : "UNPRICED";

        return {
          id: key,
          categoryId: a.departmentId?.toString() ?? null,
          name: pick(pres?.displayName, locale, a.name) ?? a.name,
          posName: a.name,
          description: pick(pres?.description, locale, null),
          imagePath: pres?.imagePath ?? null,
          imageUrl: this.storage.publicUrl(pres?.imagePath ?? null),
          badgeText: pres?.badgeText ?? null,
          isFeatured: pres?.isFeatured ?? false,
          sortOrder: pres?.sortOrder ?? a.number,
          visible: pres?.isVisible ?? true,
          pricing,
          price: pricing === "BASE" ? dec(price!.amount) : null,
          vat: price ? dec(price.vat) : null,
          sizes,
          optionGroups: optionGroups.map(({ id, kind, requiredChoices }) => ({ id, kind, requiredChoices })),
          isMenu: a.isMenu,
          promo: a.promo,
          allergens: (allergenIdsOf.get(key) ?? [])
            .map((id) => allergenById.get(id))
            .filter((x): x is NonNullable<typeof x> => x !== undefined)
            .sort((x, y) => x.number - y.number)
            .map((x) => ({ id: x.untillId.toString(), number: x.number, name: x.name })),
        };
      })
      .filter((p) => p.visible && p.pricing !== "UNPRICED" && p.categoryId !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const usedCategories = new Set(products.map((p) => p.categoryId));
    const shownCategories = categories.filter((c) => usedCategories.has(c.id));
    // A hidden department takes its products with it, so none are sent that nobody can reach.
    const shownProducts = products.filter((p) => shownCategories.some((c) => c.id === p.categoryId));

    // Only the groups some shown product actually uses.
    const usedGroups: Record<string, { name: string; items: { articleId: string; name: string; price: number }[] }> = {};
    for (const p of shownProducts) {
      for (const g of p.optionGroups) {
        const def = groupDef(g.id);
        if (def) usedGroups[g.id] = def;
      }
    }

    return {
      currency: restaurant.currency,
      salesArea: { id: areaId.toString(), name: salesArea.name, priceLevelId: priceLevelId.toString() },
      categories: shownCategories,
      products: shownProducts,
      groupDefs: usedGroups,
      counts: { categories: shownCategories.length, products: shownProducts.length },
    };
  }
}