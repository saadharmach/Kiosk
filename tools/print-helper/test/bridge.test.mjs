import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { describe, it } from "node:test";
import { allowedTarget, isLocalAddress, runOnTill, startBridge } from "../src/bridge.mjs";
import { resolveSettings, withBridge } from "../src/config.mjs";

const job = (url = "http://192.168.0.106:3063/soap/ITPAPIPOS") => ({ id: "j1", url, soapAction: "urn:x#Ping", body: "<Ping/>", timeoutMs: 5000 });

describe("the bridge only talks to the restaurant's own network", () => {
  it("knows local addresses from internet ones", () => {
    for (const h of ["192.168.0.106", "10.0.0.5", "172.16.3.4", "172.31.255.1", "127.0.0.1", "UNTILL-PC", "till.local", "::1", "fd12::1"]) assert.equal(isLocalAddress(h), true, h);
    for (const h of ["84.247.188.58", "8.8.8.8", "172.32.0.1", "testapi.untill.com", "example.com", "2001:db8::1"]) assert.equal(isLocalAddress(h), false, h);
  });

  it("refuses a call to the internet unless that host is listed in the settings", () => {
    assert.equal(allowedTarget("http://192.168.0.106:3063/soap").ok, true);
    assert.equal(allowedTarget("http://evil.example.com/x").ok, false);
    assert.equal(allowedTarget("http://testapi.untill.com:3063/soap", ["testapi.untill.com"]).ok, true);
    assert.equal(allowedTarget("file:///etc/passwd").ok, false);
  });

  it("a refused call is never sent: the server gets the reason", async () => {
    let sent = false;
    const r = await runOnTill(job("http://8.8.8.8/x"), { fetchImpl: async () => { sent = true; } });
    assert.equal(sent, false);
    assert.equal(r.ok, false);
    assert.match(r.error, /not on the restaurant's network/);
  });
});

describe("running a call on the till", () => {
  it("sends the SOAP request as it came and returns the till's answer, compressed", async () => {
    let seen;
    const r = await runOnTill(job(), {
      fetchImpl: async (url, init) => { seen = { url, init }; return new Response("<PingResponse/>", { status: 200, statusText: "OK" }); },
    });
    assert.equal(seen.url, "http://192.168.0.106:3063/soap/ITPAPIPOS");
    assert.equal(seen.init.headers.SOAPAction, '"urn:x#Ping"');
    assert.equal(seen.init.body, "<Ping/>");
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.equal(gunzipSync(Buffer.from(r.textGzipBase64, "base64")).toString(), "<PingResponse/>");
  });

  it("a till that is off is explained in words staff understand", async () => {
    const r = await runOnTill(job(), { fetchImpl: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); } });
    assert.equal(r.ok, false);
    assert.match(r.error, /refused the connection: is unTill running, and TP-API switched on\?/);
  });
});

describe("the bridge loop", () => {
  it("asks the server for calls, runs them on the till and sends each answer back", async () => {
    const posted = [];
    let asked = 0;
    const fetchImpl = async (url, init) => {
      if (url.includes("/bridge/next")) {
        asked++;
        assert.equal(init.headers.Authorization, "Bearer tbr_secret");
        const jobs = asked === 1 ? [job()] : [];
        if (asked > 1) await new Promise((r) => setTimeout(r, 50));
        return new Response(JSON.stringify({ jobs }), { status: 200 });
      }
      posted.push({ url, body: JSON.parse(init.body) });
      return new Response("{}", { status: 200 });
    };
    const bridge = startBridge({
      apiUrl: "https://api.example/", token: "tbr_secret", log: () => {}, fetchImpl,
      tillFetchImpl: async () => new Response("<PingResponse/>", { status: 200 }),
    });
    for (let i = 0; i < 50 && posted.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    await bridge.stop();
    assert.equal(posted.length, 1);
    assert.equal(posted[0].url, "https://api.example/api/bridge/jobs/j1/result");
    assert.equal(posted[0].body.ok, true);
  });
});

describe("the settings file", () => {
  it("keeps bridges next to printers, and setting the bridge up again replaces its secret", () => {
    let v = withBridge({ apiUrl: "https://a", printers: [{ id: "p1", label: "P", token: "pht_1" }] }, { id: "b1", label: "Till", token: "tbr_1" });
    v = withBridge(v, { id: "b1", label: "Till", token: "tbr_2" });
    const s = resolveSettings(v, {});
    assert.deepEqual(s.printers.map((p) => p.id), ["p1"]);
    assert.deepEqual(s.bridges, [{ id: "b1", label: "Till", token: "tbr_2" }]);
    assert.deepEqual(s.allowTillHosts, []);
  });
});
