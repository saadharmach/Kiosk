import { readConfigFile, resolveSettings } from "./config.mjs";
import { startBridge } from "./bridge.mjs";
import { startHelper } from "./helper.mjs";

/**
 * Runs one helper loop per printer in the settings file (and one per till bridge), and looks at the file every few seconds: a printer added
 * by `setup` starts without restarting anything, a replaced secret restarts only that printer, a removed one stops.
 *
 * options: { configPath, env?, log, reloadMs?, startImpl?, startBridgeImpl? }
 */
export function supervise({ configPath, env = process.env, log, reloadMs = 10000, startImpl = startHelper, startBridgeImpl = startBridge }) {
  const running = new Map(); // key -> { label, token, apiUrl, intervalMs, extra, handle }
  let stopped = false;
  let lastProblem = null; // said once, not every few seconds
  let timer = null;
  let applying = Promise.resolve();

  async function apply() {
    const problem = (message) => { if (message !== lastProblem) log("ERROR", message); lastProblem = message; };
    let settings;
    try {
      settings = resolveSettings(readConfigFile(configPath).values, env);
    } catch (e) {
      // Keep serving with what is running: a half-edited file must not stop the printing.
      return problem(`${e.message}. Keeping the current settings.`);
    }
    if (!settings.apiUrl) return problem("Nothing set up yet: paste a setup code on the app's page, or run the setup command.");
    lastProblem = null;
    // Printers and bridges side by side; a bridge's key cannot clash with a printer's.
    const allow = JSON.stringify(settings.allowTillHosts);
    const wanted = new Map([
      ...settings.printers.map((p) => [p.id, { ...p, kind: "printer", extra: "" }]),
      ...settings.bridges.map((b) => [`bridge:${b.id}`, { ...b, kind: "bridge", extra: allow }]),
    ]);
    for (const [id, r] of [...running]) {
      const w = wanted.get(id);
      if (!w || w.token !== r.token || settings.apiUrl !== r.apiUrl || settings.intervalMs !== r.intervalMs || w.extra !== r.extra) {
        await r.handle.stop();
        running.delete(id);
        log("INFO", w ? `Settings changed for ${r.label}: restarting it` : `${r.label} was removed: stopped`);
      }
    }
    for (const [id, p] of wanted) {
      if (running.has(id) || stopped) continue;
      const common = { apiUrl: settings.apiUrl, token: p.token, intervalMs: settings.intervalMs, log: (level, msg) => log(level, `[${p.label}] ${msg}`) };
      const handle = p.kind === "bridge" ? startBridgeImpl({ ...common, allowHosts: settings.allowTillHosts }) : startImpl(common);
      running.set(id, { label: p.label, token: p.token, apiUrl: settings.apiUrl, intervalMs: settings.intervalMs, extra: p.extra, handle });
      log("INFO", `Serving ${p.label} (${settings.apiUrl})`);
    }
  }

  const tick = () => { applying = applying.then(apply).catch((e) => log("ERROR", `Reading the settings failed: ${e.message}`)); return applying; };
  const ready = tick();
  timer = setInterval(tick, reloadMs);
  timer.unref?.();

  return {
    ready,
    count: () => running.size,
    /** Read the settings again now (the app calls this right after adding a code). */
    reload: () => tick(),
    /** Everything being served, with its live state, for the app's status page. */
    entries: () => [...running.entries()].map(([key, r]) => ({ key, kind: key.startsWith("bridge:") ? "bridge" : "printer", label: r.label, state: r.handle.state ?? null })),
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await applying;
      await Promise.all([...running.values()].map((r) => r.handle.stop()));
      running.clear();
    },
  };
}
