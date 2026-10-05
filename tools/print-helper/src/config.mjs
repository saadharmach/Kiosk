import fs from "node:fs";

/**
 * The helper's settings file. One helper can serve several printers (one per borne), so the file holds a list:
 *
 *   { "apiUrl": "https://api.example.com", "pollIntervalMs": 2000,
 *     "printers": [ { "id": "...", "label": "Chez Sam - Borne 1", "token": "pht_..." } ] }
 *
 * The older one-printer form ("token": "pht_...") still works.
 */

/** Reads the file if there is one. A file that exists but cannot be read is an error, not silence. */
export function readConfigFile(path) {
  let text;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { file: null, values: {} };
    throw new Error(`Cannot read ${path}: ${e.message}`);
  }
  try {
    const values = JSON.parse(text);
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("it must be a JSON object");
    return { file: path, values };
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
}

/**
 * Writes the file so that a reader (the running helper checks it every few seconds) never sees half of it, and
 * so that only the owner can read it: it holds secrets.
 */
export function writeConfigFile(path, values) {
  const temp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, path);
}

/** Adds a printer, or replaces the one with the same id (pairing again gives it a new secret). */
export function withPrinter(values, entry) {
  const printers = (Array.isArray(values.printers) ? values.printers : []).filter((p) => p?.id !== entry.id);
  printers.push({ id: entry.id, label: entry.label, token: entry.token });
  return { ...values, printers };
}

/**
 * Everything the helper has been told to serve, from the file and the environment, as
 * { apiUrl, intervalMs, printers: [{ id, label, token }] }. An environment variable wins over the file.
 */
export function resolveSettings(values, env = process.env) {
  const apiUrl = env.KIOSK_API_URL || values.apiUrl;
  const intervalMs = Number(env.POLL_INTERVAL_MS || values.pollIntervalMs) || 2000;
  const printers = (Array.isArray(values.printers) ? values.printers : [])
    .filter((p) => p && typeof p.token === "string" && p.token)
    .map((p, i) => ({ id: String(p.id ?? `printer-${i + 1}`), label: String(p.label ?? p.id ?? `printer ${i + 1}`), token: p.token }));
  const single = env.PRINT_HELPER_TOKEN || values.token;
  if (single && !printers.some((p) => p.token === single)) printers.push({ id: "single", label: "printer", token: single });
  return { apiUrl, intervalMs, printers };
}
