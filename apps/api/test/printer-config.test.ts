import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRINTER_CONFIG, readPrinterConfig } from "../src/printing/printer-config.js";

describe("readPrinterConfig", () => {
  it("gives the defaults for nothing", () => {
    for (const v of [undefined, null, {}, "x", 5, []]) assert.deepEqual(readPrinterConfig(v), DEFAULT_PRINTER_CONFIG);
  });
  it("keeps valid values", () => {
    assert.deepEqual(readPrinterConfig({ autoPrint: false, copies: 2, cut: false, codepage: "CP1252" }), {
      autoPrint: false, copies: 2, cut: false, codepage: "CP1252",
    });
  });
  it("replaces each wrong value with its own default, not the whole config", () => {
    assert.deepEqual(readPrinterConfig({ autoPrint: "yes", copies: 9, cut: false, codepage: "KLINGON" }), {
      autoPrint: true, copies: 1, cut: false, codepage: "CP858",
    });
    assert.equal(readPrinterConfig({ copies: 1.5 }).copies, 1);
    assert.equal(readPrinterConfig({ copies: 0 }).copies, 1);
  });
});
