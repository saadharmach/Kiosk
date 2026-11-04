import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { readConfigFile, resolveSettings, writeConfigFile } from "../src/config.mjs";
import { startUi } from "../src/ui.mjs";

const dirs = [];
const uis = [];
after(async () => { for (const u of uis) await u.close(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

async function setup(deps = {}, initial = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ui-")); dirs.push(dir);
  const configPath = path.join(dir, "helper.config.json");
  writeConfigFile(configPath, initial);
  let reloads = 0;
  const supervisor = { reload: async () => { reloads++; }, entries: () => [{ key: "bridge:b1", kind: "bridge", label: "Till", state: { api: "ok", till: "ok" } }] };
  const ui = await startUi({ port: 0, supervisor, configPath, defaultApiUrl: "https://backoffice.example", version: "t", log: () => {}, deps: { canReachImpl: async () => ({ ok: true }), requestTestImpl: async () => {}, ...deps } });
  uis.push(ui);
  return { ui, configPath, reloads: () => reloads };
}

/** A raw request, so the Host and Origin headers can be set as a browser (or an attacker) would. */
function call(port, { method = "GET", p = "/", host = `127.0.0.1:${port}`, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers: { Host: host, ...headers } }, (res) => {
      let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(t); } catch { return t; } })() }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}
const json = { "Content-Type": "application/json" };
const bad400 = () => async () => { throw Object.assign(new Error("not valid"), { status: 400 }); };

describe("the app's page", () => {
  it("shows the state, with the server address to use by default", async () => {
    const { ui } = await setup();
    const r = await call(ui.port, { p: "/api/state" });
    assert.equal(r.status, 200);
    assert.equal(r.json.apiUrl, "https://backoffice.example");
    assert.equal(r.json.entries[0].label, "Till");
  });

  it("a printer's code adds the printer, saves it and reloads the helper", async () => {
    const { ui, configPath, reloads } = await setup({ pairImpl: async () => ({ token: "pht_1", printerId: "p1", label: "Borne 1", host: "192.168.1.50", port: 9100 }) });
    const r = await call(ui.port, { method: "POST", p: "/api/add", headers: json, body: { code: "K7QF-92XM", apiUrl: "https://bo.example/" } });
    assert.equal(r.status, 200);
    assert.equal(r.json.kind, "printer");
    const s = resolveSettings(readConfigFile(configPath).values, {});
    assert.equal(s.apiUrl, "https://bo.example");
    assert.deepEqual(s.printers.map((p) => p.token), ["pht_1"]);
    assert.equal(reloads(), 1);
  });

  it("a code that is not a printer's is tried as the till bridge's", async () => {
    const { ui, configPath } = await setup({ pairImpl: bad400(), pairBridgeImpl: async () => ({ token: "tbr_1", bridgeId: "b1", label: "List - till", tillHost: "192.168.0.106", tillPort: 3063 }) });
    const r = await call(ui.port, { method: "POST", p: "/api/add", headers: json, body: { code: "K7QF-92XM", apiUrl: "https://bo.example" } });
    assert.equal(r.json.kind, "bridge");
    assert.deepEqual(resolveSettings(readConfigFile(configPath).values, {}).bridges.map((b) => b.token), ["tbr_1"]);
  });

  it("a code that is neither says so in words", async () => {
    const { ui } = await setup({ pairImpl: bad400(), pairBridgeImpl: bad400() });
    const r = await call(ui.port, { method: "POST", p: "/api/add", headers: json, body: { code: "AAAA-BBBB", apiUrl: "https://bo.example" } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /not valid: it may be mistyped, used already, or older than 15 minutes/);
  });

  it("only this computer, and only this page, can use it", async () => {
    const { ui } = await setup({ pairImpl: async () => assert.fail("must not pair") });
    assert.equal((await call(ui.port, { p: "/api/state", host: "evil.example" })).status, 403, "another name pointing here (DNS rebinding)");
    assert.equal((await call(ui.port, { method: "POST", p: "/api/add", headers: { "Content-Type": "text/plain" }, body: "{}" })).status, 403, "a form from another site");
    assert.equal((await call(ui.port, { method: "POST", p: "/api/add", headers: { ...json, Origin: "https://evil.example" }, body: {} })).status, 403, "a script from another site");
  });

  it("removes a printer or the bridge from this computer", async () => {
    const { ui, configPath } = await setup({}, { apiUrl: "https://a", printers: [{ id: "p1", label: "P", token: "pht_1" }], bridges: [{ id: "b1", label: "T", token: "tbr_1" }] });
    await call(ui.port, { method: "POST", p: "/api/remove", headers: json, body: { key: "bridge:b1" } });
    const s = resolveSettings(readConfigFile(configPath).values, {});
    assert.deepEqual([s.printers.length, s.bridges.length], [1, 0]);
  });
});
