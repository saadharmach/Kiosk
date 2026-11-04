import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { webcrypto } from "node:crypto";
import { newId } from "../src/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("a new order id on a page that is not https (the kiosk opened by the PC's address)", () => {
  it("works when crypto.randomUUID does not exist, and is a valid v4 UUID", () => {
    const insecure = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } as Pick<Crypto, "getRandomValues">;
    for (let i = 0; i < 200; i++) assert.match(newId(insecure), V4);
  });
  it("never repeats", () => {
    const insecure = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } as Pick<Crypto, "getRandomValues">;
    assert.equal(new Set(Array.from({ length: 2000 }, () => newId(insecure))).size, 2000);
  });
  it("uses the browser's own when it has one", () => {
    assert.equal(newId({ getRandomValues: () => assert.fail("not needed"), randomUUID: () => "from-browser" } as never), "from-browser");
    assert.match(newId(), V4);
  });
});
