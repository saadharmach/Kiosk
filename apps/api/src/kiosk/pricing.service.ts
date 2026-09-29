import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CartLineDto, PriceCartDto } from "./dto/cart.dto.js";

const dec = (v: { toNumber(): number }): number => v.toNumber();
const round2 = (n: number): number => Math.round(n * 100) / 100;
/**
 * Presentation names are { fr, en, ar } JSON; the order record stores one
 * string. Stopgap until the kiosk sends its locale with the order — then this
 * resolves in the language the customer actually saw.
 */
const textOf = (v: unknown, fallback: string): string => {
  if (typeof v === "string") return v || fallback;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const m = v as Record<string, unknown>;
    for (const l of ["fr", "en", "ar"]) {
      const s = m[l];
      if (typeof s === "string" && s.trim()) return s;
    }
  }
  return fallback;
};

export type PricedModifier = {
  kind: "SIZE" | "OPTION";
  articleId: string | null;
  optionGroupId: string | null;
  sizeItemId: string | null;
  name: string;
  unitPrice: number;
};

export type PricedLine = {
  articleId: string;
  name: string;
  displayName: string;
  quantity: number;
  basePrice: number;
  modifiers: PricedModifier[];
  unitPrice: number;
  lineTotal: number;
  vatRate: number | null;
  isMenu: boolean;
  note?: string;
};

export type PricedCart = {
  currency: string;
  salesAreaId: string;
  priceLevelId: string;
  lines: PricedLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  itemCount: number;
};

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prices a cart against the mirror tables. Throws on anything inconsistent. */
  async price(restaurantId: string, currency: string, dto: PriceCartDto): Promise<PricedCart> {
    if (!dto.lines.length) throw new BadRequestException("Cart is empty");

    const salesArea = dto.salesAreaId
      ? await this.prisma.tpapiSalesArea.findFirst({
          where: { restaurantId, untillId: BigInt(dto.salesAreaId) },
        })
      : await this.prisma.tpapiSalesArea.findFirst({ where: { restaurantId }, orderBy: { number: "asc" } });
    if (!salesArea) throw new NotFoundException("Sales area not found");

    const areaId = salesArea.untillId;
    const priceLevelId = salesArea.priceLevelId ?? 0n;
    const wanted = [...new Set(dto.lines.map((l) => BigInt(l.articleId)))];

    const [articles, prices, sizePrices, sizeItems, links, optItems, optGroups, presentations] =
      await Promise.all([
        this.prisma.tpapiArticle.findMany({
          where: { restaurantId, untillId: { in: wanted }, isActive: true, isPresent: true },
        }),
        this.prisma.tpapiArticlePrice.findMany({
          where: { restaurantId, priceLevelId, articleId: { in: wanted } },
        }),
        this.prisma.tpapiArticleSizePrice.findMany({
          where: { restaurantId, priceLevelId, articleId: { in: wanted } },
        }),
        this.prisma.tpapiSizeModifierItem.findMany({ where: { restaurantId } }),
        this.prisma.tpapiArticleOption.findMany({ where: { restaurantId, articleId: { in: wanted } } }),
        this.prisma.tpapiOptionItem.findMany({ where: { restaurantId, priceLevelId } }),
        this.prisma.tpapiOptionGroup.findMany({ where: { restaurantId } }),
        this.prisma.productPresentation.findMany({ where: { restaurantId, articleId: { in: wanted } } }),
      ]);

    const articleById = new Map(articles.map((a) => [a.untillId.toString(), a]));
    const priceById = new Map(prices.map((p) => [p.articleId.toString(), p]));
    const presById = new Map(presentations.map((p) => [p.articleId.toString(), p]));
    const sizeName = new Map(sizeItems.map((s) => [s.untillId.toString(), s.name]));
    const groupName = new Map(optGroups.map((g) => [g.untillId.toString(), g.name]));
    const allArticleNames = new Map(articles.map((a) => [a.untillId.toString(), a.name]));

    const sizeKey = (a: string, s: string) => `${a}:${s}`;
    const sizePriceBy = new Map(sizePrices.map((s) => [sizeKey(s.articleId.toString(), s.sizeItemId.toString()), s]));
    const optItemKey = (g: string, a: string) => `${g}:${a}`;
    const optItemBy = new Map(optItems.map((i) => [optItemKey(i.optionGroupId.toString(), i.articleId.toString()), i]));
    const linksOf = new Map<string, typeof links>();
    for (const l of links) {
      const k = l.articleId.toString();
      linksOf.set(k, [...(linksOf.get(k) ?? []), l]);
    }

    // names of option items that are not in the requested set
    const optionArticleIds = [...new Set(dto.lines.flatMap((l) => (l.options ?? []).map((o) => BigInt(o.articleId))))];
    if (optionArticleIds.length) {
      const extra = await this.prisma.tpapiArticle.findMany({
        where: { restaurantId, untillId: { in: optionArticleIds } },
        select: { untillId: true, name: true },
      });
      for (const a of extra) allArticleNames.set(a.untillId.toString(), a.name);
    }

    const pricedLines: PricedLine[] = dto.lines.map((line) =>
      this.priceLine(line, {
        areaId, articleById, priceById, presById, sizePriceBy, sizeName,
        optItemBy, groupName, linksOf, allArticleNames, sizeKey, optItemKey,
      }),
    );

    const subtotal = round2(pricedLines.reduce((s, l) => s + l.lineTotal, 0));
    const taxTotal = round2(
      pricedLines.reduce((s, l) => (l.vatRate ? s + (l.lineTotal * l.vatRate) / (100 + l.vatRate) : s), 0),
    );

    return {
      currency,
      salesAreaId: areaId.toString(),
      priceLevelId: priceLevelId.toString(),
      lines: pricedLines,
      subtotal,
      taxTotal,
      total: subtotal,
      itemCount: pricedLines.reduce((s, l) => s + l.quantity, 0),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private priceLine(line: CartLineDto, ctx: any): PricedLine {
    const article = ctx.articleById.get(line.articleId);
    if (!article) throw new BadRequestException(`Product ${line.articleId} is not available`);
    if (!article.availableSalesAreaIds.some((id: bigint) => id === ctx.areaId)) {
      throw new BadRequestException(`"${article.name}" is not available in this zone`);
    }

    const pres = ctx.presById.get(line.articleId);
    if (pres && pres.isVisible === false) {
      throw new BadRequestException(`"${article.name}" is not available`);
    }

    const price = ctx.priceById.get(line.articleId);
    const modifiers: PricedModifier[] = [];
    let basePrice: number;
    let vatRate: number | null = price ? dec(price.vat) : null;

    if (article.sizeModifierId) {
      // ---- size-based: the price comes from the chosen size
      if (!line.sizeItemId) throw new BadRequestException(`"${article.name}" requires a size`);
      const sp = ctx.sizePriceBy.get(ctx.sizeKey(line.articleId, line.sizeItemId));
      if (!sp) throw new BadRequestException(`Unknown size for "${article.name}"`);
      basePrice = dec(sp.amount);
      modifiers.push({
        kind: "SIZE",
        articleId: null,
        optionGroupId: null,
        sizeItemId: line.sizeItemId,
        name: ctx.sizeName.get(line.sizeItemId) ?? line.sizeItemId,
        unitPrice: 0,
      });
    } else if (article.isMenu && !price) {
      // ---- menu: the price is the sum of the chosen items
      basePrice = 0;
    } else if (price) {
      basePrice = dec(price.amount);
    } else {
      throw new BadRequestException(`No price for "${article.name}" in this zone`);
    }

    // ---- options
    const allowed = (ctx.linksOf.get(line.articleId) ?? []) as {
      optionGroupId: bigint; requiredChoices: number | null;
    }[];
    const chosen = line.options ?? [];
    const perGroup = new Map<string, number>();

    for (const opt of chosen) {
      const link = allowed.find((l) => l.optionGroupId.toString() === opt.optionGroupId);
      if (!link) throw new BadRequestException(`Option group ${opt.optionGroupId} is not valid for "${article.name}"`);
      const item = ctx.optItemBy.get(ctx.optItemKey(opt.optionGroupId, opt.articleId));
      if (!item) throw new BadRequestException(`Invalid choice in "${ctx.groupName.get(opt.optionGroupId) ?? "options"}"`);

      perGroup.set(opt.optionGroupId, (perGroup.get(opt.optionGroupId) ?? 0) + 1);
      modifiers.push({
        kind: "OPTION",
        articleId: opt.articleId,
        optionGroupId: opt.optionGroupId,
        sizeItemId: null,
        name: ctx.allArticleNames.get(opt.articleId) ?? opt.articleId,
        unitPrice: dec(item.amount),
      });
      if (vatRate === null && item.vat) vatRate = dec(item.vat);
    }

    // ---- "choose exactly N" rules from composed_options
    for (const link of allowed) {
      if (link.requiredChoices === null) continue;
      const got = perGroup.get(link.optionGroupId.toString()) ?? 0;
      if (got !== link.requiredChoices) {
        const name = ctx.groupName.get(link.optionGroupId.toString()) ?? "options";
        throw new BadRequestException(`"${article.name}" requires exactly ${link.requiredChoices} choice(s) in ${name}, got ${got}`);
      }
    }

    const unitPrice = round2(basePrice + modifiers.reduce((s, m) => s + m.unitPrice, 0));
    if (unitPrice <= 0 && !article.isMenu) {
      throw new BadRequestException(`"${article.name}" priced at zero — refusing to sell`);
    }

    return {
      articleId: line.articleId,
      name: article.name,
      displayName: textOf(pres?.displayName, article.name),
      quantity: line.quantity,
      basePrice,
      modifiers,
      unitPrice,
      lineTotal: round2(unitPrice * line.quantity),
      vatRate,
      isMenu: article.isMenu,
      note: line.note,
    };
  }
}