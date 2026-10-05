import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { readLocalizedMap } from "../common/locale.js";
import { StorageService } from "../common/storage.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateBrandingDto } from "./dto/branding.dto.js";

export type BrandingKind = "logo" | "welcome";

/** Anything smaller is not a real image (an 8-byte "PNG" once got through). */
const MIN_IMAGE_BYTES = 1024;
/** Welcome-screen photos shown in turn. More than this and a customer never sees the last ones. */
export const MAX_WELCOME_IMAGES = 5;

const SELECT = { logoPath: true, welcomeImagePaths: true, tagline: true, primaryColor: true } as const;

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(restaurantId: string) {
    return this.present(await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: SELECT }));
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
      select: { logoPath: true, welcomeImagePaths: true },
    });

    const data: Prisma.RestaurantUpdateInput = {};
    const toDelete: string[] = [];

    if (dto.logoPath !== undefined) {
      const next = dto.logoPath || null;
      if (next && next !== before.logoPath) await this.checkUpload(restaurantId, "logo", next, "logoPath");
      data.logoPath = next;
      if (before.logoPath && before.logoPath !== next) toDelete.push(before.logoPath);
    }

    if (dto.welcomeImagePaths !== undefined) {
      const next = dto.welcomeImagePaths ?? [];
      if (next.length > MAX_WELCOME_IMAGES) throw new BadRequestException(`At most ${MAX_WELCOME_IMAGES} welcome photos.`);
      if (new Set(next).size !== next.length) throw new BadRequestException("The same photo is in the list twice.");
      // A photo already on the list may stay (and move); only a new one is checked.
      for (const path of next) {
        if (!before.welcomeImagePaths.includes(path)) await this.checkUpload(restaurantId, "welcome", path, "welcomeImagePaths");
      }
      data.welcomeImagePaths = next;
      for (const old of before.welcomeImagePaths) if (!next.includes(old)) toDelete.push(old);
    }

    if (dto.tagline !== undefined) {
      const map = dto.tagline === null ? {} : readLocalizedMap(dto.tagline);
      data.tagline = Object.keys(map).length ? map : Prisma.DbNull;
    }

    // Scoped by the restaurant id that came from the token, never from the request.
    const updated = await this.prisma.restaurant.update({ where: { id: restaurantId }, data, select: SELECT });
    // After the record no longer points at them; a failed delete only leaves an orphan.
    for (const path of toDelete) await this.storage.remove(path);
    return this.present(updated);
  }

  private present(r: { logoPath: string | null; welcomeImagePaths: string[]; tagline: unknown; primaryColor: string | null }) {
    return {
      logoPath: r.logoPath,
      logoUrl: this.storage.publicUrl(r.logoPath),
      welcomeImages: r.welcomeImagePaths.map((path) => ({ path, url: this.storage.publicUrl(path) })),
      tagline: readLocalizedMap(r.tagline),
      primaryColor: r.primaryColor,
    };
  }
}
