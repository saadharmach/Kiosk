#!/usr/bin/env node
import fs from "node:fs";
import { sendToPrinter, startHelper } from "./helper.mjs";

const DEFAULT_CONFIG = new URL("../helper.config.json", import.meta.url);

const HELP = `Kiosk print helper

Runs at the restaurant and prints customer tickets on the network printer.

Settings come from helper.config.json (next to package.json) or from environment variables.
An environment variable wins over the file.

  apiUrl        / KIOSK_API_URL         address of the kiosk API, e.g. https://api.example.com
  token         / PRINT_HELPER_TOKEN    the secret shown once in the back office (Printer > Print helper)
  pollIntervalMs / POLL_INTERVAL_MS     how often to ask for tickets (default 2000)

  node src/cli.mjs                       run the helper
  node src/cli.mjs --config FILE         use another config file
  node src/cli.mjs --printer HOST[:PORT] print a self-test page straight to a printer, no API needed
`;

/** Reads the config file if there is one. A file that exists but cannot be read is an error, not silence. */
function readConfigFile(path) {
  let text;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { file: null, values: {} };
    throw new Error(`Cannot read ${path}: ${e.message}`);
  }
  try {
    return { file: path, values: JSON.parse(text) };
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
}

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
let config;
try {
  config = readConfigFile(ci !== -1 ? args[ci + 1] : DEFAULT_CONFIG);
  if (ci !== -1 && !config.file) throw new Error(`Config file not found: ${args[ci + 1]}`);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const apiUrl = process.env.KIOSK_API_URL || config.values.apiUrl;
const token = process.env.PRINT_HELPER_TOKEN || config.values.token;
const intervalMs = Number(process.env.POLL_INTERVAL_MS || config.values.pollIntervalMs) || 2000;
if (!apiUrl || !token) {
  console.error("The API address and the token are both required: set them in helper.config.json or as KIOSK_API_URL and PRINT_HELPER_TOKEN. Run with --help for details.");
  process.exit(2);
}
if (!/^https?:\/\//i.test(apiUrl)) {
  console.error(`The API address must start with http:// or https:// (got "${apiUrl}")`);
  process.exit(2);
}

log("INFO", `Print helper started, talking to ${apiUrl}`);
const helper = startHelper({ apiUrl, token, intervalMs, log });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    log("INFO", `${signal} received, stopping`);
    await helper.stop();
    process.exit(0);
  });
}
// The loop catches its own errors; this is only the last line of defence.
process.on("unhandledRejection", (e) => log("ERROR", `Unhandled: ${e?.message ?? e}`));
