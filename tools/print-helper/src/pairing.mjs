import net from "node:net";

/** The calls made while setting a helper up. */

const trim = (url) => url.replace(/\/+$/, "");

async function post(url, headers, body, fetchImpl, timeoutMs = 15000) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const why = e.cause?.code ?? e.cause?.message ?? e.name;
    throw new Error(`Cannot reach the API at ${new URL(url).origin} (${why}): check the address and the internet connection`);
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const message = Array.isArray(json?.message) ? json.message.join(", ") : json?.message;
    throw Object.assign(new Error(message ?? `The API answered ${res.status}`), { status: res.status });
  }
  return json;
}

/** Trades the one-time code from the back office for the printer's secret. */
export async function pair({ apiUrl, code, fetchImpl = fetch }) {
  const r = await post(`${trim(apiUrl)}/api/print/pair`, {}, { code }, fetchImpl);
  if (!r?.token || !r?.printerId) throw new Error("The API's answer was not what a helper expects: is this the right address?");
  return r;
}

/** Asks for a test ticket on this helper's own printer. */
export const requestTest = ({ apiUrl, token, fetchImpl = fetch }) =>
  post(`${trim(apiUrl)}/api/print/test`, { Authorization: `Bearer ${token}` }, null, fetchImpl);

/** Can this computer open a connection to the printer? Nothing is sent to it. */
export function canReach(host, port, { timeoutMs = 4000, connectImpl = net.createConnection } = {}) {
  return new Promise((resolve) => {
    const socket = connectImpl({ host, port });
    const done = (result) => { clearTimeout(timer); socket.destroy(); resolve(result); };
    const timer = setTimeout(() => done({ ok: false, reason: `no answer after ${timeoutMs / 1000}s` }), timeoutMs);
    socket.once("connect", () => done({ ok: true }));
    socket.once("error", (e) => done({ ok: false, reason: e.code ?? e.message }));
  });
}
