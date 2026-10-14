#!/usr/bin/env node
// Builds NEXBORN-Helper.exe, the Windows app:   node tools/print-helper/build-exe.mjs <out.exe>
//
// A Node.js "single executable application": the official Windows node.exe (same version as the Node running this,
// checked against nodejs.org's published checksums) with the helper bundled inside. Nothing to install on the
// restaurant's computer. DEFAULT_API_URL (the back office address) is written in as the page's default server.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const out = path.resolve(process.argv[2] ?? path.join(HERE, "dist", "NEXBORN-Helper.exe"));
const version = process.version; // the blob must be made by the same Node version as the .exe it goes into
const work = fs.mkdtempSync(path.join(os.tmpdir(), "nexborn-exe-"));
const say = (m) => console.log(`exe: ${m}`);

/** The official Windows node.exe, downloaded once and kept (checked against nodejs.org's SHA-256 list). */
async function windowsNode() {
  const cacheDir = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "nexborn");
  const file = path.join(cacheDir, `node-${version}-win-x64.exe`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(cacheDir, { recursive: true });
  const base = `https://nodejs.org/dist/${version}`;
  say(`downloading the Windows Node.js ${version} (once)`);
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const expected = sums.split("\n").find((l) => l.endsWith(" win-x64/node.exe"))?.split(/\s+/)[0];
  if (!expected) throw new Error("win-x64/node.exe is not in nodejs.org's checksum list");
  const res = await fetch(`${base}/win-x64/node.exe`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(data).digest("hex");
  if (got !== expected) throw new Error(`node.exe checksum mismatch (got ${got}, expected ${expected})`);
  fs.writeFileSync(`${file}.tmp`, data);
  fs.renameSync(`${file}.tmp`, file);
  return file;
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const bundle = path.join(work, "app.cjs");
  // One CommonJS file: what a Node single executable runs.
  await (await import("esbuild")).build({
    entryPoints: [path.join(HERE, "src", "app.mjs")], bundle: true, platform: "node", format: "cjs", target: "node24",
    outfile: bundle, logLevel: "warning",
    define: {
      __DEFAULT_API_URL__: JSON.stringify(process.env.DEFAULT_API_URL ?? ""),
      __APP_VERSION__: JSON.stringify(`${pkg.version}${process.env.APP_BUILD ? `+${process.env.APP_BUILD}` : ""}`),
    },
  });
  const blob = path.join(work, "sea.blob");
  const seaConfig = path.join(work, "sea-config.json");
  fs.writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false }));
  execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "ignore" });

  const exe = path.join(work, "NEXBORN-Helper.exe");
  fs.copyFileSync(await windowsNode(), exe);
  const postject = path.join(path.dirname(require.resolve("postject/package.json")), "dist", "cli.js");
  execFileSync(process.execPath, [postject, exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"], { stdio: "ignore" });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(exe, out);
  say(`built ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1e6)} MB, Node ${version}, server ${process.env.DEFAULT_API_URL || "not set"})`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
