import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

export type AccessTokenPayload = {
  sub: string;
  role: string;
  type: "platform";
};

const secret = new TextEncoder().encode(env.JWT_SECRET);

@Injectable()
export class TokenService {
  async signAccessToken(userId: string, role: string): Promise<string> {
    return new SignJWT({ role, type: "platform" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MIN}m`)
      .sign(secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== "platform" || !payload.sub) throw new Error("wrong token type");
    return { sub: payload.sub, role: String(payload.role), type: "platform" };
  }

  /** Opaque refresh token. Only its hash is stored. */
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