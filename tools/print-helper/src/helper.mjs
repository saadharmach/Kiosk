import net from "node:net";

/**
 * The print helper's engine. It only ever makes outbound requests: it asks the API for the
 * next ticket, sends the bytes to the printer over the restaurant's network (raw TCP, usually
 * port 9100), and tells the API how it went. The API decides what to print and when to retry.
 *
 * No dependencies on purpose: this runs on a restaurant PC that nobody maintains.
 */

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Sends bytes to a network printer. Resolves when the printer has taken them.
 * Rejects with a readable message on refusal, timeout or an unreachable host.
 */
export function sendToPrinter({ host, port, data, connectTimeoutMs = 5000, totalTimeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let flushed = false;
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      socket.destroy();
      err ? reject(err) : resolve();
    };
    const connectTimer = setTimeout(
      () => done(new Error(`Could not connect to the printer at ${host}:${port} (no answer after ${connectTimeoutMs / 1000}s)`)),
      connectTimeoutMs,
    );
    const totalTimer = setTimeout(
      () => done(new Error(`The printer at ${host}:${port} did not accept the ticket in time`)),
      totalTimeoutMs,
    );

    socket.once("connect", () => {
      clearTimeout(connectTimer);
      socket.write(data, () => {
        flushed = true;
        socket.end();
      });
    });
    socket.once("error", (e) => {
      // A printer often drops the connection the moment it has the data. Once every byte has
      // been handed over that is normal, and reporting a failure would print the ticket twice.
      if (flushed) return done();
      done(new Error(explain(e, host, port)));
    });
    socket.once("close", () => done(flushed ? undefined : new Error(`The printer at ${host}:${port} closed the connection`)));
  });
}

function explain(e, host, port) {
  const at = `${host}:${port}`;
  switch (e.code) {
    case "ECONNREFUSED": return `Connection refused by ${at}: is the printer on and is this the right port?`;
    case "EHOSTUNREACH":
    case "ENETUNREACH": return `Cannot reach ${at}: check the printer's address and the network`;
    case "ETIMEDOUT": return `Timed out connecting to ${at}`;
    case "ENOTFOUND": return `Unknown printer host name ${host}`;
    default: return `${e.code ?? "Error"}: ${e.message} (${at})`;
  }
}

/**
 * Starts the loop. Returns { stop } which ends it cleanly.
 *
 * options: { apiUrl, token, intervalMs?, log?, fetchImpl?, sendImpl? }
 */
export function startHelper(options) {
  const {
    apiUrl,
    token,
    intervalMs = 2000,
    log = (level, msg) => console.log(`${new Date().toISOString()} ${level} ${msg}`),
    fetchImpl = fetch,
    sendImpl = sendToPrinter,
  } = options;
  const base = apiUrl.replace(/\/+$/, "");
  const abort = new AbortController();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function api(path, init) {
    let res;
    try {
      res = await fetchImpl(`${base}/api${path}`, { ...init, headers, signal: AbortSignal.timeout(15000) });
    } catch (e) {
      // "fetch failed" alone tells the person installing this nothing.
      const why = e.cause?.code ?? e.cause?.message ?? e.name;
      throw new Error(`Cannot reach the API at ${base} (${why}): check KIOSK_API_URL and the internet connection`);
    }
    if (res.status === 401) throw Object.assign(new Error("The API rejected the helper token: generate a new one in the back office"), { fatal: true });
    if (!res.ok) throw new Error(`The API answered ${res.status}`);
    return res.json();
  }

  /** Tell the API the result. If that fails the API's own timeout hands the job out again. */
  async function report(jobId, ok, error) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await api(`/print/jobs/${jobId}/result`, { method: "POST", body: JSON.stringify(ok ? { ok } : { ok, error }) });
        return;
      } catch (e) {
        if (attempt === 3) log("WARN", `Could not report job ${jobId.slice(0, 8)}: ${e.message}`);
        else await sleep(1000 * attempt, abort.signal);
      }
    }
  }

  /** One round: returns true if a ticket was handled, so the loop can keep draining. */
  async function poll() {
    const { job } = await api("/print/next");
    if (!job) return false;
    log("INFO", `Ticket ${job.id.slice(0, 8)} (attempt ${job.attempt}) to ${job.host}:${job.port}`);
    try {
      await sendImpl({ host: job.host, port: job.port, data: Buffer.from(job.dataBase64, "base64") });
      log("INFO", `Ticket ${job.id.slice(0, 8)} printed`);
      await report(job.id, true);
    } catch (e) {
      log("ERROR", `Ticket ${job.id.slice(0, 8)} failed: ${e.message}`);
      await report(job.id, false, e.message);
    }
    return true;
  }

  const loop = (async () => {
    let failures = 0;
    let announcedDown = false;
    while (!abort.signal.aborted) {
      try {
        const worked = await poll();
        if (announcedDown) log("INFO", "Connection to the API restored");
        failures = 0;
        announcedDown = false;
        if (worked) continue; // more tickets may be waiting
        await sleep(intervalMs, abort.signal);
      } catch (e) {
        // Nothing in here may end the loop: a printer PC has to keep trying by itself.
        failures += 1;
        if (!announcedDown) log("ERROR", `${e.message}. Will keep trying.`);
        announcedDown = true;
        // 2s, 4s, 8s ... up to 30s; a rejected token is retried slowly, it may be replaced.
        await sleep(e.fatal ? 30000 : Math.min(30000, intervalMs * 2 ** Math.min(failures, 5)), abort.signal);
      }
    }
  })();

  return {
    stop: async () => { abort.abort(); await loop; },
  };
}
