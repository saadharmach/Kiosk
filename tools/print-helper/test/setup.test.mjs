import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readConfigFile, resolveSettings, withPrinter, writeConfigFile } from "../src/config.mjs";
import { canReach, pair } from "../src/pairing.mjs";
import { SERVICE_NAME, installService, systemdUnit, uninstallService, windowsTaskScript } from "../src/service.mjs";
import { runSetup } from "../src/setup.mjs";
import { supervise } from "../src/supervisor.mjs";

const CLI = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const DIR = path.dirname(path.dirname(CLI));
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "helper-")); dirs.push(d); return d; };
const servers = [];
after(async () => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  await Promise.all(servers.map((s) => new Promise((r) => { s.close(r); s.closeAllConnections?.(); })));
});
/** Waits for a condition without a fixed sleep; time is measured with performance.now (the wall clock can jump). */
async function until(cond, ms = 4000) {
  const start = performance.now();
  while (!(await cond())) {
    if (performance.now() - start > ms) assert.fail("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("the settings file", () => {
  it("adds a printer, and pairing the same printer again replaces its secret instead of adding a second", () => {
    let v = withPrinter({ apiUrl: "https://a" }, { id: "p1", label: "One", token: "t1" });
    v = withPrinter(v, { id: "p2", label: "Two", token: "t2" });
    v = withPrinter(v, { id: "p1", label: "One", token: "t1b" });
    assert.deepEqual(v.printers.map((p) => [p.id, p.token]).sort(), [["p1", "t1b"], ["p2", "t2"]]);
    assert.equal(v.apiUrl, "https://a");
  });
  it("is written for its owner only, and a half-written file is never visible", () => {
    const file = path.join(tmp(), "c.json");
    writeConfigFile(file, { apiUrl: "https://a", printers: [] });
    if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["c.json"], "no temporary file is left behind");
    assert.equal(readConfigFile(file).values.apiUrl, "https://a");
  });
  it("a missing file is empty; a broken one is an error that says which file", () => {
    const d = tmp();
    assert.deepEqual(readConfigFile(path.join(d, "none.json")), { file: null, values: {} });
    fs.writeFileSync(path.join(d, "bad.json"), "{nope");
    assert.throws(() => readConfigFile(path.join(d, "bad.json")), /bad\.json is not valid JSON/);
    fs.writeFileSync(path.join(d, "arr.json"), "[]");
    assert.throws(() => readConfigFile(path.join(d, "arr.json")), /JSON object/);
  });
  it("serves the list, still understands the old single token, and the environment wins", () => {
    const s = resolveSettings({ apiUrl: "https://a", token: "old", printers: [{ id: "p1", label: "One", token: "t1" }] }, {});
    assert.deepEqual(s.printers.map((p) => p.token), ["t1", "old"]);
    assert.equal(s.intervalMs, 2000);
    const e = resolveSettings({ apiUrl: "https://a", token: "old" }, { KIOSK_API_URL: "https://b", PRINT_HELPER_TOKEN: "env", POLL_INTERVAL_MS: "500" });
    assert.deepEqual([e.apiUrl, e.printers[0].token, e.intervalMs], ["https://b", "env", 500]);
    // the same secret in both places is one printer, not two loops
    assert.equal(resolveSettings({ apiUrl: "x", token: "t1", printers: [{ id: "p1", token: "t1" }] }, {}).printers.length, 1);
    assert.deepEqual(resolveSettings({ apiUrl: "x", printers: [{ id: "p1" }, null, { token: "" }] }, {}).printers, []);
  });
});

describe("pairing calls", () => {
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });
  it("shows the API's own words when the code is refused", async () => {
    await assert.rejects(pair({ apiUrl: "https://a", code: "X", fetchImpl: reply(400, { message: "This setup code is not valid" }) }), /This setup code is not valid/);
    await assert.rejects(pair({ apiUrl: "https://a", code: "X", fetchImpl: reply(400, { message: ["code must be a string"] }) }), /code must be a string/);
  });
  it("says what is wrong with the address when the API cannot be reached, or is not the API", async () => {
    const down = async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); };
    await assert.rejects(pair({ apiUrl: "https://nope.example/", code: "X", fetchImpl: down }), /Cannot reach the API at https:\/\/nope\.example \(ENOTFOUND\)/);
    await assert.rejects(pair({ apiUrl: "https://a", code: "X", fetchImpl: reply(200, { hello: 1 }) }), /right address/);
  });
  it("posts the code to /api/print/pair, no trailing-slash trouble", async () => {
    let seen;
    await pair({ apiUrl: "https://a/", code: "ABCD-EFGH", fetchImpl: async (url, init) => { seen = [url, init.method, init.body]; return new Response(JSON.stringify({ token: "t", printerId: "p" })); } });
    assert.deepEqual(seen, ["https://a/api/print/pair", "POST", '{"code":"ABCD-EFGH"}']);
  });
  it("can tell whether a printer answers, without sending it anything", async () => {
    const received = [];
    const server = net.createServer((s) => { s.on("data", (d) => received.push(d)); s.on("error", () => {}); });
    servers.push(server);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    assert.deepEqual(await canReach("127.0.0.1", port), { ok: true });
    const dead = net.createServer(); await new Promise((r) => dead.listen(0, "127.0.0.1", r)); const deadPort = dead.address().port; await new Promise((r) => dead.close(r));
    const r = await canReach("127.0.0.1", deadPort);
    assert.equal(r.ok, false);
    assert.match(r.reason, /ECONNREFUSED/);
    assert.equal(Buffer.concat(received).length, 0);
  });
});

describe("start at boot", () => {
  const spec = { node: "/usr/bin/node", cli: "/opt/helper/src/cli.mjs", dir: "/opt/helper" };
  it("the Windows task runs at boot as SYSTEM, restarts itself, logs to a file, and survives a quote in a path", () => {
    const ps = windowsTaskScript({ node: "C:\\Program Files\\nodejs\\node.exe", cli: "C:\\Sam's Kiosk\\src\\cli.mjs", dir: "C:\\Sam's Kiosk" });
    assert.match(ps, /-AtStartup/);
    assert.match(ps, /-User 'SYSTEM'/);
    assert.match(ps, /-RestartCount 999/);
    assert.match(ps, /helper\.log 2>&1/);
    assert.ok(ps.includes("Sam''s Kiosk"), "a single quote is doubled inside PowerShell strings");
    assert.ok(ps.indexOf("Unregister-ScheduledTask") < ps.indexOf("Register-ScheduledTask -TaskName"), "an old task is replaced, not duplicated");
    assert.ok(ps.trim().endsWith("Start-ScheduledTask -TaskName 'Kiosk Print Helper'"));
  });
  it("the systemd unit restarts always and quotes paths with spaces", () => {
    const u = systemdUnit(spec);
    assert.match(u, /ExecStart=\/usr\/bin\/node \/opt\/helper\/src\/cli\.mjs\n/);
    assert.match(u, /Restart=always/);
    assert.match(u, /WantedBy=default\.target/);
    assert.match(systemdUnit({ ...spec, dir: "/opt/my helper", cli: "/opt/my helper/src/cli.mjs" }), /WorkingDirectory="\/opt\/my helper"\nExecStart=\/usr\/bin\/node "\/opt\/my helper\/src\/cli\.mjs"/);
  });
  it("Linux: writes the user unit, reloads, enables and starts it, and asks for linger", () => {
    const home = tmp(); const ran = [];
    const r = installService({ platform: "linux", ...spec, home, user: "sam", run: (f, a) => { ran.push([f, ...a].join(" ")); } });
    assert.equal(r.ok, true);
    assert.ok(fs.existsSync(path.join(home, ".config/systemd/user", `${SERVICE_NAME}.service`)));
    assert.deepEqual(ran, ["systemctl --user daemon-reload", `systemctl --user enable --now ${SERVICE_NAME}.service`, "loginctl enable-linger sam"]);
  });
  it("Linux: no permission for linger is a hint, not a failure; no systemd gives the manual command and never throws", () => {
    const home = tmp();
    const noLinger = installService({ platform: "linux", ...spec, home, user: "sam", run: (f) => { if (f === "loginctl") throw new Error("denied"); } });
    assert.equal(noLinger.ok, true);
    assert.match(noLinger.message, /sudo loginctl enable-linger sam/);
    const noSystemd = installService({ platform: "linux", ...spec, home, run: () => { throw Object.assign(new Error("Failed to connect to bus"), { stderr: "Failed to connect to bus" }); } });
    assert.equal(noSystemd.ok, false);
    assert.match(noSystemd.message, /node \/opt\/helper\/src\/cli\.mjs/);
  });
  it("Windows: runs the script; without administrator rights it says exactly what to do", () => {
    let script;
    const ok = installService({ platform: "win32", ...spec, run: (f, a) => { script = a.at(-1); } });
    assert.equal(ok.ok, true);
    assert.match(script, /Register-ScheduledTask/);
    const denied = installService({ platform: "win32", ...spec, run: () => { throw Object.assign(new Error("failed"), { stderr: "Access is denied" }); } });
    assert.equal(denied.ok, false);
    assert.match(denied.message, /Run as administrator/);
  });
  it("other systems get the manual command", () => {
    const r = installService({ platform: "darwin", ...spec, run: () => assert.fail("must not run anything") });
    assert.equal(r.ok, false);
    assert.match(r.message, /node \/opt\/helper\/src\/cli\.mjs/);
  });
  it("removing deletes the unit file", () => {
    const home = tmp();
    installService({ platform: "linux", ...spec, home, run: () => {} });
    const r = uninstallService({ platform: "linux", home, run: () => {} });
    assert.equal(r.ok, true);
    assert.ok(!fs.existsSync(path.join(home, ".config/systemd/user", `${SERVICE_NAME}.service`)));
  });
});

describe("setup", () => {
  const paired = (n = 1) => ({ token: `pht_${n}`, printerId: `p${n}`, label: `Chez Sam - Borne ${n}`, host: "10.0.0.5", port: 9100 });
  function run(over = {}) {
    const out = []; const calls = [];
    const configPath = over.configPath ?? path.join(tmp(), "helper.config.json");
    const deps = {
      pairImpl: async (a) => { calls.push(["pair", a.apiUrl, a.code]); return paired(over.n); },
      canReachImpl: async () => over.reach ?? { ok: true },
      installImpl: async () => { calls.push(["install"]); return over.service ?? { ok: true, message: "service ok" }; },
      requestTestImpl: async (a) => { calls.push(["test", a.token]); if (over.testFails) throw new Error("boom"); },
      ...over.deps,
    };
    const done = runSetup({ apiUrl: over.apiUrl ?? "https://api.example.com/", code: over.code ?? "ABCD-EFGH", configPath, cli: "/x/cli.mjs", dir: "/x", out: (l) => out.push(l), deps, ...over.opts });
    return { done, out, calls, configPath };
  }
  it("pairs, saves the secret, checks the printer, installs the service and queues the test", async () => {
    const { done, out, calls, configPath } = run();
    assert.equal(await done, 0);
    assert.deepEqual(calls, [["pair", "https://api.example.com", "ABCD-EFGH"], ["install"], ["test", "pht_1"]]);
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.deepEqual(saved.printers, [{ id: "p1", label: "Chez Sam - Borne 1", token: "pht_1" }]);
    assert.equal(saved.apiUrl, "https://api.example.com");
    assert.match(out.at(-1), /^Done\./);
    assert.ok(!out.join("\n").includes("pht_1"), "the secret is never printed");
  });
  it("a second code adds the second borne to the same file and keeps the first", async () => {
    const first = run({ n: 1 }); await first.done;
    const second = run({ n: 2, configPath: first.configPath, code: "WXYZ-2345" }); assert.equal(await second.done, 0);
    const saved = JSON.parse(fs.readFileSync(first.configPath, "utf8"));
    assert.deepEqual(saved.printers.map((p) => p.id), ["p1", "p2"]);
  });
  it("other settings in the file survive", async () => {
    const configPath = path.join(tmp(), "c.json");
    fs.writeFileSync(configPath, JSON.stringify({ apiUrl: "https://old", pollIntervalMs: 500, printers: [] }));
    await run({ configPath }).done;
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(saved.pollIntervalMs, 500);
    assert.equal(saved.apiUrl, "https://api.example.com", "the address just given wins");
  });
  it("a refused code changes nothing and exits 1", async () => {
    const configPath = path.join(tmp(), "c.json");
    const { done, out, calls } = run({ configPath, deps: { pairImpl: async () => { throw new Error("This setup code is not valid"); } } });
    assert.equal(await done, 1);
    assert.ok(!fs.existsSync(configPath));
    assert.match(out.join("\n"), /FAILED: This setup code is not valid/);
    assert.ok(!calls.some((c) => c[0] === "install" || c[0] === "test"));
  });
  it("an unreachable printer, a failed service or a failed test ticket are reported but the pairing stays", async () => {
    const r = run({ reach: { ok: false, reason: "ETIMEDOUT" }, service: { ok: false, message: "no systemd" }, testFails: true });
    assert.equal(await r.done, 0);
    const text = r.out.join("\n");
    assert.match(text, /cannot reach the printer at 10\.0\.0\.5:9100 \(ETIMEDOUT\)/);
    assert.match(text, /no systemd/);
    assert.match(text, /To run the helper now: node \/x\/cli\.mjs/);
    assert.match(text, /Could not queue the test ticket \(boom\)/);
    assert.match(r.out.at(-1), /see the lines marked !!/);
    assert.equal(JSON.parse(fs.readFileSync(r.configPath, "utf8")).printers.length, 1);
  });
  it("--no-service and --no-test skip those steps", async () => {
    const r = run({ opts: { service: false, test: false } }); await r.done;
    assert.deepEqual(r.calls.map((c) => c[0]), ["pair"]);
  });
  it("missing or wrong arguments are explained, and nothing is contacted", async () => {
    for (const o of [{ apiUrl: "", code: "" }, { apiUrl: "api.example.com" }]) {
      const r = run({ ...o, deps: { pairImpl: async () => assert.fail("must not contact the API") } });
      assert.equal(await r.done, 2);
    }
  });
  it("an unreadable settings file stops before using up the code", async () => {
    const configPath = path.join(tmp(), "c.json"); fs.writeFileSync(configPath, "{broken");
    const r = run({ configPath, deps: { pairImpl: async () => assert.fail("the code must not be used") } });
    assert.equal(await r.done, 2);
  });
});

describe("serving several printers from one file", () => {
  function fixture() {
    const configPath = path.join(tmp(), "c.json");
    const started = []; const logs = [];
    const startImpl = (o) => { const h = { token: o.token, stopped: false, stop: async () => { h.stopped = true; }, log: o.log }; started.push(h); return h; };
    const write = (printers, extra = {}) => writeConfigFile(configPath, { apiUrl: "https://a", printers, ...extra });
    const sup = () => supervise({ configPath, log: (l, m) => logs.push(`${l} ${m}`), reloadMs: 15, startImpl });
    return { configPath, started, logs, write, sup };
  }
  const p = (n, token = `t${n}`) => ({ id: `p${n}`, label: `Borne ${n}`, token });

  it("starts one loop per printer, and labels every log line with its printer", async () => {
    const f = fixture(); f.write([p(1), p(2)]);
    const s = f.sup(); await s.ready;
    assert.equal(s.count(), 2);
    f.started[0].log("INFO", "hello");
    assert.ok(f.logs.includes("INFO [Borne 1] hello"));
    await s.stop();
    assert.ok(f.started.every((h) => h.stopped));
  });
  it("a printer added by a later setup starts without restarting the first", async () => {
    const f = fixture(); f.write([p(1)]);
    const s = f.sup(); await s.ready;
    f.write([p(1), p(2)]);
    await until(() => s.count() === 2);
    assert.equal(f.started.length, 2);
    assert.equal(f.started[0].stopped, false);
    await s.stop();
  });
  it("a new secret restarts only that printer; a removed printer stops", async () => {
    const f = fixture(); f.write([p(1), p(2)]);
    const s = f.sup(); await s.ready;
    f.write([p(1), p(2, "t2-new")]);
    await until(() => f.started.length === 3);
    assert.deepEqual(f.started.map((h) => h.stopped), [false, true, false]);
    f.write([p(2, "t2-new")]);
    await until(() => f.started[0].stopped);
    assert.equal(s.count(), 1);
    await s.stop();
  });
  it("a broken file keeps everything running and is reported once, not every few seconds", async () => {
    const f = fixture(); f.write([p(1)]);
    const s = f.sup(); await s.ready;
    fs.writeFileSync(f.configPath, "{half");
    await until(() => f.logs.some((l) => /not valid JSON/.test(l)));
    const start = performance.now(); while (performance.now() - start < 120) await new Promise((r) => setTimeout(r, 10));
    assert.equal(f.logs.filter((l) => /not valid JSON/.test(l)).length, 1);
    assert.equal(f.started[0].stopped, false);
    f.write([p(1)]);
    await s.stop();
  });
  it("stop ends everything and nothing starts afterwards", async () => {
    const f = fixture(); f.write([p(1)]);
    const s = f.sup(); await s.ready; await s.stop();
    f.write([p(1), p(2)]);
    const start = performance.now(); while (performance.now() - start < 80) await new Promise((r) => setTimeout(r, 10));
    assert.equal(f.started.length, 1);
  });
});

describe("end to end through the real command", () => {
  /** A stand-in API: pairs one code, queues a test ticket for a stand-in printer, hands it to whoever asks with the token. */
  async function fakeApi(printerPort) {
    const state = { tokens: new Set(), jobs: [], results: [], pairBodies: [] };
    const server = http.createServer((req, res) => {
      let body = ""; req.on("data", (c) => (body += c));
      req.on("end", () => {
        const json = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
        const authed = state.tokens.has((req.headers.authorization ?? "").slice(7));
        if (req.method === "POST" && req.url === "/api/print/pair") {
          const { code } = JSON.parse(body); state.pairBodies.push(code);
          if (code.toUpperCase().replace(/[^A-Z0-9]/g, "") !== "ABCDEFGH") return json(400, { message: "This setup code is not valid" });
          state.tokens.add("pht_e2e");
          return json(200, { token: "pht_e2e", printerId: "p1", label: "Chez Sam - Borne 1", host: "127.0.0.1", port: printerPort });
        }
        if (!authed) return json(401, { message: "no" });
        if (req.method === "POST" && req.url === "/api/print/test") { state.jobs.push({ id: "11111111-2222-3333-4444-555555555555", attempt: 1, host: "127.0.0.1", port: printerPort, dataBase64: Buffer.from("TEST TICKET").toString("base64") }); return json(200, { id: "j", status: "QUEUED" }); }
        if (req.url.startsWith("/api/print/next")) return json(200, { job: state.jobs.shift() ?? null });
        if (req.url.includes("/result")) { state.results.push(JSON.parse(body)); return json(200, {}); }
        json(404, {});
      });
    });
    servers.push(server);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return { state, url: `http://127.0.0.1:${server.address().port}` };
  }
  const exec = (args, opts = {}) => new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], opts); let out = "";
    child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });

  it("setup with the code from the back office, then the helper prints the test ticket by itself", async () => {
    const received = [];
    const printer = net.createServer((s) => { const c = []; s.on("data", (d) => c.push(d)); s.on("error", () => {}); s.on("end", () => { if (c.length) received.push(Buffer.concat(c).toString()); s.end(); }); });
    servers.push(printer); await new Promise((r) => printer.listen(0, "127.0.0.1", r));
    const api = await fakeApi(printer.address().port);
    const config = path.join(tmp(), "helper.config.json");

    const bad = await exec(["setup", api.url, "WRONG-CODE", "--no-service", "--config", config]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /not valid/);
    assert.ok(!fs.existsSync(config));

    const good = await exec(["setup", api.url, "abcd efgh", "--no-service", "--config", config]);
    assert.equal(good.code, 0, good.out);
    assert.match(good.out, /Paired with "Chez Sam - Borne 1"/);
    assert.match(good.out, /can reach the printer/);
    assert.match(good.out, /test ticket is queued/);
    assert.ok(!good.out.includes("pht_e2e"), "the secret is not echoed");
    assert.equal(JSON.parse(fs.readFileSync(config, "utf8")).printers[0].token, "pht_e2e");
    assert.equal(api.state.jobs.length, 1);

    const helper = spawn(process.execPath, [CLI, "--config", config], { stdio: "ignore" });
    try {
      await until(() => received.length === 1);
      assert.equal(received[0], "TEST TICKET");
      await until(() => api.state.results.length === 1);
      assert.deepEqual(api.state.results[0], { ok: true });
    } finally { helper.kill("SIGTERM"); }
  });

  it("running with nothing set up says what to do instead of looping", async () => {
    const r = await exec(["--config", path.join(tmp(), "none.json")]);
    assert.equal(r.code, 2);
    assert.match(r.out, /Config file not found/);
    const r2 = await exec([], { cwd: tmp(), env: { PATH: process.env.PATH, KIOSK_API_URL: "", PRINT_HELPER_TOKEN: "" } });
    // no helper.config.json in the repo's helper folder is the normal state of a fresh checkout
    if (!fs.existsSync(path.join(DIR, "helper.config.json"))) { assert.equal(r2.code, 2); assert.match(r2.out, /Nothing to do yet/); }
  });
});
