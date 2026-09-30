import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { readLocalizedMap } from "../common/locale.js";
import { StorageService } from "../common/storage.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateBrandingDto } from "./dto/branding.dto.js";

export type BrandingKind = "logo" | "hero";
const COLUMN = { logo: "logoPath", hero: "heroImagePath" } as const;

/** Anything smaller is not a real image (an 8-byte "PNG" once got through). */
const MIN_IMAGE_BYTES = 1024;

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(restaurantId: string) {
    const r = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { logoPath: true, heroImagePath: true, tagline: true, primaryColor: true },
    });
    return this.present(r);
  }

  sign(restaurantId: string, kind: BrandingKind, contentType: string) {
    return this.storage.signUpload({ restaurantId, kind: "branding", ownerId: kind, contentType });
  }

  async update(restaurantId: string, dto: UpdateBrandingDto) {
    const before = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { logoPath: true, heroImagePath: true },
    });

    const data: Prisma.RestaurantUpdateInput = {};
    const toDelete: string[] = [];

    for (const kind of ["logo", "hero"] as const) {
      const key = kind === "logo" ? "logoPath" : "heroImagePath";
      const next = dto[key];
      if (next === undefined) continue;

      if (!next) {
        data[COLUMN[kind]] = null;
      } else {
        if (!next.startsWith(`restaurants/${restaurantId}/branding/${kind}/`)) {
          throw new BadRequestException(`${key} must come from a signed ${kind} upload for this restaurant`);
        }
        const size = await this.storage.objectSize(next);
        if (size === null) throw new BadRequestException("That file was not uploaded. Upload it, then save.");
        if (size < MIN_IMAGE_BYTES) {
          throw new BadRequestException("The uploaded file is too small to be a valid image.");
        }
        data[COLUMN[kind]] = next;
      }
      if (before[COLUMN[kind]] && before[COLUMN[kind]] !== (next || null)) toDelete.push(before[COLUMN[kind]]!);
    }

    if (dto.tagline !== undefined) {
      const map = dto.tagline === null ? {} : readLocalizedMap(dto.tagline);
      data.tagline = Object.keys(map).length ? map : Prisma.DbNull;
    }

    // Scoped by the restaurant id that came from the token, never from the request.
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data,
      select: { logoPath: true, heroImagePath: true, tagline: true, primaryColor: true },
    });
    // After the record no longer points at them; a failed delete only leaves an orphan.
    for (const path of toDelete) await this.storage.remove(path);
    return this.present(updated);
  }

  private present(r: { logoPath: string | null; heroImagePath: string | null; tagline: unknown; primaryColor: string | null }) {
    return {
      logoPath: r.logoPath,
      logoUrl: this.storage.publicUrl(r.logoPath),
      heroImagePath: r.heroImagePath,
      heroImageUrl: this.storage.publicUrl(r.heroImagePath),
      tagline: readLocalizedMap(r.tagline),
      primaryColor: r.primaryColor,
    };
  }
}
