import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { pickLocalized } from "../common/locale.js";
import { StorageService } from "../common/storage.service.js";

/** How many suggestions one department can hold. The kiosk shows four at a time, skipping what is already in the cart. */
export const MAX_SUGGESTIONS = 12;

@Injectable()
export class SuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Every department with its own list, in order. */
  async list(restaurantId: string) {
    const [departments, presentations, links] = await Promise.all([
      this.prisma.tpapiDepartment.findMany({ where: { restaurantId }, orderBy: { number: "asc" } }),
      this.prisma.categoryPresentation.findMany({ where: { restaurantId, scope: "DEPARTMENT" } }),
      this.prisma.departmentSuggestion.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" } }),
    ]);
    const suggested = [...new Set(links.map((l) => l.articleId))];
    const [articles, productPres] = await Promise.all([
      this.prisma.tpapiArticle.findMany({
        where: { restaurantId, untillId: { in: suggested } },
        select: { untillId: true, name: true, departmentId: true, isActive: true, isPresent: true },
      }),
      this.prisma.productPresentation.findMany({ where: { restaurantId, articleId: { in: suggested } } }),
    ]);
    const productPresOf = new Map(productPres.map((p) => [p.articleId.toString(), p]));
    const articleOf = new Map(articles.map((a) => [a.untillId.toString(), a]));
    const presOf = new Map(presentations.map((p) => [p.untillId.toString(), p]));

    return {
      departments: departments.map((d) => {
        const key = d.untillId.toString();
        return {
          departmentId: key,
          posName: d.name,
          name: pickLocalized(presOf.get(key)?.displayName, "fr", d.name) ?? d.name,
          suggestions: links
            .filter((l) => l.departmentId === d.untillId)
            .sort((x, y) => x.sortOrder - y.sortOrder)
            .flatMap((l) => {
              const a = articleOf.get(l.articleId.toString());
              // An article that left unTill is not shown, and drops out of the list when it is next saved.
              if (!a) return [];
              const pres = productPresOf.get(l.articleId.toString());
              return [{
                articleId: l.articleId.toString(),
                name: pickLocalized(pres?.displayName, "fr", a.name) ?? a.name,
                imageUrl: this.storage.publicUrl(pres?.imagePath ?? null),
                categoryId: a.departmentId?.toString() ?? null,
                available: a.isActive && a.isPresent,
              }];
            }),
        };
      }),
    };
  }

  /** Replaces a department's whole list: it is an ordered set, not something you append to. */
  async replace(restaurantId: string, departmentId: string, articleIds: string[]) {
    const dept = BigInt(departmentId);
    const department = await this.prisma.tpapiDepartment.findFirst({ where: { restaurantId, untillId: dept } });
    if (!department) throw new NotFoundException("Department not found");

    const ids = [...new Set(articleIds)];
    if (ids.length > MAX_SUGGESTIONS) {
      throw new BadRequestException(`A department can have at most ${MAX_SUGGESTIONS} suggestions`);
    }
    const wanted = ids.map((a) => BigInt(a));

    if (wanted.length > 0) {
      const found = await this.prisma.tpapiArticle.findMany({
        where: { restaurantId, untillId: { in: wanted }, isActive: true, isPresent: true },
        select: { untillId: true, isMenu: true, name: true },
      });
      const byId = new Map(found.map((a) => [a.untillId.toString(), a]));
      const unknown = ids.filter((i) => !byId.has(i));
      if (unknown.length > 0) throw new BadRequestException(`Unknown products: ${unknown.join(", ")}`);
      // A menu has no price in unTill yet, so it cannot be sold and so cannot be suggested.
      const menus = ids.filter((i) => byId.get(i)!.isMenu);
      if (menus.length > 0) {
        throw new BadRequestException(`Menus cannot be suggested yet: ${menus.map((i) => byId.get(i)!.name).join(", ")}`);
      }
    }

    await this.prisma.$transaction([
      this.prisma.departmentSuggestion.deleteMany({ where: { restaurantId, departmentId: dept } }),
      ...(wanted.length > 0
        ? [this.prisma.departmentSuggestion.createMany({
            data: wanted.map((articleId, sortOrder) => ({ restaurantId, departmentId: dept, articleId, sortOrder })),
          })]
        : []),
    ]);
    return { departmentId, articleIds: ids };
  }
}
