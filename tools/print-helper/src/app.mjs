import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installService, TASK_NAME } from "./service.mjs";
import { supervise } from "./supervisor.mjs";
import { startUi } from "./ui.mjs";

/**
 * NEXBORN Helper as an app (the Windows NEXBORN-Helper.exe; `node src/app.mjs` elsewhere). No commands to type:
 *
 *   double-click  → the first time it installs itself (Windows asks once to allow changes): copies itself to
 *                   C:\ProgramData\NEXBORN Helper, starts with Windows, and opens its page in the browser.
 *                   After that, double-clicking just opens the page.
 *   --service     → what Windows runs at boot: serves the printers and the till bridge, and the page.
 *   --install     → the install step, run with administrator rights.
 *
 * The page (http://127.0.0.1:47800) is where setup codes are pasted and the status is read.
 */

/* global __DEFAULT_API_URL__, __APP_VERSION__ -- set when the .exe is built */
const DEFAULT_API_URL = typeof __DEFAULT_API_URL__ === "string" ? __DEFAULT_API_URL__ : "";
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
const PORT = Number(process.env.NEXBORN_HELPER_PORT) || 47800;
const isWin = process.platform === "win32";
const APP_DIR = process.env.NEXBORN_HELPER_DIR
  || (isWin ? path.join(process.env.ProgramData || "C:\\ProgramData", "NEXBORN Helper") : path.join(os.homedir(), ".nexborn-helper"));
const CONFIG = path.join(APP_DIR, "helper.config.json");
const EXE_NAME = "NEXBORN-Helper.exe";
const PAGE = `http://127.0.0.1:${PORT}/`;

const log = (level, msg) => console.log(`${new Date().toISOString()} ${level} ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);

async function pageIsUp() {
  try { return (await fetch(`${PAGE}api/state`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

function openPage() {
  if (isWin) spawn("explorer.exe", [PAGE], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "darwin") spawn("open", [PAGE], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [PAGE], { detached: true, stdio: "ignore" }).on("error", () => undefined).unref();
}

function isAdmin() {
  try { execFileSync("net", ["session"], { stdio: "ignore" }); return true; } catch { return false; }
}

/** Keeps the window open on a message (a double-clicked program closes its window when it ends). */
async function pause(message) {
  console.log(`\n${message}\n\nPress Enter to close this window.`);
  await new Promise((r) => { process.stdin.resume(); process.stdin.once("data", r); });
}

/** What Windows starts at boot: printers, the till bridge, and the page. */
async function runService() {
  fs.mkdirSync(APP_DIR, { recursive: true });
  log("INFO", `NEXBORN Helper ${VERSION} started (settings: ${CONFIG})`);
  const supervisor = supervise({ configPath: CONFIG, log });
  try {
    await startUi({ port: PORT, supervisor, configPath: CONFIG, defaultApiUrl: DEFAULT_API_URL, version: VERSION, log });
  } catch (e) {
    if (e.code === "EADDRINUSE") { log("INFO", "Already running: this copy stops"); await supervisor.stop(); process.exit(0); }
    throw e;
  }
  log("INFO", `Page: ${PAGE}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await supervisor.stop(); process.exit(0); });
  process.on("unhandledRejection", (e) => log("ERROR", `Unhandled: ${e?.message ?? e}`));
  return supervisor;
}

/** With administrator rights: put the program in its place and have Windows start it at boot (and now). */
async function install() {
  console.log("Installing NEXBORN Helper…");
  fs.mkdirSync(APP_DIR, { recursive: true });
  const target = path.join(APP_DIR, EXE_NAME);
  // A running copy holds its file: stop it before replacing it with this (maybe newer) one.
  try { execFileSync("powershell", ["-NoProfile", "-Command", `Stop-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue`], { stdio: "ignore" }); } catch { /* not there yet */ }
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(target).toLowerCase()) {
    for (let i = 0; ; i++) {
      try { fs.copyFileSync(process.execPath, target); break; } catch (e) { if (i >= 10) throw e; await sleep(500); }
    }
  }
  const r = installService({ node: target, cli: "--service", dir: APP_DIR });
  if (!r.ok) return pause(`Could not finish the installation: ${r.message}`);
  for (let i = 0; i < 40 && !(await pageIsUp()); i++) await sleep(500);
  if (!(await pageIsUp())) return pause(`NEXBORN Helper is installed but did not start. Its log: ${path.join(APP_DIR, "helper.log")}`);
  console.log("Done. Opening the page…");
  openPage();
}

async function main() {
  if (args.includes("--service")) return void (await runService());
  if (args.includes("--install")) return install();

  // Double-click: already running → just show the page.
  if (await pageIsUp()) { openPage(); return; }

  if (!isWin || !process.execPath.toLowerCase().endsWith(EXE_NAME.toLowerCase()) && !process.execPath.toLowerCase().includes("nexborn")) {
    // Not the Windows app (development, Linux): run here, in this window.
    await runService();
    openPage();
    return;
  }
  if (isAdmin()) return install();
  // Ask Windows for administrator rights once ("Do you want to allow this app to make changes?").
  console.log("NEXBORN Helper needs to be installed once: Windows will ask you to allow it.");
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -ArgumentList '--install' -Verb RunAs`], { stdio: "ignore" });
  } catch {
    return pause("The installation was not allowed. Double-click NEXBORN Helper again and choose Yes when Windows asks.");
  }
}

main().catch((e) => pause(`Something went wrong: ${e?.message ?? e}`));
