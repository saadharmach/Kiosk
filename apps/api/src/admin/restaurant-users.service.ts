import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { AccountInviteService, type SendResult } from "../auth/account-invites.service.js";
import { PasswordService } from "../auth/password.service.js";
import { AuditService } from "../common/audit.service.js";
import { EmailCheckService } from "../common/real-email.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateRestaurantUserDto, UpdateRestaurantUserDto } from "./dto/restaurant-user.dto.js";
import { generateTemporaryPassword } from "./temporary-password.js";

/** Everything about a user that may leave the server. Never the password hash. */
const PUBLIC = {
  id: true, email: true, fullName: true, role: true, isActive: true,
  lastLoginAt: true, lockedUntil: true, createdAt: true, passwordSetAt: true,
} as const;

type Actor = { id: string };

/** The platform's side of a restaurant's users. Every query and write is scoped by the restaurant. */
@Injectable()
export class RestaurantUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly emailCheck: EmailCheckService,
    private readonly invites: AccountInviteService,
  ) {}

  async list(restaurantId: string) {
    // The restaurant check and the list are independent, so they go out together.
    const [, users] = await Promise.all([
      this.requireRestaurant(restaurantId),
      this.prisma.restaurantUser.findMany({ where: { restaurantId }, select: PUBLIC, orderBy: { createdAt: "asc" } }),
    ]);
    // For anyone still waiting to choose a password: is their link still good, or has it run out?
    const waiting = users.filter((u) => u.passwordSetAt === null).map((u) => u.id);
    const live = waiting.length
      ? await this.prisma.accountToken.findMany({
          where: { realm: "RESTAURANT", restaurantId, userId: { in: waiting }, usedAt: null, expiresAt: { gt: new Date() } },
          select: { userId: true },
        })
      : [];
    const hasLink = new Set(live.map((t) => t.userId));
    return users.map(({ passwordSetAt, ...u }) => ({
      ...u,
      /** none: they have a password. pending: an invitation is out. expired: it ran out and needs sending again. */
      invitation: passwordSetAt !== null ? ("none" as const) : hasLink.has(u.id) ? ("pending" as const) : ("expired" as const),
    }));
  }

  /**
   * Makes the account and emails the person a link to choose their own password. Nobody, including us, ever knows a
   * password for it. If the email cannot be sent, the account still exists and `invitation.sent` says so.
   */
  async create(restaurantId: string, dto: CreateRestaurantUserDto, actor: Actor, req?: Request) {
    const restaurant = await this.requireRestaurant(restaurantId);
    const email = dto.email.trim().toLowerCase();
    await this.emailCheck.assertReal(email);   // a real address, not a placeholder: this is how the person signs in
    if (await this.prisma.restaurantUser.findFirst({ where: { restaurantId, email }, select: { id: true } })) {
      throw new ConflictException(`${email} already has an account at this restaurant`);
    }

    const user = await this.prisma.restaurantUser
      .create({
        data: {
          restaurantId, email, role: dto.role,
          fullName: dto.fullName?.trim() || null,
          passwordHash: await this.passwords.hash(generateTemporaryPassword(32)),   // nobody knows it: the invitation sets the real one
          passwordSetAt: null,
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
        after: { email: user.email, role: user.role },
      },
      req,
    );
    const { passwordSetAt: _p, ...safe } = user;
    return { user: safe, invitation: await this.sendLink("INVITE", user, restaurant) };
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

  /**
   * "Reset password": the old password stops working at once, every session ends, the account unlocks, and the person is
   * emailed a link to choose a new one. Nobody is shown a password.
   */
  async resetPassword(restaurantId: string, userId: string, actor: Actor, req?: Request) {
    const restaurant = await this.requireRestaurant(restaurantId);
    const user = await this.requireUser(restaurantId, userId);

    await this.prisma.$transaction([
      this.prisma.restaurantUser.updateMany({
        where: { id: userId, restaurantId },
        data: { passwordHash: await this.passwords.hash(generateTemporaryPassword(32)), passwordSetAt: null, failedLoginCount: 0, lockedUntil: null },
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
    return { invitation: await this.sendLink("RESET", user, restaurant) };
  }

  /**
   * Removes a person from a restaurant for good: their account, sessions and waiting links go, and their address is free to
   * use again. Only after they have been switched off, so it takes two deliberate steps. What they did stays in the history.
   */
  async remove(restaurantId: string, userId: string, actor: Actor, req?: Request) {
    await this.requireRestaurant(restaurantId);
    const user = await this.requireUser(restaurantId, userId);
    if (user.isActive) throw new BadRequestException("Switch them off first. A person can only be deleted after they have been switched off.");

    await this.prisma.$transaction([
      this.prisma.accountToken.deleteMany({ where: { realm: "RESTAURANT", restaurantId, userId } }),
      this.prisma.restaurantUser.deleteMany({ where: { id: userId, restaurantId } }),   // their sessions go with them
    ]);
    await this.audit.record(
      {
        restaurantId, actorType: "PLATFORM_USER", actorId: actor.id,
        action: "restaurant_user.delete", entityType: "RestaurantUser", entityId: userId,
        before: { email: user.email, role: user.role },
      },
      req,
    );
    return { removed: true };
  }

  /** The email went missing, or the link ran out: send a fresh one. Only for someone who has not chosen a password yet. */
  async resendInvitation(restaurantId: string, userId: string, actor: Actor, req?: Request) {
    const restaurant = await this.requireRestaurant(restaurantId);
    const user = await this.requireUser(restaurantId, userId);
    if (user.passwordSetAt !== null) {
      throw new BadRequestException("They have already chosen a password. If they cannot sign in, use Reset password.");
    }
    await this.audit.record(
      { restaurantId, actorType: "PLATFORM_USER", actorId: actor.id, action: "restaurant_user.invite_resent", entityType: "RestaurantUser", entityId: userId, after: { email: user.email } },
      req,
    );
    return { invitation: await this.sendLink("INVITE", user, restaurant) };
  }

  private sendLink(kind: "INVITE" | "RESET", user: { id: string; email: string; fullName: string | null }, r: { id: string; name: string; slug: string; locale: string }): Promise<SendResult> {
    return this.invites.sendLink({ realm: "RESTAURANT", kind, user, restaurant: r });
  }

  private revokeSessions(restaurantId: string, userId: string) {
    return this.prisma.restaurantSession.updateMany({
      where: { restaurantId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async requireRestaurant(restaurantId: string) {
    const r = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, name: true, slug: true, locale: true } });
    if (!r) throw new NotFoundException("Restaurant not found");
    return r;
  }

  /** A user id from another restaurant is "not found", not "forbidden": its existence is not ours to confirm. */
  private async requireUser(restaurantId: string, userId: string) {
    const u = await this.prisma.restaurantUser.findFirst({ where: { id: userId, restaurantId }, select: PUBLIC });
    if (!u) throw new NotFoundException("User not found");
    return u;
  }
}
