import net from "node:net";
import { gzipSync } from "node:zlib";

/**
 * The till bridge: for a restaurant whose till (unTill) cannot be reached from the internet. It asks our server for
 * the calls waiting for the till (the request is held open, so a call arrives at once), runs each one on the
 * restaurant's own network, and sends the till's answer back. Like the print helper it only makes outbound
 * connections: nothing to open in the router.
 *
 * It only ever talks to an address on the restaurant's network (or one listed in "allowTillHosts"): our server
 * cannot use it to reach anything else.
 */

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/** Is this an address on a local network (the restaurant's), as opposed to the internet? */
export function isLocalAddress(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = net.isIPv4(h) ? h.split(".").map(Number) : null;
  if (v4) {
    const [a, b] = v4;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (net.isIPv6(h)) return h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  // A computer's own name on the network (UNTILL-PC), or a local-only name (till.local, till.lan).
  return !h.includes(".") || /\.(local|lan|home|internal|localdomain)$/.test(h);
}

/** May the bridge send this call? Only to the restaurant's network, or a host explicitly allowed in its settings. */
export function allowedTarget(url, allowHosts = []) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, reason: "not a valid address" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: `${u.protocol} is not allowed` };
  const host = u.hostname.toLowerCase();
  if (isLocalAddress(host) || allowHosts.map((x) => String(x).toLowerCase()).includes(host)) return { ok: true, host, port: u.port };
  return { ok: false, reason: `${host} is not on the restaurant's network (add it to "allowTillHosts" in helper.config.json if it really is the till)` };
}

function explain(e, url) {
  const code = e?.cause?.code ?? e?.code;
  let at = url;
  try { at = new URL(url).host; } catch { /* keep */ }
  switch (code) {
    case "ECONNREFUSED": return `The till at ${at} refused the connection: is unTill running, and TP-API switched on?`;
    case "EHOSTUNREACH": case "ENETUNREACH": return `Cannot reach the till at ${at}: check its address and this computer's network`;
    case "ETIMEDOUT": case "UND_ERR_CONNECT_TIMEOUT": return `No answer from the till at ${at}`;
    case "ENOTFOUND": return `Unknown till name ${at}`;
    default: return e?.name === "TimeoutError" ? `The till at ${at} did not answer in time` : `${code ?? e?.name ?? "Error"}: ${e?.message ?? e} (${at})`;
  }
}

/** Runs one call against the till. Returns what the server expects back. */
export async function runOnTill(job, { allowHosts = [], fetchImpl = fetch } = {}) {
  const target = allowedTarget(job.url, allowHosts);
  if (!target.ok) return { ok: false, error: `Refused by the bridge: ${target.reason}` };
  try {
    const res = await fetchImpl(job.url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${job.soapAction}"` },
      body: job.body,
      signal: AbortSignal.timeout(Math.max(1000, Number(job.timeoutMs) || 15000)),
    });
    const text = await res.text();
    return { ok: true, status: res.status, statusText: res.statusText, textGzipBase64: gzipSync(Buffer.from(text, "utf8")).toString("base64") };
  } catch (e) {
    return { ok: false, error: explain(e, job.url) };
  }
}

/**
 * Starts the loop. Returns { stop }.
 * options: { apiUrl, token, allowHosts?, waitSec?, intervalMs?, maxParallel?, log?, fetchImpl?, tillFetchImpl? }
 */
export function startBridge(options) {
  const {
    apiUrl, token, allowHosts = [], waitSec = 20, intervalMs = 2000, maxParallel = 10,
    log = (level, msg) => console.log(`${new Date().toISOString()} ${level} ${msg}`),
    fetchImpl = fetch, tillFetchImpl = fetch,
  } = options;
  const base = apiUrl.replace(/\/+$/, "");
  const abort = new AbortController();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const running = new Set();
  let lastTillProblem = null;
  /** What the app's status page shows: is the server reachable, does the till answer. */
  const state = { api: "starting", apiError: null, till: "unknown", tillError: null, lastCallAt: null };

  async function api(path, init, timeoutMs = 30000) {
    let res;
    try {
      res = await fetchImpl(`${base}/api${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const why = e.cause?.code ?? e.cause?.message ?? e.name;
      throw new Error(`Cannot reach the API at ${base} (${why}): check the internet connection`);
    }
    if (res.status === 401) throw Object.assign(new Error("The API rejected the bridge's secret: set the bridge up again with a new code from the admin"), { fatal: true });
    if (!res.ok) throw new Error(`The API answered ${res.status}`);
    return res.json();
  }

  async function handle(job) {
    const result = await runOnTill(job, { allowHosts, fetchImpl: tillFetchImpl });
    // Said once when the till stops answering, and once when it answers again: not for every call.
    const problem = result.ok ? null : result.error;
    state.till = problem ? "error" : "ok"; state.tillError = problem; state.lastCallAt = new Date().toISOString();
    if (problem !== lastTillProblem) log(problem ? "ERROR" : "INFO", problem ?? "The till answers");
    lastTillProblem = problem;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await api(`/bridge/jobs/${job.id}/result`, { method: "POST", body: JSON.stringify(result) }, 60000);
        return;
      } catch (e) {
        if (attempt === 3) log("WARN", `Could not send the till's answer back: ${e.message}`);
        else await sleep(1000 * attempt, abort.signal);
      }
    }
  }

  const loop = (async () => {
    let failures = 0;
    let announcedDown = false;
    while (!abort.signal.aborted) {
      try {
        // Never more calls at once than the till should take: wait for a free slot before asking for more.
        while (running.size >= maxParallel && !abort.signal.aborted) await Promise.race(running);
        const started = Date.now();
        const { jobs = [] } = await api(waitSec > 0 ? `/bridge/next?wait=${waitSec}` : "/bridge/next", undefined, (waitSec + 15) * 1000);
        state.api = "ok"; state.apiError = null;
        if (announcedDown) log("INFO", "Connection to the API restored");
        failures = 0;
        announcedDown = false;
        for (const job of jobs) {
          const p = handle(job).finally(() => running.delete(p));
          running.add(p);
        }
        if (jobs.length > 0 || Date.now() - started >= 1000) continue;
        await sleep(intervalMs, abort.signal);
      } catch (e) {
        failures += 1;
        state.api = "down"; state.apiError = e.message;
        if (!announcedDown) log("ERROR", `${e.message}. Will keep trying.`);
        announcedDown = true;
        await sleep(e.fatal ? 30000 : Math.min(30000, intervalMs * 2 ** Math.min(failures, 5)), abort.signal);
      }
    }
    await Promise.allSettled([...running]);
  })();

  return { state, stop: async () => { abort.abort(); await loop; } };
}
