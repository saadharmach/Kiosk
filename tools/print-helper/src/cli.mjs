#!/usr/bin/env node
import { sendToPrinter, startHelper } from "./helper.mjs";

const HELP = `Kiosk print helper

Runs at the restaurant and prints customer tickets on the network printer.

  KIOSK_API_URL          address of the kiosk API, e.g. https://api.example.com
  PRINT_HELPER_TOKEN     the secret shown once in the back office (Printer > Helper token)
  POLL_INTERVAL_MS       how often to ask for tickets (default 2000)

  node src/cli.mjs                       run the helper
  node src/cli.mjs --printer HOST:PORT   print a self-test page straight to a printer, no API
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

const apiUrl = process.env.KIOSK_API_URL;
const token = process.env.PRINT_HELPER_TOKEN;
if (!apiUrl || !token) {
  console.error("KIOSK_API_URL and PRINT_HELPER_TOKEN must both be set. Run with --help for details.");
  process.exit(2);
}

log("INFO", `Print helper started, talking to ${apiUrl}`);
const helper = startHelper({ apiUrl, token, intervalMs: Number(process.env.POLL_INTERVAL_MS) || 2000, log });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    log("INFO", `${signal} received, stopping`);
    await helper.stop();
    process.exit(0);
  });
}
// The loop catches its own errors; this is only the last line of defence.
process.on("unhandledRejection", (e) => log("ERROR", `Unhandled: ${e?.message ?? e}`));
