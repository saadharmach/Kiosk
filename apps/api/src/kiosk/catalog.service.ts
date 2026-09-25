import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const dec = (v: { toNumber(): number } | null | undefined): number | null =>
  v === null || v === undefined ? null : v.toNumber();

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      restaurant: {
        slug: restaurant.slug,
        name: restaurant.name,
        currency: restaurant.currency,
        locale: restaurant.locale,
        logoPath: restaurant.logoPath,
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
  async catalog(slug: string, salesAreaIdParam?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, currency: true, status: true },
    });
    if (!restaurant || restaurant.status !== "ACTIVE") throw new NotFoundException("Restaurant not available");
    const restaurantId = restaurant.id;

    const salesArea = salesAreaIdParam
      ? await this.prisma.tpapiSalesArea.findFirst({
          where: { restaurantId, untillId: BigInt(salesAreaIdParam) },
        })
      : await this.prisma.tpapiSalesArea.findFirst({ where: { restaurantId }, orderBy: { number: "asc" } });
    if (!salesArea) throw new NotFoundException("Sales area not found — has the catalog been synchronised?");

    const areaId = salesArea.untillId;
    const priceLevelId = salesArea.priceLevelId ?? 0n;

    const [groups, departments, articles, prices, sizePrices, sizeItems, artOptions, optGroups, optItems, prodPres, catPres] =
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
    const optGroupById = new Map(optGroups.map((g) => [g.untillId.toString(), g]));

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
          name: pres?.displayName ?? d.name,
          description: pres?.description ?? null,
          imagePath: pres?.imagePath ?? null,
          sortOrder: pres?.sortOrder ?? d.number,
          visible: pres?.isVisible ?? true,
        };
      })
      .filter((c) => c.visible)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

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

        const optionGroups = (optionsOfArticle.get(key) ?? [])
          .map((link) => {
            const g = optGroupById.get(link.optionGroupId.toString());
            if (!g) return null;
            const items = (itemsOfGroup.get(link.optionGroupId.toString()) ?? []).map((i) => ({
              articleId: i.articleId.toString(),
              name: articleName.get(i.articleId.toString()) ?? i.articleId.toString(),
              price: dec(i.amount) ?? 0,
            }));
            if (items.length === 0) return null;   // skip empty groups
            return {
              id: g.untillId.toString(),
              name: g.name,
              requiredChoices: link.requiredChoices,
              isFree: link.isFreeOption,
              items,
            };
          })
          .filter((g): g is NonNullable<typeof g> => g !== null);

        /** Three pricing shapes, as proven by the data. */
        const pricing =
          a.isMenu && !price ? "MENU"
          : a.sizeModifierId && sizes.length > 0 ? "SIZE"
          : price ? "BASE"
          : "UNPRICED";

        return {
          id: key,
          categoryId: a.departmentId?.toString() ?? null,
          name: pres?.displayName ?? a.name,
          posName: a.name,
          description: pres?.description ?? null,
          imagePath: pres?.imagePath ?? null,
          badgeText: pres?.badgeText ?? null,
          isFeatured: pres?.isFeatured ?? false,
          sortOrder: pres?.sortOrder ?? a.number,
          visible: pres?.isVisible ?? true,
          pricing,
          price: pricing === "BASE" ? dec(price!.amount) : null,
          vat: price ? dec(price.vat) : null,
          sizes,
          optionGroups,
          isMenu: a.isMenu,
          promo: a.promo,
        };
      })
      .filter((p) => p.visible && p.pricing !== "UNPRICED" && p.categoryId !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const usedCategories = new Set(products.map((p) => p.categoryId));

    return {
      currency: restaurant.currency,
      salesArea: { id: areaId.toString(), name: salesArea.name, priceLevelId: priceLevelId.toString() },
      categories: categories.filter((c) => usedCategories.has(c.id)),
      products,
      counts: { categories: categories.length, products: products.length },
    };
  }
}