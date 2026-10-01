import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

export type TokenRealm = "PLATFORM" | "RESTAURANT";
export type TokenKind = "INVITE" | "RESET";

/** How long a link works. A reset is shorter: someone is waiting, and it is more sensitive. */
export const TTL_HOURS: Record<TokenKind, number> = { INVITE: 72, RESET: 24 };

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface ValidToken { id: string; kind: TokenKind; userId: string; restaurantId: string | null }

/**
 * Single-use links emailed to people. The token itself is 256 random bits and exists only in the email; the database
 * holds its SHA-256, so a copy of the database cannot be used to take over an account.
 */
@Injectable()
export class AccountTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Makes a new link for this person and cancels any earlier ones that were never used. */
  async issue(args: { realm: TokenRealm; kind: TokenKind; userId: string; restaurantId?: string | null }, now = Date.now()) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now + TTL_HOURS[args.kind] * 3_600_000);
    await this.prisma.$transaction([
      this.prisma.accountToken.updateMany({
        where: { realm: args.realm, userId: args.userId, usedAt: null, expiresAt: { gt: new Date(now) } },
        data: { expiresAt: new Date(now) },
      }),
      this.prisma.accountToken.create({
        data: { realm: args.realm, kind: args.kind, userId: args.userId, restaurantId: args.restaurantId ?? null, tokenHash: hashToken(token), expiresAt },
      }),
    ]);
    return { token, expiresAt };
  }

  /** Looks the link up without using it. Null for anything not valid: unknown, used, expired, or the wrong realm. */
  async peek(token: string, realm: TokenRealm, now = Date.now()): Promise<ValidToken | null> {
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
    const row = await this.prisma.accountToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.realm !== realm || row.usedAt !== null || row.expiresAt.getTime() <= now) return null;
    return { id: row.id, kind: row.kind as TokenKind, userId: row.userId, restaurantId: row.restaurantId };
  }
}
