import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiError, api, createOrder, isConnectionError, priceCart, tableInRanges } from "../src/lib/api";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const reply = (status: number, body: unknown, raw = false) => async () =>
  new Response(raw ? (body as string) : JSON.stringify(body), { status, headers: { "Content-Type": raw ? "text/html" : "application/json" } });

describe("the request layer: connection failures", () => {
  it("marks a request that never reached the server as a connection error", async () => {
    globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
    await assert.rejects(api.bootstrap("resto-a"), (e) => { assert.ok(isConnectionError(e)); assert.equal((e as ApiError).status, 0); return true; });
  });

  it("treats a non-JSON 5xx as the API being down (a proxy or gateway answered)", async () => {
    for (const status of [500, 502, 503, 504]) {
      globalThis.fetch = reply(status, "<html>Bad gateway</html>", true);
      await assert.rejects(api.bootstrap("x"), (e) => isConnectionError(e), String(status));
    }
  });

  it("does not treat the API's own JSON errors as a lost connection", async () => {
    globalThis.fetch = reply(500, { statusCode: 500, message: "Internal server error" });
    await assert.rejects(api.bootstrap("x"), (e) => { assert.equal(isConnectionError(e), false); assert.match((e as Error).message, /Internal server error/); return true; });
    globalThis.fetch = reply(400, { message: ["table must be a number"] });
    await assert.rejects(api.bootstrap("x"), (e) => { assert.equal(isConnectionError(e), false); assert.match((e as Error).message, /table must be a number/); return true; });
  });

  it("is false for things that are not API errors", () => {
    assert.equal(isConnectionError(new Error("x")), false);
    assert.equal(isConnectionError(null), false);
    assert.equal(isConnectionError(new ApiError("x", 500)), false);
    assert.equal(isConnectionError(new ApiError("x", 0, "NETWORK")), true);
  });
});

describe("the request layer: what it sends", () => {
  it("posts the cart as JSON, with the language, to the right address, without caching", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = async (url, init) => { seen = { url: String(url), init: init! }; return new Response(JSON.stringify({ total: 4.5 })); };
    await priceCart("resto-a", { orderType: "EAT_IN", salesAreaId: "100", locale: "fr", lines: [{ articleId: "1", quantity: 2 }] });
    assert.equal(seen!.url, "/api/kiosk/resto-a/cart/price");
    assert.equal(seen!.init.method, "POST");
    assert.equal(seen!.init.cache, "no-store");
    assert.deepEqual(JSON.parse(String(seen!.init.body)), { orderType: "EAT_IN", salesAreaId: "100", locale: "fr", lines: [{ articleId: "1", quantity: 2 }] });
  });

  it("never sends a price for an item: only ids and quantities", async () => {
    let body = "";
    globalThis.fetch = async (_u, init) => { body = String(init!.body); return new Response("{}"); };
    await createOrder("resto-a", { clientOrderId: "c", orderType: "EAT_IN", salesAreaId: "1", displayedTotalCents: 450, lines: [{ articleId: "1", quantity: 1, options: [{ optionGroupId: "5", articleId: "6" }] }] });
    const lines = (JSON.parse(body) as { lines: Record<string, unknown>[] }).lines;
    for (const l of lines) assert.deepEqual(Object.keys(l).sort(), ["articleId", "options", "quantity"]);
  });

  it("keeps the API's error code, so a price change can be told apart", async () => {
    globalThis.fetch = reply(409, { code: "PRICES_CHANGED", message: "Prices changed while ordering" });
    await assert.rejects(createOrder("x", { clientOrderId: "c", orderType: "EAT_IN", salesAreaId: "1", lines: [] }), (e) => {
      assert.equal((e as ApiError).code, "PRICES_CHANGED");
      assert.equal((e as ApiError).status, 409);
      return true;
    });
  });
});

describe("tableInRanges", () => {
  const ranges = [{ FromTable: 1, ToTable: 12 }, { fromTable: 701, toTable: 763 }];
  it("accepts tables inside a range, in either casing, including both ends", () => {
    for (const n of [1, 12, 701, 763]) assert.equal(tableInRanges(n, ranges), true, String(n));
  });
  it("rejects everything else, and fails closed on junk", () => {
    for (const n of [0, 13, 700, 764]) assert.equal(tableInRanges(n, ranges), false, String(n));
    assert.equal(tableInRanges(5, [{} as never]), false);
    assert.equal(tableInRanges(5, []), false);
    assert.equal(tableInRanges(Number.NaN, ranges), false);
  });
});
