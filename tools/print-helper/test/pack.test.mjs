import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { crc32, inflateRawSync } from "node:zlib";
import { buildZip, helperFiles } from "../pack.mjs";

/** Reads a zip's entries back (central directory), checking every file's checksum. */
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = inflateRawSync(buf.subarray(dataAt, dataAt + size));
    assert.equal(crc32(data), crc, `checksum of ${name}`);
    out.set(name, data);
    p += 46 + nameLen;
  }
  return out;
}

describe("the helper download", () => {
  it("holds the program, its guide and a start-here note, all in one folder, each file intact", () => {
    const files = readZip(buildZip());
    for (const name of files.keys()) assert.ok(name.startsWith("kiosk-print-helper/"), name);
    for (const f of ["package.json", "README.md", "helper.config.example.json", "src/cli.mjs", "src/setup.mjs", "START-HERE.txt"]) {
      assert.ok(files.has(`kiosk-print-helper/${f}`), f);
    }
    assert.equal(files.get("kiosk-print-helper/src/cli.mjs").toString(), fs.readFileSync(new URL("../src/cli.mjs", import.meta.url), "utf8"));
  });

  it("never takes a settings file with secrets, tests or anything not on the list", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-"));
    try {
      fs.mkdirSync(path.join(root, "src")); fs.mkdirSync(path.join(root, "test"));
      for (const f of ["package.json", "README.md", "helper.config.example.json", "src/cli.mjs", "src/notes.txt", "test/x.test.mjs", "helper.config.json", ".env"]) {
        fs.writeFileSync(path.join(root, f), f === "helper.config.json" ? '{"token":"pht_secret"}' : "x");
      }
      const names = [...readZip(buildZip(root)).keys()];
      assert.ok(!names.some((n) => /helper\.config\.json$|\.env$|test\/|notes\.txt/.test(n)), names.join(", "));
      assert.ok(!buildZip(root).includes(Buffer.from("pht_secret")));
      assert.deepEqual(helperFiles(root), ["package.json", "README.md", "helper.config.example.json", "src/cli.mjs"]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("gives the same bytes every time, so an unchanged helper is not uploaded again", () => {
    assert.ok(buildZip().equals(buildZip()));
  });
});
