import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuditService } from "../common/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "./password.service.js";
import { PlatformUserDirectory } from "./platform-user-directory.js";
import { TokenService } from "./token.service.js";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type SessionContext = { userAgent?: string; ipAddress?: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly directory: PlatformUserDirectory,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ctx: SessionContext) {
    const user = await this.prisma.platformUser.findUnique({ where: { email: email.toLowerCase() } });

    // Always verify something, so a missing account and a wrong password take the same time.
    const digest = user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const passwordOk = await this.passwords.verify(digest, password);

    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials");

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account temporarily locked. Try again later.");
    }

    if (!passwordOk) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.platformUser.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      this.logger.warn(`Failed login for ${email} (${failed}/${MAX_FAILED})`);
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issueSession(user.id, user.role, ctx);
  }

  /** Rotates the session: the old refresh token is revoked and a new one issued. */
  async refresh(refreshToken: string | undefined, ctx: SessionContext) {
    // No cookie means nobody is signed in: that is a 401, not a crash.
    if (!refreshToken) throw new UnauthorizedException("Session expired");
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.platformSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
      throw new UnauthorizedException("Session expired");
    }

    const next = await this.issueSession(session.userId, session.user.role, ctx);
    await this.prisma.platformSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date(), replacedById: next.sessionId },
    });
    return next;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    await this.prisma.platformSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.platformUser.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true, lastLoginAt: true, mustChangePassword: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /**
   * The person chooses their own password. They must know the current one (a stolen access token alone is not
   * enough), wrong guesses count towards the same lock-out as signing in, every OTHER session is ended, and
   * the one they are using carries on.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string, currentRefreshToken: string | undefined, req?: Request) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new BadRequestException("Too many wrong attempts. Try again later.");
    }

    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.platformUser.update({
        where: { id: user.id },
        data: { failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      throw new BadRequestException("The current password is not right");
    }
    if (newPassword === currentPassword) throw new BadRequestException("The new password must be different from the current one");

    const keep = currentRefreshToken ? this.tokens.hashRefreshToken(currentRefreshToken) : null;
    await this.prisma.$transaction([
      this.prisma.platformUser.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(newPassword), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.platformSession.updateMany({
        where: { userId: user.id, revokedAt: null, ...(keep ? { NOT: { tokenHash: keep } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.directory.invalidate(user.id);

    await this.audit.record(
      { actorType: "PLATFORM_USER", actorId: user.id, action: "platform_user.password_change", entityType: "PlatformUser", entityId: user.id },
      req,
    );
  }

  private async issueSession(userId: string, role: string, ctx: SessionContext) {
    const { token, tokenHash, expiresAt } = this.tokens.createRefreshToken();
    const session = await this.prisma.platformSession.create({
      data: { userId, tokenHash, expiresAt, userAgent: ctx.userAgent, ipAddress: ctx.ipAddress },
      select: { id: true },
    });
    return {
      sessionId: session.id,
      accessToken: await this.tokens.signAccessToken(userId, role),
      refreshToken: token,
      refreshExpiresAt: expiresAt,
    };
  }
}