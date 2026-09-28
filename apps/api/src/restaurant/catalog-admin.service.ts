import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  UpdateCategoryPresentationDto,
  UpdateProductPresentationDto,
} from "./dto/presentation.dto.js";
import { StorageService } from "../common/storage.service.js";
type I18n = Record<string, string>;

/**
 * Merges one language at a time. Two people can translate the same product into
 * different languages without overwriting each other, and an empty string is an
 * explicit "clear this language" rather than a no-op.
 */
function mergeI18n(current: unknown, incoming?: object): I18n | null | undefined {
  if (!incoming) return undefined; // field not sent: leave the column alone
  const base: I18n =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as I18n) }
      : {};
  for (const [lang, value] of Object.entries(incoming as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    if (value === undefined) continue;
    const text = value.trim();
    if (text) base[lang] = text;
    else delete base[lang];
  }
  return Object.keys(base).length ? base : null;
}

const filled = (v: unknown): string[] =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.entries(v as I18n).filter(([, t]) => t?.trim()).map(([l]) => l)
    : [];

@Injectable()
export class CatalogAdminService {
    constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listProducts(
    restaurantId: string,
    q: { categoryId?: string; search?: string; missing?: string; page?: string; pageSize?: string },
  ) {
    const page = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 50) || 50));

    const [articles, presentations, allergenLinks] = await Promise.all([
      this.prisma.tpapiArticle.findMany({
        where: {
          restaurantId,
          isActive: true,
          isPresent: true,
          ...(q.categoryId ? { departmentId: BigInt(q.categoryId) } : {}),
          ...(q.search ? { name: { contains: q.search, mode: "insensitive" as const } } : {}),
        },
        orderBy: { number: "asc" },
        select: { untillId: true, name: true, number: true, departmentId: true, isMenu: true },
      }),
      this.prisma.productPresentation.findMany({ where: { restaurantId } }),
      this.prisma.productAllergen.findMany({ where: { restaurantId } }),
    ]);

    const presOf = new Map(presentations.map((p) => [p.articleId.toString(), p]));
    const allergensOf = new Map<string, string[]>();
    for (const a of allergenLinks) {
      const k = a.articleId.toString();
      allergensOf.set(k, [...(allergensOf.get(k) ?? []), a.allergenId.toString()]);
    }

    let rows = articles.map((a) => {
      const key = a.untillId.toString();
      const p = presOf.get(key);
      return {
        articleId: key,
        posName: a.name,
        categoryId: a.departmentId?.toString() ?? null,
        isMenu: a.isMenu,
        // Unresolved on purpose: the editor must see which languages are missing.
        displayName: (p?.displayName ?? null) as I18n | null,
        description: (p?.description ?? null) as I18n | null,
        imagePath: p?.imagePath ?? null,
        isVisible: p?.isVisible ?? true,
        sortOrder: p?.sortOrder ?? a.number,
        isFeatured: p?.isFeatured ?? false,
        badgeText: p?.badgeText ?? null,
        allergenIds: allergensOf.get(key) ?? [],
        translatedInto: filled(p?.displayName),
        imageUrl: this.storage.publicUrl(p?.imagePath ?? null),
      };
    });

    if (q.missing === "translation") {
      rows = rows.filter((r) => r.translatedInto.length < 3);
    } else if (q.missing === "image") {
      rows = rows.filter((r) => !r.imagePath);
    } else if (q.missing) {
      throw new BadRequestException(`Unknown missing filter "${q.missing}". Use translation or image.`);
    }

    const total = rows.length;
    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      products: rows.slice((page - 1) * pageSize, page * pageSize),
    };
  }
      // Only a path this restaurant's own signed upload produced. Otherwise one
    // tenant could reference another's file, or a typo becomes a broken tile.
   
  async upsertProduct(restaurantId: string, articleId: string, dto: UpdateProductPresentationDto) {
    const id = BigInt(articleId);
    const article = await this.prisma.tpapiArticle.findFirst({
      where: { restaurantId, untillId: id },
      select: { untillId: true },
    });
    if (!article) throw new NotFoundException("No such article in this restaurant's catalog");
        // Only a path this restaurant's own signed upload produced. Otherwise one
    // tenant could reference another's file, or a typo becomes a broken tile.
    if (dto.imagePath && !dto.imagePath.startsWith(`restaurants/${restaurantId}/`)) {
      throw new BadRequestException("imagePath must come from a signed upload for this restaurant");
    }
    const existing = await this.prisma.productPresentation.findUnique({
      where: { restaurantId_articleId: { restaurantId, articleId: id } },
    });

    const displayName = mergeI18n(existing?.displayName, dto.displayName);
    const description = mergeI18n(existing?.description, dto.description);

    const data = {
      ...(displayName !== undefined ? { displayName: displayName as never } : {}),
      ...(description !== undefined ? { description: description as never } : {}),
      ...(dto.imagePath !== undefined ? { imagePath: dto.imagePath || null } : {}),
      ...(dto.isVisible !== undefined ? { isVisible: dto.isVisible } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      ...(dto.badgeText !== undefined ? { badgeText: dto.badgeText || null } : {}),
    };

    return this.prisma.productPresentation.upsert({
      where: { restaurantId_articleId: { restaurantId, articleId: id } },
      create: { restaurantId, articleId: id, ...data },
      update: data,
    });
  }

  async listCategories(restaurantId: string) {
    const [departments, groups, presentations] = await Promise.all([
      this.prisma.tpapiDepartment.findMany({ where: { restaurantId }, orderBy: { number: "asc" } }),
      this.prisma.tpapiGroup.findMany({ where: { restaurantId } }),
      this.prisma.categoryPresentation.findMany({ where: { restaurantId } }),
    ]);
    const presOf = new Map(presentations.map((p) => [`${p.scope}:${p.untillId.toString()}`, p]));

    const shape = (scope: "GROUP" | "DEPARTMENT", untillId: bigint, name: string, order: number) => {
      const p = presOf.get(`${scope}:${untillId.toString()}`);
      return {
        scope,
        untillId: untillId.toString(),
        posName: name,
        displayName: (p?.displayName ?? null) as I18n | null,
        description: (p?.description ?? null) as I18n | null,
        imagePath: p?.imagePath ?? null,
        color: p?.color ?? null,
        isVisible: p?.isVisible ?? true,
        sortOrder: p?.sortOrder ?? order,
        translatedInto: filled(p?.displayName),
      };
    };

    return {
      groups: groups.map((g) => shape("GROUP", g.untillId, g.name, 0)),
      departments: departments.map((d) => shape("DEPARTMENT", d.untillId, d.name, d.number)),
    };
  }

  async upsertCategory(
    restaurantId: string,
    scope: "GROUP" | "DEPARTMENT",
    untillId: string,
    dto: UpdateCategoryPresentationDto,
  ) {
    const id = BigInt(untillId);
    const exists =
      scope === "GROUP"
        ? await this.prisma.tpapiGroup.findFirst({ where: { restaurantId, untillId: id }, select: { id: true } })
        : await this.prisma.tpapiDepartment.findFirst({ where: { restaurantId, untillId: id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`No such ${scope.toLowerCase()} in this restaurant's catalog`);
        // Only a path this restaurant's own signed upload produced. Otherwise one
    // tenant could reference another's file, or a typo becomes a broken tile.
    if (dto.imagePath && !dto.imagePath.startsWith(`restaurants/${restaurantId}/`)) {
      throw new BadRequestException("imagePath must come from a signed upload for this restaurant");
    }
    const existing = await this.prisma.categoryPresentation.findUnique({
      where: { restaurantId_scope_untillId: { restaurantId, scope, untillId: id } },
    });

    const displayName = mergeI18n(existing?.displayName, dto.displayName);
    const description = mergeI18n(existing?.description, dto.description);

    const data = {
      ...(displayName !== undefined ? { displayName: displayName as never } : {}),
      ...(description !== undefined ? { description: description as never } : {}),
      ...(dto.imagePath !== undefined ? { imagePath: dto.imagePath || null } : {}),
      ...(dto.color !== undefined ? { color: dto.color || null } : {}),
      ...(dto.isVisible !== undefined ? { isVisible: dto.isVisible } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };

    return this.prisma.categoryPresentation.upsert({
      where: { restaurantId_scope_untillId: { restaurantId, scope, untillId: id } },
      create: { restaurantId, scope, untillId: id, ...data },
      update: data,
    });
  }

  listAllergens(restaurantId: string) {
    return this.prisma.tpapiAllergen.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { number: "asc" },
      select: { untillId: true, number: true, name: true, description: true },
    });
  }

  /** Replace-whole: allergens are a set, not a list you append to. */
  async setAllergens(restaurantId: string, articleId: string, allergenIds: string[]) {
    const id = BigInt(articleId);
    const ids = [...new Set(allergenIds)].map((a) => BigInt(a));

    if (ids.length) {
      const known = await this.prisma.tpapiAllergen.findMany({
        where: { restaurantId, untillId: { in: ids } },
        select: { untillId: true },
      });
      if (known.length !== ids.length) {
        const found = new Set(known.map((k) => k.untillId.toString()));
        const bad = ids.map(String).filter((i) => !found.has(i));
        throw new BadRequestException(`Unknown allergen ids: ${bad.join(", ")}`);
      }
    }

    await this.prisma.$transaction([
      this.prisma.productAllergen.deleteMany({ where: { restaurantId, articleId: id } }),
      ...(ids.length
        ? [this.prisma.productAllergen.createMany({
            data: ids.map((allergenId) => ({ restaurantId, articleId: id, allergenId })),
          })]
        : []),
    ]);

    return { articleId, allergenIds: ids.map(String) };
  }
    async signProductImage(restaurantId: string, articleId: string, contentType: string) {
    const article = await this.prisma.tpapiArticle.findFirst({
      where: { restaurantId, untillId: BigInt(articleId) },
      select: { untillId: true },
    });
    if (!article) throw new NotFoundException("No such article in this restaurant's catalog");
    return this.storage.signUpload({ restaurantId, kind: "products", ownerId: articleId, contentType });
  }

  /** Clears the record first: a visible broken image is worse than an orphan file. */
  async clearProductImage(restaurantId: string, articleId: string) {
    const id = BigInt(articleId);
    const existing = await this.prisma.productPresentation.findUnique({
      where: { restaurantId_articleId: { restaurantId, articleId: id } },
      select: { imagePath: true },
    });
    if (!existing?.imagePath) return { imagePath: null };

    await this.prisma.productPresentation.update({
      where: { restaurantId_articleId: { restaurantId, articleId: id } },
      data: { imagePath: null },
    });
    await this.storage.remove(existing.imagePath);
    return { imagePath: null };
  }
}