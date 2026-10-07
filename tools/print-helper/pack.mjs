#!/usr/bin/env node
// Packs the print helper into a zip the back office offers for download:   node tools/print-helper/pack.mjs <out.zip>
//
// Only the files needed to run it go in, named one by one: never a helper.config.json (it holds secrets), never
// tests. No dependencies: a zip is a few headers around deflated files. The dates are fixed, so the same helper
// always gives the same bytes (and a deploy does not re-upload an unchanged download).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Inside the zip everything sits in one folder, so unzipping never scatters files. */
const TOP = "kiosk-print-helper";

/** The files that go in: the program, how to use it, an example settings file, and a short start guide. */
export function helperFiles(root = HERE) {
  const src = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".mjs")).sort().map((f) => `src/${f}`);
  return ["package.json", "README.md", "helper.config.example.json", ...src];
}

const START_HERE = `KIOSK PRINT HELPER — START HERE / COMMENCER ICI

1. Install Node.js 20 or newer (LTS) from https://nodejs.org  /  Installez Node.js 20 ou plus récent.
2. Unzip this folder somewhere it will stay, for example C:\\kiosk-print-helper  /  Décompressez ce dossier.
3. In the back office: Bornes > the printer > Print helper > "Set up the helper". Copy the command it shows.
   Dans le back-office : Bornes > l'imprimante > Print helper > « Set up the helper ». Copiez la commande.
4. Open a terminal IN THIS FOLDER (Windows: PowerShell with "Run as administrator") and paste the command:
   Ouvrez un terminal DANS CE DOSSIER (Windows : PowerShell « Exécuter en tant qu'administrateur ») et collez-la :
       node src/cli.mjs setup https://<back office address> <code>
It sets itself up, checks the printer, starts at every boot and prints a test ticket. Details: README.md
`;

const DOS_TIME = 0;                            // 00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

export function buildZip(root = HERE) {
  const entries = [
    ...helperFiles(root).map((f) => ({ name: `${TOP}/${f}`, data: fs.readFileSync(path.join(root, f)) })),
    { name: `${TOP}/START-HERE.txt`, data: Buffer.from(START_HERE.replace(/\n/g, "\r\n"), "utf8") },
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = process.argv[2];
  if (!out) { console.error("Usage: node tools/print-helper/pack.mjs <out.zip>"); process.exit(2); }
  const zip = buildZip();
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  // Only rewritten when it changed, so a dev server watching the folder is not disturbed for nothing.
  if (!fs.existsSync(out) || !fs.readFileSync(out).equals(zip)) fs.writeFileSync(out, zip);
  console.log(`Print helper packed: ${out} (${Math.round(zip.length / 1024)} KB)`);
}
