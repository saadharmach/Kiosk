import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { PasswordService } from "../auth/password.service.js";
import { AuditService } from "../common/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateRestaurantUserDto, UpdateRestaurantUserDto } from "./dto/restaurant-user.dto.js";
import { generateTemporaryPassword } from "./temporary-password.js";

/** Everything about a user that may leave the server. Never the password hash. */
const PUBLIC = {
  id: true, email: true, fullName: true, role: true, isActive: true,
  lastLoginAt: true, lockedUntil: true, createdAt: true,
} as const;

type Actor = { id: string };

/** The platform's side of a restaurant's users. Every query and write is scoped by the restaurant. */
@Injectable()
export class RestaurantUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(restaurantId: string) {
    await this.requireRestaurant(restaurantId);
    return this.prisma.restaurantUser.findMany({
      where: { restaurantId },
      select: PUBLIC,
      orderBy: { createdAt: "asc" },
    });
  }

  /** Creates the account with a random password, returned this once and stored only as a hash. */
  async create(restaurantId: string, dto: CreateRestaurantUserDto, actor: Actor, req?: Request) {
    await this.requireRestaurant(restaurantId);
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.restaurantUser.findFirst({ where: { restaurantId, email }, select: { id: true } })) {
      throw new ConflictException(`${email} already has an account at this restaurant`);
    }

    const temporaryPassword = generateTemporaryPassword();
    const user = await this.prisma.restaurantUser
      .create({
        data: {
          restaurantId, email, role: dto.role,
          fullName: dto.fullName?.trim() || null,
          passwordHash: await this.passwords.hash(temporaryPassword),
        },
        select: PUBLIC,
      })
      .catch((e: { code?: string }) => {
        // Two people adding the same address at once: the unique index decides, not our check above.
        if (e?.code === "P2002") throw new ConflictException(`${email} already has an account at this restaurant`);
        throw e;
      });

    await this.audit.record(
      {
        restaurantId, actorType: "PLATFORM_USER", actorId: actor.id,
        action: "restaurant_user.create", entityType: "RestaurantUser", entityId: user.id,
        after: { email: user.email, role: user.role },   // never the password
      },
      req,
    );
    return { user, temporaryPassword };
  }

  async update(restaurantId: string, userId: string, dto: UpdateRestaurantUserDto, actor: Actor, req?: Request) {
    const before = await this.requireUser(restaurantId, userId);
    const data = {
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() || null } : {}),
    };

    await this.prisma.$transaction([
      this.prisma.restaurantUser.updateMany({ where: { id: userId, restaurantId }, data }),
      // Switching someone off must also end the sessions they already have.
      ...(dto.isActive === false ? [this.revokeSessions(restaurantId, userId)] : []),
    ]);

    const after = await this.requireUser(restaurantId, userId);
    await this.audit.record(
      {
        restaurantId, actorType: "PLATFORM_USER", actorId: actor.id,
        action: dto.isActive === false ? "restaurant_user.deactivate"
          : dto.isActive === true && !before.isActive ? "restaurant_user.reactivate"
          : "restaurant_user.update",
        entityType: "RestaurantUser", entityId: userId,
        before: { role: before.role, isActive: before.isActive },
        after: { role: after.role, isActive: after.isActive },
      },
      req,
    );
    return after;
  }

  /** A new random password, shown once. The old one stops working, the account unlocks, and every session ends. */
  async resetPassword(restaurantId: string, userId: string, actor: Actor, req?: Request) {
    const user = await this.requireUser(restaurantId, userId);
    const temporaryPassword = generateTemporaryPassword();

    await this.prisma.$transaction([
      this.prisma.restaurantUser.updateMany({
        where: { id: userId, restaurantId },
        data: { passwordHash: await this.passwords.hash(temporaryPassword), failedLoginCount: 0, lockedUntil: null },
      }),
      this.revokeSessions(restaurantId, userId),
    ]);

    await this.audit.record(
      {
        restaurantId, actorType: "PLATFORM_USER", actorId: actor.id,
        action: "restaurant_user.password_reset", entityType: "RestaurantUser", entityId: userId,
        after: { email: user.email },
      },
      req,
    );
    return { temporaryPassword };
  }

  private revokeSessions(restaurantId: string, userId: string) {
    return this.prisma.restaurantSession.updateMany({
      where: { restaurantId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async requireRestaurant(restaurantId: string) {
    const r = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!r) throw new NotFoundException("Restaurant not found");
  }

  /** A user id from another restaurant is "not found", not "forbidden": its existence is not ours to confirm. */
  private async requireUser(restaurantId: string, userId: string) {
    const u = await this.prisma.restaurantUser.findFirst({ where: { id: userId, restaurantId }, select: PUBLIC });
    if (!u) throw new NotFoundException("User not found");
    return u;
  }
}
