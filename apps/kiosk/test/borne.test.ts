import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { api, createOrder } from "../src/lib/api";
import { chooseBorne, readBorne } from "../src/lib/borne";

describe("which borne is this machine", () => {
  it("the one in the address, in capitals", () => {
    assert.equal(chooseBorne("?borne=k2", null), "K2");
    assert.equal(chooseBorne("?x=1&borne=K10", null), "K10");
  });
  it("the address wins over what was remembered, so a machine can be re-assigned", () => {
    assert.equal(chooseBorne("?borne=K3", "K2"), "K3");
  });
  it("without one in the address, the remembered one (a reload, or the plain address)", () => {
    assert.equal(chooseBorne("", "K2"), "K2");
    assert.equal(chooseBorne("?other=1", "k4"), "K4");
  });
  it("nothing at all: no borne, exactly as before bornes existed", () => {
    assert.equal(chooseBorne("", null), null);
  });
  it("junk is never trusted, in the address or in storage: too long, wrong characters, empty", () => {
    for (const bad of ["?borne=TOOLONG", "?borne=K 2", "?borne=%3Cscript%3E", "?borne=", "?borne=../x"]) assert.equal(chooseBorne(bad, null), null, bad);
    assert.equal(chooseBorne("?borne=bad!", "K2"), "K2");   // a bad address falls back to the remembered one
    assert.equal(chooseBorne("", "<b>"), null);
  });
});

describe("remembering it on the machine", () => {
  function fakeStorage(initial: Record<string, string> = {}, blocked = false) {
    const data = { ...initial };
    (globalThis as any).window = { localStorage: {
      getItem: (k: string) => { if (blocked) throw new Error("blocked"); return data[k] ?? null; },
      setItem: (k: string, v: string) => { if (blocked) throw new Error("blocked"); data[k] = v; },
    } };
    return data;
  }
  afterEach(() => { delete (globalThis as any).window; });

  it("stores what the address says, per restaurant, and reads it back later", () => {
    const data = fakeStorage();
    assert.equal(readBorne("chez", "?borne=k2"), "K2");
    assert.deepEqual(data, { "kiosk.borne.chez": "K2" });
    assert.equal(readBorne("chez", ""), "K2");            // later, plain address
    assert.equal(readBorne("other", ""), null);            // another restaurant on the same machine is unaffected
  });
  it("blocked storage never breaks the kiosk: it still works for this visit", () => {
    fakeStorage({}, true);
    assert.equal(readBorne("chez", "?borne=K2"), "K2");
    assert.equal(readBorne("chez", ""), null);
  });
});

describe("the borne goes to the API", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const capture = () => { const seen: { url: string; body?: string }[] = []; globalThis.fetch = (async (url: string, init?: RequestInit) => { seen.push({ url: String(url), body: init?.body as string | undefined }); return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); }) as typeof fetch; return seen; };

  it("the start-up request carries it when there is one, and nothing when there is not", async () => {
    const seen = capture();
    await api.bootstrap("chez", "K2"); await api.bootstrap("chez", null); await api.bootstrap("chez");
    assert.deepEqual(seen.map((s) => s.url), ["/api/kiosk/chez/bootstrap?borne=K2", "/api/kiosk/chez/bootstrap", "/api/kiosk/chez/bootstrap"]);
  });
  it("an order carries its borne code, and no price", async () => {
    const seen = capture();
    await createOrder("chez", { clientOrderId: "x", orderType: "EAT_IN", salesAreaId: "1", borneCode: "K2", lines: [] });
    const body = JSON.parse(seen[0]!.body!);
    assert.equal(body.borneCode, "K2");
    assert.equal("price" in body || "unitPrice" in body, false);
  });
});
