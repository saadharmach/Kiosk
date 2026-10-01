import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";

// config/env.js reads the environment when first imported.
Object.assign(process.env, {
  DATABASE_URL: "postgres://test", DIRECT_URL: "postgres://test", JWT_SECRET: "test-secret-".padEnd(40, "x"), ENCRYPTION_KEY: "0".repeat(64),
});
const { ROLES_KEY } = await import("../src/auth/decorators/roles.decorator.js");
const { RolesGuard } = await import("../src/auth/guards/roles.guard.js");
const { Reflector } = await import("@nestjs/core");
const { RestaurantsController } = await import("../src/admin/restaurants.controller.js");
const { TpapiConnectionController } = await import("../src/admin/tpapi-connection.controller.js");
const { RestaurantUsersController } = await import("../src/admin/restaurant-users.controller.js");
const { SyncController } = await import("../src/sync/sync.controller.js");
const { OverviewController } = await import("../src/admin/overview.controller.js");
const { ActivityController } = await import("../src/admin/activity.controller.js");

type Ctl = { prototype: Record<string, unknown> };
const METHOD_KEY = "method";   // Nest stores the HTTP verb under this key
const verbOf = (fn: unknown) => Reflect.getMetadata(METHOD_KEY, fn as object) as number | undefined; // 0 GET, 1 POST, 2 PUT, 3 DELETE, 4 PATCH

const handlers = (c: Ctl) =>
  Object.getOwnPropertyNames(c.prototype).filter((n) => n !== "constructor" && typeof c.prototype[n] === "function")
    .map((name) => ({ name, fn: c.prototype[name], verb: verbOf(c.prototype[name]) }))
    .filter((h) => h.verb !== undefined);

describe("who may change things on the platform", () => {
  const controllers: [string, Ctl][] = [
    ["restaurants", RestaurantsController as never],
    ["unTill connection", TpapiConnectionController as never],
    ["restaurant users", RestaurantUsersController as never],
  ];

  for (const [label, ctl] of controllers) {
    it(`${label}: everything that changes data needs SUPER_ADMIN, apart from the connection test`, () => {
      const writes = handlers(ctl).filter((h) => h.verb !== 0);
      assert.ok(writes.length > 0, "found no write handlers: the check itself is broken");
      for (const h of writes) {
        const roles = Reflect.getMetadata(ROLES_KEY, h.fn as object) as string[] | undefined;
        if (label === "unTill connection" && h.name === "test") continue;
        assert.deepEqual(roles, ["SUPER_ADMIN"], `${label}.${h.name}`);
      }
    });
  }

  it("the guard turns a SUPPORT user away from a SUPER_ADMIN route and lets a SUPER_ADMIN in", () => {
    const guard = new RolesGuard(new Reflector());
    const run = (role: string | undefined) => {
      const ctx = {
        getHandler: () => (RestaurantUsersController as never as Ctl).prototype.create,
        getClass: () => RestaurantUsersController,
        switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
      } as never;
      return guard.canActivate(ctx);
    };
    assert.equal(run("SUPER_ADMIN"), true);
    assert.throws(() => run("SUPPORT"));
    assert.throws(() => run(undefined));
  });

  it("running a sync stays open to SUPPORT, since it changes nothing about the restaurant itself", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, (SyncController as never as Ctl).prototype.run as object) as string[];
    assert.deepEqual(roles.sort(), ["SUPER_ADMIN", "SUPPORT"]);
  });

  it("the overview and the activity log only read: they have no way to change anything", () => {
    for (const ctl of [OverviewController, ActivityController] as never as Ctl[]) {
      const hs = handlers(ctl);
      assert.ok(hs.length > 0);
      assert.ok(hs.every((h) => h.verb === 0));
    }
  });
});
