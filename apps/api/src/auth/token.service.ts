import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

export type PlatformTokenPayload = { type: "platform"; sub: string; role: string };
export type RestaurantTokenPayload = {
  type: "restaurant";
  sub: string;
  role: string;
  /// Restaurant id — the tenant boundary.
  rid: string;
  slug: string;
};
export type TokenPayload = PlatformTokenPayload | RestaurantTokenPayload;

/// Kept for the existing platform imports.
export type AccessTokenPayload = PlatformTokenPayload;

const secret = new TextEncoder().encode(env.JWT_SECRET);

@Injectable()
export class TokenService {
  private sign(sub: string, claims: Record<string, unknown>): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MIN}m`)
      .sign(secret);
  }

  signAccessToken(userId: string, role: string): Promise<string> {
    return this.sign(userId, { role, type: "platform" });
  }

  signRestaurantAccessToken(
    userId: string,
    role: string,
    restaurantId: string,
    slug: string,
  ): Promise<string> {
    return this.sign(userId, { role, type: "restaurant", rid: restaurantId, slug });
  }

  private async decode(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) throw new Error("missing subject");
    if (payload.type === "platform") {
      return { type: "platform", sub: payload.sub, role: String(payload.role) };
    }
    if (payload.type === "restaurant") {
      return {
        type: "restaurant",
        sub: payload.sub,
        role: String(payload.role),
        rid: String(payload.rid),
        slug: String(payload.slug),
      };
    }
    throw new Error("unknown token type");
  }

  async verifyAccessToken(token: string): Promise<PlatformTokenPayload> {
    const p = await this.decode(token);
    if (p.type !== "platform") throw new Error("not a platform token");
    return p;
  }

  async verifyRestaurantToken(token: string): Promise<RestaurantTokenPayload> {
    const p = await this.decode(token);
    if (p.type !== "restaurant") throw new Error("not a restaurant token");
    return p;
  }

  createRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(32).toString("base64url");
    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}