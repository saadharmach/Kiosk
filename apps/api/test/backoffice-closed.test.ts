import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { RestaurantAuthService } from "../src/restaurant-auth/restaurant-auth.service.js";
import { SubscriptionsService } from "../src/admin/subscriptions.service.js";

const R = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
const day = (n: number) => new Date(today.getTime() + n * DAY);

/** A restaurant, one staff member whose password is "right", and its subscription periods. */
function setup(opts: { close: boolean; periods: { startsOn: Date; endsOn: Date; cancelledAt?: Date | null }[] }) {
  const restaurant = { id: R, slug: "resto-a", name: "Resto A", status: "ACTIVE", timezone: "UTC", closeBackofficeWhenEnded: opts.close };
  const user = { id: "u1", restaurantId: R, email: "staff@resto-a.ma", role: "OWNER", isActive: true, passwordHash: "h", failedLoginCount: 0, lockedUntil: null };
  const sessions: any[] = [{ id: "s1", tokenHash: "hash:old", restaurantId: R, userId: "u1", revokedAt: null, expiresAt: day(30), user: { ...user, restaurant } }];
  const periods = opts.periods.map((p) => ({ restaurantId: R, cancelledAt: null, ...p }));
  const prisma: any = {
    restaurant: { findUnique: async (a: any) => (a.where.slug === "resto-a" ? restaurant : null) },
    restaurantUser: { findUnique: async () => user, update: async () => user },
    restaurantSession: {
      findUnique: async (a: any) => sessions.find((s) => s.tokenHash === a.where.tokenHash) ?? null,
      create: async (a: any) => { const s = { id: `s${sessions.length + 1}`, ...a.data, revokedAt: null }; sessions.push(s); return { id: s.id }; },
      update: async (a: any) => Object.assign(sessions.find((s) => s.id === a.where.id), a.data),
      updateMany: async (a: any) => {
        for (const s of sessions) if (s.id === a.where.id && s.restaurantId === a.where.restaurantId && !s.revokedAt) Object.assign(s, a.data);
        return { count: 1 };
      },
    },
    subscriptionPeriod: {
      findFirst: async ({ where: w }: any) => periods.find((p) => p.restaurantId === w.restaurantId && p.cancelledAt === w.cancelledAt
        && p.startsOn <= w.startsOn.lte && p.endsOn >= w.endsOn.gte) ?? null,
    },
  };
  const passwords: any = { verify: async (_h: string, plain: string) => plain === "right" };
  const tokens: any = {
    hashRefreshToken: (t: string) => `hash:${t}`,
    createRefreshToken: () => ({ token: "new", tokenHash: "hash:new", expiresAt: day(30) }),
    signRestaurantAccessToken: async () => "access",
  };
  return { svc: new RestaurantAuthService(prisma, passwords, tokens), sessions };
}

const running = [{ startsOn: day(-10), endsOn: day(10) }];
const over = [{ startsOn: day(-40), endsOn: day(-1) }];

describe("closing the back office when the subscription has ended", () => {
  it("left open (the default): staff still sign in after the end", async () => {
    const { svc } = setup({ close: false, periods: over });
    assert.equal((await svc.login("resto-a", "staff@resto-a.ma", "right", {})).accessToken, "access");
  });

  it("closed: sign-in is refused with a clear message, and no session is made", async () => {
    const { svc, sessions } = setup({ close: true, periods: over });
    await assert.rejects(svc.login("resto-a", "staff@resto-a.ma", "right", {}), (e: unknown) =>
      e instanceof ForbiddenException && /subscription has ended, so the back office is closed/.test((e as Error).message));
    assert.equal(sessions.length, 1);
  });

  it("closed, but a period is running (including its last day): staff sign in", async () => {
    assert.equal((await setup({ close: true, periods: running }).svc.login("resto-a", "staff@resto-a.ma", "right", {})).accessToken, "access");
    const lastDay = [{ startsOn: day(-10), endsOn: day(0) }];
    assert.equal((await setup({ close: true, periods: lastDay }).svc.login("resto-a", "staff@resto-a.ma", "right", {})).accessToken, "access");
  });

  it("a cancelled period does not keep it open", async () => {
    const { svc } = setup({ close: true, periods: [{ startsOn: day(-10), endsOn: day(10), cancelledAt: new Date() }] });
    await assert.rejects(svc.login("resto-a", "staff@resto-a.ma", "right", {}), ForbiddenException);
  });

  it("a wrong password learns nothing about the subscription", async () => {
    const { svc } = setup({ close: true, periods: over });
    await assert.rejects(svc.login("resto-a", "staff@resto-a.ma", "wrong", {}), (e: unknown) =>
      e instanceof UnauthorizedException && (e as Error).message === "Invalid credentials");
  });

  it("someone already signed in: the session is not renewed and is ended", async () => {
    const { svc, sessions } = setup({ close: true, periods: over });
    await assert.rejects(svc.refresh("old", {}), ForbiddenException);
    assert.ok(sessions[0].revokedAt, "the old session is ended");
    assert.equal(sessions.length, 1, "no new session");
  });

  it("someone already signed in while a period runs: renewed as usual", async () => {
    const { svc, sessions } = setup({ close: true, periods: running });
    assert.equal((await svc.refresh("old", {})).accessToken, "access");
    assert.equal(sessions.length, 2);
  });
});

describe("the platform team chooses it per restaurant", () => {
  function admin(close: boolean) {
    const r = { id: R, timezone: "UTC", currency: "MAD", closeBackofficeWhenEnded: close };
    const writes: any[] = [];
    const audits: any[] = [];
    const prisma: any = {
      restaurant: {
        findUnique: async () => ({ ...r }),
        updateMany: async (a: any) => { writes.push(a); Object.assign(r, a.data); return { count: 1 }; },
      },
      subscriptionPeriod: { findMany: async () => [] },
    };
    return { svc: new SubscriptionsService(prisma, { record: async (e: any) => { audits.push(e); } } as never), writes, audits };
  }

  it("switches it on, scoped to that restaurant, and records it in the audit log", async () => {
    const { svc, writes, audits } = admin(false);
    const v = await svc.setCloseBackoffice(R, true, { id: "admin-1" });
    assert.equal(v.closeBackofficeWhenEnded, true);
    assert.deepEqual(writes[0].where, { id: R });
    assert.equal(audits[0].action, "subscription.backoffice_rule_changed");
    assert.deepEqual([audits[0].before, audits[0].after], [{ closeBackofficeWhenEnded: false }, { closeBackofficeWhenEnded: true }]);
  });

  it("choosing what is already set changes nothing and logs nothing", async () => {
    const { svc, writes, audits } = admin(true);
    await svc.setCloseBackoffice(R, true, { id: "admin-1" });
    assert.equal(writes.length + audits.length, 0);
  });
});
