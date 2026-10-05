#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfigFile, resolveSettings } from "./config.mjs";
import { sendToPrinter } from "./helper.mjs";
import { installService, uninstallService } from "./service.mjs";
import { runSetup } from "./setup.mjs";
import { supervise } from "./supervisor.mjs";

const CLI = fileURLToPath(import.meta.url);
const DIR = path.resolve(path.dirname(CLI), "..");
const DEFAULT_CONFIG = path.join(DIR, "helper.config.json");

const HELP = `Kiosk print helper

Runs at the restaurant and prints customer tickets on the network printer.

  node src/cli.mjs setup <API address> <setup code>
        First-time setup of one printer (both are shown in the back office, printer > "Set up the helper").
        Saves the settings, checks the printer, starts the helper at boot, queues a test ticket.
        Run it again with another code to add another borne's printer to the same helper.
        --no-service  do not register the start at boot      --no-test  do not queue a test ticket

  node src/cli.mjs                       run the helper
  node src/cli.mjs install-service       start at boot (without pairing again)
  node src/cli.mjs uninstall-service     stop starting at boot
  node src/cli.mjs --config FILE         use another settings file (to run or set up; the start at boot always uses the default one)
  node src/cli.mjs --printer HOST[:PORT] print a self-test page straight to a printer, no API needed

Settings live in helper.config.json (next to package.json); setup writes it. The older form still works:
apiUrl + token, or the environment variables KIOSK_API_URL and PRINT_HELPER_TOKEN (they win over the file),
POLL_INTERVAL_MS (default 2000).
`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const log = (level, msg) => console.log(`${new Date().toISOString()} ${level} ${msg}`);

// A quick way for whoever installs it to check the printer, before any of the rest is set up.
const i = args.indexOf("--printer");
if (i !== -1) {
  const [host, portText = "9100"] = (args[i + 1] ?? "").split(":");
  if (!host) { console.error("Usage: --printer HOST[:PORT]"); process.exit(2); }
  const ESC = 0x1b, GS = 0x1d;
  const page = Buffer.concat([
    Buffer.from([ESC, 0x40, ESC, 0x61, 1]),
    Buffer.from("Kiosk print helper\nThe printer is reachable.\n"),
    Buffer.from([ESC, 0x64, 3, GS, 0x56, 0x42, 0]),
  ]);
  try {
    await sendToPrinter({ host, port: Number(portText), data: page });
    log("INFO", `Test page sent to ${host}:${portText}`);
    process.exit(0);
  } catch (e) {
    log("ERROR", e.message);
    process.exit(1);
  }
}

const ci = args.indexOf("--config");
const configPath = ci !== -1 ? args[ci + 1] : DEFAULT_CONFIG;
if (ci !== -1 && !configPath) { console.error("Usage: --config FILE"); process.exit(2); }

const command = args.find((a, n) => !a.startsWith("--") && args[n - 1] !== "--config");

if (command === "setup") {
  const [, apiUrl, code] = args.filter((a, n) => !a.startsWith("--") && args[n - 1] !== "--config");
  process.exit(await runSetup({
    apiUrl, code, configPath: path.resolve(configPath), cli: CLI, dir: DIR,
    service: !args.includes("--no-service"), test: !args.includes("--no-test"),
  }));
}
if (command === "install-service" || command === "uninstall-service") {
  const r = command === "install-service" ? installService({ cli: CLI, dir: DIR }) : uninstallService({});
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}
if (command) {
  console.error(`Unknown command "${command}". Run with --help.`);
  process.exit(2);
}

let settings;
try {
  const file = readConfigFile(configPath);
  if (ci !== -1 && !file.file) throw new Error(`Config file not found: ${configPath}`);
  settings = resolveSettings(file.values);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
if (!settings.apiUrl || settings.printers.length === 0) {
  console.error("Nothing to do yet: run the setup command from the back office (node src/cli.mjs setup <API address> <code>), or set the API address and the token in helper.config.json. Run with --help for details.");
  process.exit(2);
}
if (!/^https?:\/\//i.test(settings.apiUrl)) {
  console.error(`The API address must start with http:// or https:// (got "${settings.apiUrl}")`);
  process.exit(2);
}

log("INFO", `Print helper started, talking to ${settings.apiUrl}`);
const helper = supervise({ configPath, log });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    log("INFO", `${signal} received, stopping`);
    await helper.stop();
    process.exit(0);
  });
}
// The loops catch their own errors; this is only the last line of defence.
process.on("unhandledRejection", (e) => log("ERROR", `Unhandled: ${e?.message ?? e}`));
