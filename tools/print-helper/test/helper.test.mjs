import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import net from "node:net";
import { after, describe, it } from "node:test";
import { sendToPrinter, startHelper } from "../src/helper.mjs";

const running = [];
const servers = [];
after(async () => { await Promise.all(running.map((h) => h.stop())); await Promise.all(servers.map((s) => new Promise((r) => s.close(r)))); });

/** A pretend printer: keeps what it receives. `mode` decides how it behaves after the data. */
function fakePrinter(mode = "keep") {
  const received = [];
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on("data", (d) => chunks.push(d));
    socket.on("error", () => {});
    socket.on("end", () => { received.push(Buffer.concat(chunks)); socket.end(); });
    if (mode === "reset-after-data") socket.on("data", () => setTimeout(() => socket.resetAndDestroy(), 5));
  });
  servers.push(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    port: server.address().port, received, close: () => new Promise((r) => server.close(() => r())),
  })));
}

const freePort = async () => { const p = await fakePrinter(); const port = p.port; await p.close(); return port; };

describe("sendToPrinter", () => {
  it("delivers every byte to the printer", async () => {
    const printer = await fakePrinter();
    const data = Buffer.from([0x1b, 0x40, ...Buffer.from("Bonjour\n"), 0x1d, 0x56, 0x42, 0]);
    await sendToPrinter({ host: "127.0.0.1", port: printer.port, data });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(printer.received[0], data);
    await printer.close();
  });

  it("sends a large ticket intact", async () => {
    const printer = await fakePrinter();
    const data = Buffer.alloc(200_000, 0x41);
    await sendToPrinter({ host: "127.0.0.1", port: printer.port, data });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(printer.received[0].length, data.length);
    await printer.close();
  });

  it("says so, in plain words, when the printer refuses the connection", async () => {
    const port = await freePort();
    await assert.rejects(sendToPrinter({ host: "127.0.0.1", port, data: Buffer.from("x") }), /Connection refused by 127\.0\.0\.1:\d+.*printer on/);
  });

  /** A socket that connects, takes the data, and then does `after`: exactly, every time. */
  const scripted = (events) => () => {
    const sock = new EventEmitter();
    sock.write = (_d, cb) => { cb?.(); };
    sock.end = () => {};
    sock.destroy = () => {};
    setImmediate(() => { for (const [name, arg] of events) sock.emit(name, arg); });
    return sock;
  };
  const reset = () => Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });

  it("counts a printer that drops the connection right after taking the data as success", async () => {
    // Reporting a failure here would print the ticket twice.
    const sock = new EventEmitter();
    sock.write = (_d, cb) => { cb(); setImmediate(() => sock.emit("error", reset())); };
    sock.end = () => {};
    sock.destroy = () => {};
    setImmediate(() => sock.emit("connect"));
    await assert.doesNotReject(sendToPrinter({ host: "h", port: 9100, data: Buffer.from("ticket"), connectImpl: () => sock }));
  });

  it("counts a normal close after the data as success", async () => {
    const sock = new EventEmitter();
    sock.write = (_d, cb) => { cb(); setImmediate(() => sock.emit("close")); };
    sock.end = () => {};
    sock.destroy = () => {};
    setImmediate(() => sock.emit("connect"));
    await assert.doesNotReject(sendToPrinter({ host: "h", port: 9100, data: Buffer.from("ticket"), connectImpl: () => sock }));
  });

  it("fails when the connection drops BEFORE the data was handed over", async () => {
    const sock = new EventEmitter();
    sock.write = () => { setImmediate(() => sock.emit("error", reset())); }; // the write callback never fires
    sock.end = () => {};
    sock.destroy = () => {};
    setImmediate(() => sock.emit("connect"));
    await assert.rejects(sendToPrinter({ host: "h", port: 9100, data: Buffer.from("ticket"), connectImpl: () => sock }), /ECONNRESET/);
  });

  it("fails when the printer never answers the connection", async () => {
    const sock = new EventEmitter();
    sock.end = () => {};
    sock.destroy = () => {};
    await assert.rejects(
      sendToPrinter({ host: "10.1.2.3", port: 9100, data: Buffer.from("x"), connectTimeoutMs: 30, connectImpl: () => sock }),
      /Could not connect to the printer at 10\.1\.2\.3:9100/,
    );
  });
});

/** Runs the helper loop against a scripted API and a scripted printer. */
function harness({ jobs = [], failSend = null, apiFailures = [], reportFailures = 0, status = 200, waitSec = 0, nextDelayMs = 0, intervalMs = 10 } = {}) {
  const log = [];
  const sent = [];
  const requests = [];
  let reportFails = reportFailures;
  const queue = [...jobs];
  const failures = [...apiFailures];

  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? "GET", headers: init?.headers, body: init?.body });
    if (failures.length) throw Object.assign(new TypeError("fetch failed"), { cause: { code: failures.shift() } });
    if (status !== 200) return new Response("{}", { status });
    if (/\/print\/next(\?.*)?$/.test(String(url))) { if (nextDelayMs) await new Promise((r) => setTimeout(r, nextDelayMs)); return Response.json({ job: queue.shift() ?? null }); }
    if (/\/print\/jobs\/.+\/result$/.test(String(url))) {
      if (reportFails > 0) { reportFails -= 1; return new Response("{}", { status: 500 }); }
      return Response.json({ status: "ok" });
    }
    return new Response("{}", { status: 404 });
  };
  const sendImpl = async (args) => { sent.push(args); if (failSend) throw new Error(failSend); };
  const helper = startHelper({ apiUrl: "https://api.test/", token: "pht_secret", intervalMs, waitSec, log: (l, m) => log.push(`${l} ${m}`), fetchImpl, sendImpl });
  running.push(helper);
  const reports = () => requests.filter((r) => r.url.endsWith("/result")).map((r) => ({ url: r.url, body: JSON.parse(r.body) }));
  const until = async (cond, ms = 2000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error(`timed out; log: ${log.join(" | ")}`); await new Promise((r) => setTimeout(r, 5)); } };
  return { helper, log, sent, requests, reports, until };
}

const job = (id, over = {}) => ({ id, host: "192.168.1.50", port: 9100, attempt: 1, dataBase64: Buffer.from("TICKET-" + id).toString("base64"), ...over });

describe("the helper loop", () => {
  it("signs in with the token and asks for work even when there is none", async () => {
    const h = harness();
    await h.until(() => h.requests.length >= 3);
    await h.helper.stop();
    assert.ok(h.requests.every((r) => r.url === "https://api.test/api/print/next"), "no double slash, right path");
    assert.equal(h.requests[0].headers.Authorization, "Bearer pht_secret");
    assert.equal(h.sent.length, 0);
  });

  it("sends a ticket to the printer named in the job, then reports success", async () => {
    const h = harness({ jobs: [job("aaaaaaaa-1111")] });
    await h.until(() => h.reports().length === 1);
    await h.helper.stop();
    assert.equal(h.sent[0].host, "192.168.1.50");
    assert.equal(h.sent[0].port, 9100);
    assert.equal(h.sent[0].data.toString(), "TICKET-aaaaaaaa-1111");
    assert.deepEqual(h.reports()[0], { url: "https://api.test/api/print/jobs/aaaaaaaa-1111/result", body: { ok: true } });
  });

  it("reports the reason when the printer fails, and keeps going", async () => {
    const h = harness({ jobs: [job("bbbbbbbb-2222"), job("cccccccc-3333")], failSend: "Connection refused by 192.168.1.50:9100" });
    await h.until(() => h.reports().length === 2);
    await h.helper.stop();
    assert.deepEqual(h.reports()[0].body, { ok: false, error: "Connection refused by 192.168.1.50:9100" });
    assert.ok(h.log.some((l) => l.startsWith("ERROR") && l.includes("failed")));
  });

  it("prints waiting tickets one after another without pausing in between", async () => {
    const h = harness({ jobs: [job("d1"), job("d2"), job("d3")] });
    await h.until(() => h.sent.length === 3);
    await h.helper.stop();
    assert.deepEqual(h.sent.map((s) => s.data.toString()), ["TICKET-d1", "TICKET-d2", "TICKET-d3"]);
  });

  it("prints one ticket at a time, in order (two at once would interleave on the printer)", async () => {
    let active = 0; let overlap = false;
    const order = [];
    const fetchImpl = (() => { const q = [job("e1"), job("e2")]; return async (url) => /\/next(\?.*)?$/.test(String(url)) ? Response.json({ job: q.shift() ?? null }) : Response.json({}); })();
    const helper = startHelper({ apiUrl: "https://api.test", token: "t", intervalMs: 10, waitSec: 0, log: () => {}, fetchImpl,
      sendImpl: async ({ data }) => { active++; if (active > 1) overlap = true; await new Promise((r) => setTimeout(r, 30)); order.push(data.toString()); active--; } });
    running.push(helper);
    await new Promise((r) => setTimeout(r, 200));
    await helper.stop();
    assert.equal(overlap, false);
    assert.deepEqual(order, ["TICKET-e1", "TICKET-e2"]);
  });

  it("retries an answer that could not be delivered, then gives up quietly", async () => {
    const h = harness({ jobs: [job("ffffffff-4444")], reportFailures: 2 });
    await h.until(() => h.reports().length === 3, 6000);
    await h.helper.stop();
    assert.equal(h.reports().length, 3, "two failures, then success");
    assert.ok(!h.log.some((l) => l.includes("Could not report")));

    const h2 = harness({ jobs: [job("gggggggg-5555")], reportFailures: 99 });
    await h2.until(() => h2.log.some((l) => l.includes("Could not report")), 6000);
    await h2.helper.stop();
    assert.equal(h2.reports().length, 3, "gives up after 3 tries");
  });
});

describe("the helper loop: waiting for a ticket", () => {
  const nextRequests = (h) => h.requests.filter((r) => /\/print\/next/.test(r.url));

  it("asks the API to hold the request open, so a ticket is printed the moment it exists", async () => {
    const h = harness({ waitSec: 20 });
    await h.until(() => nextRequests(h).length >= 1);
    await h.helper.stop();
    assert.equal(nextRequests(h)[0].url, "https://api.test/api/print/next?wait=20");
  });

  it("can be told not to wait, for an API that does not hold requests", async () => {
    const h = harness({ waitSec: 0 });
    await h.until(() => nextRequests(h).length >= 1);
    await h.helper.stop();
    assert.equal(nextRequests(h)[0].url, "https://api.test/api/print/next");
  });

  it("asks again at once after the API held a request open and found nothing", async () => {
    // Each answer takes 1.1s, like a long wait that ended empty. A helper that then pauses for
    // its poll interval would leave a gap in which a ticket sits unprinted.
    // A long poll interval, so a helper that wrongly sleeps it after an empty answer is plainly too slow.
    const h = harness({ waitSec: 20, nextDelayMs: 1100, intervalMs: 3000 });
    const t0 = performance.now();   // a steady clock: the wall clock can jump (WSL re-syncs it)
    await h.until(() => nextRequests(h).length >= 2, 4000);
    // Measured the moment the second request arrives. (Stopping the helper afterwards waits for the request still
    // in flight, about another second: counting that made this test fail whenever the machine was busy.)
    const gap = performance.now() - t0;
    await h.helper.stop();
    assert.ok(nextRequests(h).length >= 2, "asked a second time");
    assert.ok(gap < 2600, `two requests within ~1.1s plus start-up, took ${gap}ms`);
  });

  it("paces itself when the API answers straight away, so it cannot spin", async () => {
    const h = harness({ waitSec: 20, nextDelayMs: 0 });
    await new Promise((r) => setTimeout(r, 300));
    await h.helper.stop();
    const n = nextRequests(h).length;
    assert.ok(n >= 3 && n <= 40, `about one request per 10ms interval, not thousands (was ${n})`);
  });
});

describe("the helper loop: when things go wrong", () => {
  it("survives the API being unreachable, says so once, and notices when it is back", async () => {
    const h = harness({ apiFailures: ["ECONNREFUSED", "ECONNREFUSED", "ECONNREFUSED"], jobs: [job("hhhhhhhh-6666")] });
    await h.until(() => h.sent.length === 1, 4000);
    await h.helper.stop();
    const errors = h.log.filter((l) => l.startsWith("ERROR") && l.includes("Cannot reach the API"));
    assert.equal(errors.length, 1, "one message, not one per retry");
    assert.match(errors[0], /ECONNREFUSED/);
    assert.ok(h.log.some((l) => l.includes("Connection to the API restored")));
  });

  it("tells the person to generate a new token when the API rejects it, and does not crash", async () => {
    const h = harness({ status: 401 });
    await h.until(() => h.log.some((l) => l.includes("rejected the helper token")));
    await h.helper.stop();
    assert.ok(h.log.some((l) => l.includes("generate a new one in the back office")));
    assert.equal(h.log.filter((l) => l.includes("rejected")).length, 1);
  });

  it("keeps running when the API answers with an error", async () => {
    const h = harness({ status: 503 });
    await h.until(() => h.log.some((l) => l.includes("503")));
    await h.helper.stop();
    assert.ok(h.log.some((l) => l.includes("Will keep trying")));
  });

  it("stops promptly, even while waiting out a long pause", async () => {
    const h = harness({ status: 401 }); // a rejected token waits 30 seconds between tries
    await h.until(() => h.log.some((l) => l.includes("rejected")));
    const t = Date.now();
    await h.helper.stop();
    assert.ok(Date.now() - t < 1000, "stop() does not wait for the pause to end");
  });
});
