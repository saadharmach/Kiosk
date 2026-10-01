import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { AuditService } from "../common/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateRestaurantDto } from "./dto/create-restaurant.dto.js";
import type { ListRestaurantsDto } from "./dto/list-restaurants.dto.js";
import type { UpdateRestaurantDto } from "./dto/update-restaurant.dto.js";

const CARD = {
  id: true, slug: true, name: true, status: true, city: true, country: true,
  currency: true, timezone: true, createdAt: true,
} as const;

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListRestaurantsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" as const } },
              { slug: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.restaurant.count({ where }),
      this.prisma.restaurant.findMany({
        where,
        select: {
          ...CARD,
          _count: { select: { users: true, orders: true } },
          // enough to see at a glance whether the POS link works; never the credentials
          tpapi: { select: { isEnabled: true, lastSuccessAt: true, lastFailureAt: true, lastSyncAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) || 1 };
  }

  async get(idOrSlug: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { OR: [{ slug: idOrSlug }, ...(isUuid(idOrSlug) ? [{ id: idOrSlug }] : [])] },
      include: {
        settings: true,
        tpapi: {
          select: {
            id: true, host: true, port: true, useTls: true, appName: true, isEnabled: true,
            lastSuccessAt: true, lastFailureAt: true, lastErrorMessage: true,
            lastLatencyMs: true, lastSyncAt: true,
            // credentials are never selected
          },
        },
        _count: { select: { kiosks: true, users: true, orders: true } },
      },
    });
    if (!restaurant) throw new NotFoundException("Restaurant not found");
    return restaurant;
  }

  async create(dto: CreateRestaurantDto, actor: { id: string }, req: Request) {
    const exists = await this.prisma.restaurant.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException(`Slug "${dto.slug}" is already taken`);

    const restaurant = await this.prisma.restaurant.create({
      data: { ...dto, settings: { create: {} } },
      select: CARD,
    });

    await this.audit.record(
      {
        restaurantId: restaurant.id,
        actorType: "PLATFORM_USER",
        actorId: actor.id,
        action: "restaurant.create",
        entityType: "Restaurant",
        entityId: restaurant.id,
        after: restaurant,
      },
      req,
    );
    return restaurant;
  }

  async update(id: string, dto: UpdateRestaurantDto, actor: { id: string }, req: Request) {
    const before = await this.prisma.restaurant.findUnique({ where: { id }, select: CARD });
    if (!before) throw new NotFoundException("Restaurant not found");

    const slugChange = dto.slug !== undefined && dto.slug !== before.slug;
    if (slugChange) {
      // Frozen once the first order exists: the address may be printed on a sticker on a machine nobody
      // is standing next to, and changing it would silently break that machine.
      if ((await this.prisma.order.count({ where: { restaurantId: id } })) > 0) {
        throw new ConflictException("The address can no longer be changed: this restaurant has taken orders");
      }
      if (await this.prisma.restaurant.findUnique({ where: { slug: dto.slug }, select: { id: true } })) {
        throw new ConflictException(`Address "${dto.slug}" is already taken`);
      }
    }

    const after = await this.prisma.restaurant.update({
      where: { id },
      data: {
        ...dto,
        archivedAt: dto.status === "ARCHIVED" ? new Date() : dto.status ? null : undefined,
      },
      select: CARD,
    });

    await this.audit.record(
      {
        restaurantId: id,
        actorType: "PLATFORM_USER",
        actorId: actor.id,
        action: dto.status ? `restaurant.status.${dto.status.toLowerCase()}` : slugChange ? "restaurant.slug.change" : "restaurant.update",
        entityType: "Restaurant",
        entityId: id,
        before,
        after,
      },
      req,
    );
    return after;
  }
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}