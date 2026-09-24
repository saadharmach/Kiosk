import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "../auth/password.service.js";
import { TokenService } from "../auth/token.service.js";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export type SessionContext = { userAgent?: string; ipAddress?: string };

@Injectable()
export class RestaurantAuthService {
  private readonly logger = new Logger(RestaurantAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async login(slug: string, email: string, password: string, ctx: SessionContext) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug } });
    const user = restaurant
      ? await this.prisma.restaurantUser.findUnique({
          where: { restaurantId_email: { restaurantId: restaurant.id, email: email.toLowerCase() } },
        })
      : null;

    const passwordOk = await this.passwords.verify(user?.passwordHash ?? DUMMY_HASH, password);

    if (!restaurant || restaurant.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials");
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account temporarily locked. Try again later.");
    }

    if (!passwordOk) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.restaurantUser.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      this.logger.warn(`Failed login ${slug}/${email} (${failed}/${MAX_FAILED})`);
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.restaurantUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issue(user.id, user.role, restaurant.id, restaurant.slug, ctx);
  }

  async refresh(refreshToken: string | undefined, ctx: SessionContext) {
    if (!refreshToken) throw new UnauthorizedException("Session expired");
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.restaurantSession.findUnique({
      where: { tokenHash },
      include: { user: { include: { restaurant: true } } },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.user.isActive ||
      session.user.restaurant.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException("Session expired");
    }

    const next = await this.issue(
      session.userId,
      session.user.role,
      session.restaurantId,
      session.user.restaurant.slug,
      ctx,
    );
    await this.prisma.restaurantSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date(), replacedById: next.sessionId },
    });
    return next;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.restaurantSession.updateMany({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string, restaurantId: string) {
    const user = await this.prisma.restaurantUser.findFirst({
      where: { id: userId, restaurantId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        lastLoginAt: true,
        restaurant: { select: { id: true, slug: true, name: true, currency: true, timezone: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async issue(
    userId: string,
    role: string,
    restaurantId: string,
    slug: string,
    ctx: SessionContext,
  ) {
    const { token, tokenHash, expiresAt } = this.tokens.createRefreshToken();
    const session = await this.prisma.restaurantSession.create({
      data: { userId, restaurantId, tokenHash, expiresAt, userAgent: ctx.userAgent, ipAddress: ctx.ipAddress },
      select: { id: true },
    });
    return {
      sessionId: session.id,
      accessToken: await this.tokens.signRestaurantAccessToken(userId, role, restaurantId, slug),
      refreshToken: token,
      refreshExpiresAt: expiresAt,
    };
  }
}