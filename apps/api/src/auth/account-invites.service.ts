import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { AccountTokenService, TTL_HOURS, type TokenKind, type TokenRealm } from "../common/account-tokens.service.js";
import { AuditService } from "../common/audit.service.js";
import { inviteEmail, mailLocale } from "../common/mail-templates.js";
import { MailNotConfiguredError, MailerService } from "../common/mailer.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "./password.service.js";
import { PlatformUserDirectory } from "./platform-user-directory.js";

export interface LinkTarget {
  realm: TokenRealm;
  kind: TokenKind;
  user: { id: string; email: string; fullName?: string | null };
  /** Required for the restaurant realm: whose back office the person is joining. */
  restaurant?: { id: string; name: string; slug: string; locale?: string | null };
}

export interface SendResult { sent: boolean; error?: string }

/** Every link says the same thing about being invalid, so it cannot be used to find out which links once existed. */
const INVALID = "This link is not valid any more. Ask for a new one.";

const base = (realm: TokenRealm, env: NodeJS.ProcessEnv) =>
  (realm === "PLATFORM" ? env.ADMIN_APP_URL ?? "http://localhost:3004" : env.BACKOFFICE_APP_URL ?? "http://localhost:3003").replace(/\/+$/, "");

/**
 * "Choose your password" links: sending them, and what happens when one is opened. Opening one is what proves a person
 * owns the address the account was made for.
 */
@Injectable()
export class AccountInviteService {
  private readonly logger = new Logger(AccountInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AccountTokenService,
    private readonly mailer: MailerService,
    private readonly passwords: PasswordService,
    private readonly directory: PlatformUserDirectory,
    private readonly audit: AuditService,
  ) {}

  /** Makes a fresh link (cancelling older ones) and emails it. The account exists either way: a failed send is reported, not thrown. */
  async sendLink(t: LinkTarget, env: NodeJS.ProcessEnv = process.env): Promise<SendResult> {
    const { token } = await this.tokens.issue({ realm: t.realm, kind: t.kind, userId: t.user.id, restaurantId: t.restaurant?.id });
    const link = `${base(t.realm, env)}/accept-invite?token=${encodeURIComponent(token)}`;
    const mail = inviteEmail({
      locale: t.realm === "RESTAURANT" ? mailLocale(t.restaurant?.locale) : "en",
      kind: t.kind, name: t.user.fullName, service: t.restaurant?.name ?? "the Kiosk platform admin", link, hours: TTL_HOURS[t.kind],
    });
    try {
      await this.mailer.send({ to: t.user.email, ...mail });
      return { sent: true };
    } catch (e) {
      this.logger.error(`Could not email ${t.kind.toLowerCase()} to ${t.user.email}: ${e instanceof Error ? e.message : String(e)}`);
      return { sent: false, error: e instanceof MailNotConfiguredError ? e.message : `The email could not be sent (${(e instanceof Error ? e.message : String(e)).slice(0, 160)}).` };
    }
  }

  /** What the "choose your password" page shows before the person types anything. Does not use the link up. */
  async preview(realm: TokenRealm, token: string) {
    const valid = await this.tokens.peek(token, realm);
    if (!valid) throw new BadRequestException(INVALID);
    if (realm === "PLATFORM") {
      const u = await this.prisma.platformUser.findUnique({ where: { id: valid.userId }, select: { email: true, fullName: true, isActive: true } });
      if (!u || !u.isActive) throw new BadRequestException(INVALID);
      return { email: u.email, name: u.fullName, kind: valid.kind, service: "Platform admin", slug: null as string | null };
    }
    const u = await this.prisma.restaurantUser.findFirst({ where: { id: valid.userId, restaurantId: valid.restaurantId ?? "" }, select: { email: true, fullName: true, isActive: true } });
    const r = valid.restaurantId ? await this.prisma.restaurant.findUnique({ where: { id: valid.restaurantId }, select: { name: true, slug: true } }) : null;
    if (!u || !u.isActive || !r) throw new BadRequestException(INVALID);
    return { email: u.email, name: u.fullName, kind: valid.kind, service: r.name, slug: r.slug as string | null };
  }

  /**
   * Sets the person's own password and uses the link up, in one step. Everything they were signed in with before ends
   * (a reset is often because an account was at risk) and any lock-out is cleared.
   */
  async accept(realm: TokenRealm, token: string, password: string, req?: Request) {
    const valid = await this.tokens.peek(token, realm);
    if (!valid) throw new BadRequestException(INVALID);
    const passwordHash = await this.passwords.hash(password);
    const now = new Date();

    const who = await this.prisma.$transaction(async (tx) => {
      // The one write that decides a race: of two people opening the same link, only one gets count 1.
      const used = await tx.accountToken.updateMany({ where: { id: valid.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (used.count !== 1) throw new BadRequestException(INVALID);

      if (realm === "PLATFORM") {
        const u = await tx.platformUser.findUnique({ where: { id: valid.userId }, select: { id: true, email: true, isActive: true } });
        if (!u || !u.isActive) throw new BadRequestException(INVALID);
        await tx.platformUser.update({ where: { id: u.id }, data: { passwordHash, passwordSetAt: now, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } });
        await tx.platformSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } });
        return { id: u.id, email: u.email, slug: null as string | null, restaurantId: null as string | null };
      }
      const restaurantId = valid.restaurantId!;
      const u = await tx.restaurantUser.findFirst({ where: { id: valid.userId, restaurantId }, select: { id: true, email: true, isActive: true } });
      const r = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
      if (!u || !u.isActive || !r) throw new BadRequestException(INVALID);
      await tx.restaurantUser.updateMany({ where: { id: u.id, restaurantId }, data: { passwordHash, passwordSetAt: now, failedLoginCount: 0, lockedUntil: null } });
      await tx.restaurantSession.updateMany({ where: { restaurantId, userId: u.id, revokedAt: null }, data: { revokedAt: now } });
      return { id: u.id, email: u.email, slug: r.slug as string | null, restaurantId };
    });

    if (realm === "PLATFORM") this.directory.invalidate(who.id);
    await this.audit.record(
      {
        restaurantId: who.restaurantId, actorType: realm === "PLATFORM" ? "PLATFORM_USER" : "RESTAURANT_USER", actorId: who.id,
        action: `${realm === "PLATFORM" ? "platform_user" : "restaurant_user"}.${valid.kind === "INVITE" ? "invite_accepted" : "password_reset_completed"}`,
        entityType: realm === "PLATFORM" ? "PlatformUser" : "RestaurantUser", entityId: who.id,
      },
      req,
    );
    return { email: who.email, slug: who.slug };
  }
}
