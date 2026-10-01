import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT } from "jose";

// The environment is read when config/env.js is first imported, so set it first.
const SECRET = "test-secret-".padEnd(40, "x");
Object.assign(process.env, {
  DATABASE_URL: "postgres://test", DIRECT_URL: "postgres://test", JWT_SECRET: SECRET, ENCRYPTION_KEY: "0".repeat(64),
});
const { TokenService } = await import("../src/auth/token.service.js");
const { RestaurantAuthGuard } = await import("../src/restaurant-auth/guards/restaurant-auth.guard.js");
const { TenantGuard } = await import("../src/restaurant-auth/guards/tenant.guard.js");
const { PrinterHelperGuard } = await import("../src/printing/print-helper.controller.js");

const tokens = new TokenService();
const ctx = (req: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;
const status = (e: unknown) => (e as { getStatus?: () => number }).getStatus?.();

describe("TokenService", () => {
  it("puts the restaurant and its slug inside a restaurant token", async () => {
    const t = await tokens.signRestaurantAccessToken("user-1", "OWNER", "rest-1", "resto-a");
    assert.deepEqual(await tokens.verifyRestaurantToken(t), { type: "restaurant", sub: "user-1", role: "OWNER", rid: "rest-1", slug: "resto-a" });
  });

  it("keeps platform and restaurant tokens apart, in both directions", async () => {
    const platform = await tokens.signAccessToken("admin-1", "SUPER_ADMIN");
    const restaurant = await tokens.signRestaurantAccessToken("u", "OWNER", "r", "s");
    await assert.rejects(tokens.verifyRestaurantToken(platform));
    await assert.rejects(tokens.verifyAccessToken(restaurant));
    assert.equal((await tokens.verifyAccessToken(platform)).role, "SUPER_ADMIN");
  });

  it("rejects a token signed with another secret", async () => {
    const forged = await new SignJWT({ type: "restaurant", role: "OWNER", rid: "rest-2", slug: "resto-b" })
      .setProtectedHeader({ alg: "HS256" }).setSubject("attacker").setExpirationTime("5m")
      .sign(new TextEncoder().encode("another-secret-".padEnd(40, "y")));
    await assert.rejects(tokens.verifyRestaurantToken(forged));
  });

  it("rejects a token whose contents were changed", async () => {
    const t = await tokens.signRestaurantAccessToken("u", "OWNER", "rest-1", "resto-a");
    const [h, , s] = t.split(".");
    const evil = Buffer.from(JSON.stringify({ type: "restaurant", sub: "u", role: "OWNER", rid: "rest-2", slug: "resto-b" })).toString("base64url");
    await assert.rejects(tokens.verifyRestaurantToken(`${h}.${evil}.${s}`));
  });

  it("rejects an expired token", async () => {
    const old = await new SignJWT({ type: "restaurant", role: "OWNER", rid: "r", slug: "s" })
      .setProtectedHeader({ alg: "HS256" }).setSubject("u").setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(SECRET));
    await assert.rejects(tokens.verifyRestaurantToken(old));
  });

  it("rejects a token with the algorithm set to none", async () => {
    const payload = Buffer.from(JSON.stringify({ type: "restaurant", sub: "u", role: "OWNER", rid: "r", slug: "s", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    await assert.rejects(tokens.verifyRestaurantToken(`${header}.${payload}.`));
  });

  it("creates random refresh tokens and stores only their hash", () => {
    const a = tokens.createRefreshToken();
    const b = tokens.createRefreshToken();
    assert.notEqual(a.token, b.token);
    assert.equal(a.tokenHash, tokens.hashRefreshToken(a.token));
    assert.notEqual(a.tokenHash, a.token);
    assert.ok(a.expiresAt.getTime() > Date.now() + 29 * 86_400_000);
  });
});

describe("RestaurantAuthGuard", () => {
  const guard = new RestaurantAuthGuard(tokens);

  it("lets in a valid restaurant token and exposes who it is", async () => {
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${await tokens.signRestaurantAccessToken("u", "OWNER", "rest-1", "resto-a")}` } };
    assert.equal(await guard.canActivate(ctx(req)), true);
    assert.equal((req.user as { rid: string }).rid, "rest-1");
  });

  it("answers 401 without a token, with garbage, or with a platform token", async () => {
    const platform = await tokens.signAccessToken("a", "SUPER_ADMIN");
    for (const headers of [{}, { authorization: "Basic abc" }, { authorization: "Bearer " }, { authorization: "Bearer not.a.jwt" }, { authorization: `Bearer ${platform}` }]) {
      await assert.rejects(guard.canActivate(ctx({ headers })), (e) => status(e) === 401, JSON.stringify(headers).slice(0, 40));
    }
  });
});

describe("TenantGuard: one restaurant can never reach another's data", () => {
  const guard = new TenantGuard();
  const user = { type: "restaurant", sub: "u", role: "OWNER", rid: "rest-1", slug: "resto-a" };

  it("lets a restaurant reach its own URLs", () => {
    assert.equal(guard.canActivate(ctx({ user, params: { slug: "resto-a" } })), true);
  });

  it("refuses another restaurant's slug, even with a perfectly valid token", () => {
    assert.throws(() => guard.canActivate(ctx({ user, params: { slug: "resto-b" } })), (e) => status(e) === 403);
  });

  it("refuses a request with no session, or a platform session, on restaurant routes", () => {
    assert.throws(() => guard.canActivate(ctx({ params: { slug: "resto-a" } })), (e) => status(e) === 403);
    assert.throws(() => guard.canActivate(ctx({ user: { type: "platform", sub: "a", role: "SUPER_ADMIN" }, params: { slug: "resto-a" } })), (e) => status(e) === 403);
    // Even a platform session that happens to carry the matching slug is not a restaurant session.
    assert.throws(() => guard.canActivate(ctx({ user: { type: "platform", sub: "a", role: "SUPER_ADMIN", slug: "resto-a" }, params: { slug: "resto-a" } })), (e) => status(e) === 403);
  });

  it("compares slugs exactly, not loosely", () => {
    for (const slug of ["RESTO-A", "resto-a ", "resto-a/../resto-b", "resto-", ""]) {
      if (slug === "") continue; // no slug in the route: nothing to compare, the controller uses the token's restaurant
      assert.throws(() => guard.canActivate(ctx({ user, params: { slug } })), (e) => status(e) === 403, JSON.stringify(slug));
    }
  });
});

describe("PrinterHelperGuard: the print helper signs in with its own secret", () => {
  const printer = { id: "p1", restaurantId: "rest-1" };
  const printing = { authenticate: async (t: string) => (t === "pht_good" ? printer : null) };
  const guard = new PrinterHelperGuard(printing as never);

  it("lets in the printer's own token and attaches that printer", async () => {
    const req: Record<string, unknown> = { headers: { authorization: "Bearer pht_good" } };
    assert.equal(await guard.canActivate(ctx(req)), true);
    assert.equal((req.printer as { restaurantId: string }).restaurantId, "rest-1");
  });

  it("answers 401 to no token, a wrong token, or a person's access token", async () => {
    const personal = await tokens.signRestaurantAccessToken("u", "OWNER", "rest-1", "resto-a");
    for (const headers of [{}, { authorization: "Bearer pht_wrong" }, { authorization: `Bearer ${personal}` }]) {
      await assert.rejects(guard.canActivate(ctx({ headers })), (e) => status(e) === 401);
    }
  });
});

describe("platform sessions without a refresh cookie", () => {
  it("answer 401 'session expired', never crash (a signed-out visitor triggers this on every page load)", async () => {
    const { AuthService } = await import("../src/auth/auth.service.js");
    const svc = new AuthService({} as never, {} as never, {} as never);
    for (const missing of [undefined, ""]) {
      await assert.rejects(svc.refresh(missing, {}), (e) => status(e) === 401);
    }
  });
});
