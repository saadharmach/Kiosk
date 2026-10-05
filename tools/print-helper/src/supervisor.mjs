import { readConfigFile, resolveSettings } from "./config.mjs";
import { startHelper } from "./helper.mjs";

/**
 * Runs one helper loop per printer in the settings file, and looks at the file every few seconds: a printer added
 * by `setup` starts without restarting anything, a replaced secret restarts only that printer, a removed one stops.
 *
 * options: { configPath, env?, log, reloadMs?, startImpl? }
 */
export function supervise({ configPath, env = process.env, log, reloadMs = 10000, startImpl = startHelper }) {
  const running = new Map(); // id -> { token, apiUrl, intervalMs, handle }
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
    if (!settings.apiUrl) return problem("No API address yet: run the setup command from the back office.");
    lastProblem = null;
    const wanted = new Map(settings.printers.map((p) => [p.id, p]));
    for (const [id, r] of [...running]) {
      const w = wanted.get(id);
      if (!w || w.token !== r.token || settings.apiUrl !== r.apiUrl || settings.intervalMs !== r.intervalMs) {
        await r.handle.stop();
        running.delete(id);
        log("INFO", w ? `Settings changed for ${r.label}: restarting it` : `${r.label} was removed: stopped`);
      }
    }
    for (const [id, p] of wanted) {
      if (running.has(id) || stopped) continue;
      const handle = startImpl({
        apiUrl: settings.apiUrl, token: p.token, intervalMs: settings.intervalMs,
        log: (level, msg) => log(level, `[${p.label}] ${msg}`),
      });
      running.set(id, { label: p.label, token: p.token, apiUrl: settings.apiUrl, intervalMs: settings.intervalMs, handle });
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
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await applying;
      await Promise.all([...running.values()].map((r) => r.handle.stop()));
      running.clear();
    },
  };
}
