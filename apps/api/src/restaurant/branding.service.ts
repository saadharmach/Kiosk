import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { readLocalizedMap } from "../common/locale.js";
import { StorageService, isVideoPath } from "../common/storage.service.js";
import { readSlides } from "../common/welcome-slides.js";
export { readSlides, type WelcomeSlide } from "../common/welcome-slides.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateBrandingDto } from "./dto/branding.dto.js";

export type BrandingKind = "logo" | "welcome";

/** Anything smaller is not a real image (an 8-byte "PNG" once got through). */
const MIN_IMAGE_BYTES = 1024;
/** Welcome-screen adverts shown in turn. More than this and a customer never sees the last ones. */
export const MAX_WELCOME_SLIDES = 5;

const SELECT = { logoPath: true, welcomeSlides: true, tagline: true, subtitle: true, primaryColor: true } as const;

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(restaurantId: string) {
    return this.present(restaurantId, await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: SELECT }));
  }

  sign(restaurantId: string, kind: BrandingKind, contentType: string) {
    return this.storage.signUpload({ restaurantId, kind: "branding", ownerId: kind, contentType });
  }

  /** A new image must come from this restaurant's own signed upload of that kind, and really be there. */
  private async checkUpload(restaurantId: string, kind: BrandingKind, path: string, field: string) {
    if (!path.startsWith(`restaurants/${restaurantId}/branding/${kind}/`) || path.includes("..")) {
      throw new BadRequestException(`${field} must come from a signed ${kind} upload for this restaurant`);
    }
    const size = await this.storage.objectSize(path);
    if (size === null) throw new BadRequestException("That file was not uploaded. Upload it, then save.");
    if (size < MIN_IMAGE_BYTES) throw new BadRequestException("The uploaded file is too small to be a valid image.");
  }

  async update(restaurantId: string, dto: UpdateBrandingDto) {
    const before = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { logoPath: true, welcomeSlides: true },
    });
    const beforeSlides = readSlides(before.welcomeSlides);
    const beforePaths = beforeSlides.map((x) => x.path);

    const data: Prisma.RestaurantUpdateInput = {};
    const toDelete: string[] = [];

    if (dto.logoPath !== undefined) {
      const next = dto.logoPath || null;
      if (next && next !== before.logoPath) await this.checkUpload(restaurantId, "logo", next, "logoPath");
      data.logoPath = next;
      if (before.logoPath && before.logoPath !== next) toDelete.push(before.logoPath);
    }

    if (dto.welcomeSlides !== undefined) {
      const next = dto.welcomeSlides.map((x) => ({ path: x.path, productId: x.productId || null }));
      if (next.length > MAX_WELCOME_SLIDES) throw new BadRequestException(`At most ${MAX_WELCOME_SLIDES} welcome slides.`);
      const paths = next.map((x) => x.path);
      if (new Set(paths).size !== paths.length) throw new BadRequestException("The same photo or video is in the list twice.");
      // A slide already on the list may stay (and move); only a new file is checked.
      for (const path of paths) {
        if (!beforePaths.includes(path)) await this.checkUpload(restaurantId, "welcome", path, "welcomeSlides");
      }
      // A product shown on a slide must be one of this restaurant's.
      const ids = [...new Set(next.map((x) => x.productId).filter((x): x is string => Boolean(x)))];
      if (ids.length) {
        const found = await this.prisma.tpapiArticle.findMany({
          where: { restaurantId, untillId: { in: ids.map((i) => BigInt(i)) } },
          select: { untillId: true },
        });
        if (found.length !== ids.length) throw new BadRequestException("A slide points to a product that is not on this restaurant's menu.");
      }
      data.welcomeSlides = next as unknown as Prisma.InputJsonValue;
      for (const old of beforePaths) if (!paths.includes(old)) toDelete.push(old);
    }

    for (const field of ["tagline", "subtitle"] as const) {
      if (dto[field] === undefined) continue;
      const map = dto[field] === null ? {} : readLocalizedMap(dto[field]);
      data[field] = Object.keys(map).length ? map : Prisma.DbNull;
    }

    // Scoped by the restaurant id that came from the token, never from the request.
    const updated = await this.prisma.restaurant.update({ where: { id: restaurantId }, data, select: SELECT });
    // After the record no longer points at them; a failed delete only leaves an orphan.
    for (const path of toDelete) await this.storage.remove(path);
    return this.present(restaurantId, updated);
  }

  private async present(restaurantId: string, r: { logoPath: string | null; welcomeSlides: unknown; tagline: unknown; subtitle: unknown; primaryColor: string | null }) {
    const slides = readSlides(r.welcomeSlides);
    // The name of each linked product, so the back office can say which one it is.
    const ids = [...new Set(slides.map((x) => x.productId).filter((x): x is string => Boolean(x)))];
    const names = new Map(
      ids.length
        ? (await this.prisma.tpapiArticle.findMany({
            where: { restaurantId, untillId: { in: ids.map((i) => BigInt(i)) } },
            select: { untillId: true, name: true },
          })).map((a) => [a.untillId.toString(), a.name] as const)
        : [],
    );
    return {
      logoPath: r.logoPath,
      logoUrl: this.storage.publicUrl(r.logoPath),
      welcomeSlides: slides.map((x) => ({
        ...x, url: this.storage.publicUrl(x.path), kind: isVideoPath(x.path) ? ("video" as const) : ("image" as const),
        productName: x.productId ? names.get(x.productId) ?? null : null,
      })),
      tagline: readLocalizedMap(r.tagline),
      subtitle: readLocalizedMap(r.subtitle),
      primaryColor: r.primaryColor,
    };
  }
}
