import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, it } from "node:test";
import { TpapiClient } from "@kiosk/tpapi";
import { TillBridgeService, type BridgeConn } from "../src/bridge/till-bridge.service.js";
import { TpapiClientFactory } from "../src/common/tpapi-client.factory.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const gz = (s: string) => gzipSync(Buffer.from(s)).toString("base64");

function setup() {
  const writes: any[] = [];
  const prisma: any = { tpapiConnection: { updateMany: async (a: any) => { writes.push(a); return { count: 1 }; } } };
  return { svc: new TillBridgeService(prisma), writes };
}
const conn = (restaurantId = A): BridgeConn => ({ id: `c-${restaurantId}`, restaurantId, bridgeLastSeenAt: null });
const call = { url: "http://192.168.0.106:3063/soap/ITPAPIPOS", soapAction: "urn:x#Ping", body: "<Ping/>", timeoutMs: 5000 };

describe("a call for a till behind the bridge", () => {
  it("is refused at once when the bridge is not running (no waiting for a timeout)", async () => {
    const { svc } = setup();
    await assert.rejects(svc.send(A, call), /bridge at the restaurant is not running/);
  });

  it("goes to the bridge that is waiting, and the till's answer comes back to the caller", async () => {
    const { svc } = setup();
    const waiting = svc.next(conn(), 5000);          // the bridge is asking (it marks itself online first)
    await new Promise((r) => setImmediate(r));
    const answer = svc.send(A, call);
    const { jobs } = await waiting;
    assert.equal(jobs.length, 1);
    assert.deepEqual({ url: jobs[0]!.url, soapAction: jobs[0]!.soapAction, body: jobs[0]!.body }, { url: call.url, soapAction: call.soapAction, body: call.body });
    svc.reply(conn(), jobs[0]!.id, { ok: true, status: 200, textGzipBase64: gz("<PingResponse/>") });
    assert.deepEqual(await answer, { status: 200, statusText: "", text: "<PingResponse/>" });
  });

  it("a problem at the restaurant reaches the caller as an error", async () => {
    const { svc } = setup();
    await svc.next(conn(), 0);
    const answer = svc.send(A, call);
    const { jobs } = await svc.next(conn(), 0);
    svc.reply(conn(), jobs[0]!.id, { ok: false, error: "The till at 192.168.0.106:3063 refused the connection" });
    await assert.rejects(answer, /At the restaurant: The till at 192\.168\.0\.106:3063 refused/);
  });

  it("another restaurant's bridge never sees or answers this restaurant's calls", async () => {
    const { svc } = setup();
    await svc.next(conn(A), 0);
    await svc.next(conn(B), 0);
    const answer = svc.send(A, call);
    assert.deepEqual((await svc.next(conn(B), 0)).jobs, [], "B gets nothing");
    const { jobs } = await svc.next(conn(A), 0);
    svc.reply(conn(B), jobs[0]!.id, { ok: true, status: 200, textGzipBase64: gz("<forged/>") }); // ignored
    svc.reply(conn(A), jobs[0]!.id, { ok: true, status: 200, textGzipBase64: gz("<real/>") });
    assert.equal((await answer).text, "<real/>");
  });

  it("a bridge that takes the call but never answers: the caller gets an error after the call's time plus the trip", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { svc } = setup();
    await svc.next(conn(), 0);
    const answer = svc.send(A, { ...call, timeoutMs: 1000 });
    const caught = answer.catch((e: Error) => e);
    t.mock.timers.tick(11_001);
    assert.match(String(await caught), /did not answer within 11 s/);
  });

  it("is marked online by asking, and offline a minute after it stops asking; the sign of life is written to the database sparingly, scoped", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-13T12:00:00Z") });
    const { svc, writes } = setup();
    await svc.next(conn(), 0);
    await svc.next(conn(), 0);
    assert.equal(svc.isOnline(A), true);
    assert.equal(writes.length, 1, "asked twice in a row: written once");
    assert.deepEqual(writes[0].where, { id: `c-${A}`, restaurantId: A });
    t.mock.timers.tick(61_000);
    assert.equal(svc.isOnline(A), false);
  });
});

describe("setting the bridge up", () => {
  function pairing(row: any) {
    const updates: any[] = [];
    const prisma: any = {
      tpapiConnection: {
        findUnique: async (a: any) => (a.where.bridgePairingCodeHash === row.bridgePairingCodeHash ? row : null),
        updateMany: async (a: any) => {
          updates.push(a);
          const w = a.where;
          const hit = w.id === row.id && w.restaurantId === row.restaurantId && w.bridgePairingCodeHash === row.bridgePairingCodeHash && row.bridgePairingExpiresAt > w.bridgePairingExpiresAt.gt;
          if (hit) Object.assign(row, a.data);
          return { count: hit ? 1 : 0 };
        },
      },
      restaurant: { findUniqueOrThrow: async () => ({ name: "List" }) },
    };
    return { svc: new TillBridgeService(prisma), updates };
  }

  it("trades a valid code once for a secret, and only the secret's hash is kept", async () => {
    const row = { id: "c1", restaurantId: A, host: "192.168.0.106", port: 3063, bridgePairingCodeHash: sha("K7QF92XM"), bridgePairingExpiresAt: new Date(Date.now() + 60_000) };
    const { svc } = pairing(row);
    const r = await svc.redeemPairingCode("k7qf-92xm");
    assert.match(r.token, /^tbr_/);
    assert.deepEqual([r.tillHost, r.tillPort, r.label], ["192.168.0.106", 3063, "List - till"]);
    assert.equal((row as any).bridgeTokenHash, sha(r.token));
    await assert.rejects(svc.redeemPairingCode("K7QF-92XM"), /not valid/, "used up");
  });

  it("an expired code gets the same answer as a wrong one", async () => {
    const row = { id: "c1", restaurantId: A, host: "h", port: 1, bridgePairingCodeHash: sha("K7QF92XM"), bridgePairingExpiresAt: new Date(Date.now() - 1000) };
    const { svc } = pairing(row);
    await assert.rejects(svc.redeemPairingCode("K7QF-92XM"), /not valid/);
    await assert.rejects(svc.redeemPairingCode("AAAA-BBBB"), /not valid/);
  });
});

describe("which way a call to the till goes", () => {
  function factory(route: "DIRECT" | "BRIDGE") {
    const used: string[] = [];
    const prisma: any = { tpapiConnection: { findUnique: async () => ({ isEnabled: true, route, host: "192.168.0.106", port: 3063, useTls: false, soapPath: "/soap/ITPAPIPOS", timeoutMs: 15000, appName: "K", credentialsCiphertext: "c", credentialsIv: "i", credentialsAuthTag: "t" }) } };
    const crypto: any = { openJson: () => ({ userName: "u", password: "p", appToken: "" }) };
    const bridges: any = { transport: (id: string) => async () => { used.push(id); return { status: 200, statusText: "OK", text: "<Envelope><Body><PingResponse><return><ReturnCode>0</ReturnCode></return></PingResponse></Body></Envelope>" }; } };
    return { f: new TpapiClientFactory(prisma, crypto, bridges), used };
  }

  it("a restaurant set to BRIDGE: every call goes through its bridge", async () => {
    const { f, used } = factory("BRIDGE");
    const { client } = await f.forRestaurant(A);
    assert.ok(client instanceof TpapiClient);
    await client.ping();
    assert.deepEqual(used, [A]);
  });

  it("a restaurant set to DIRECT never touches the bridge", async () => {
    const { f, used } = factory("DIRECT");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as never;
    try {
      const { client } = await f.forRestaurant(A);
      await client.ping();
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.deepEqual(used, []);
  });
});
