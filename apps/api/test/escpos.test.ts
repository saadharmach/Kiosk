import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EscPos, encodeText, toPrintable } from "../src/printing/escpos.js";

describe("encodeText", () => {
  it("sends plain ASCII as it is", () => {
    assert.deepEqual([...encodeText("Hello 123", "CP858")], [...Buffer.from("Hello 123")]);
  });

  it("maps French accents to the PC858 bytes", () => {
    assert.deepEqual([...encodeText("é", "CP858")], [0x82]);
    assert.deepEqual([...encodeText("à", "CP858")], [0x85]);
    assert.deepEqual([...encodeText("ç", "CP858")], [0x87]);
    assert.deepEqual([...encodeText("È", "CP858")], [0xd4]);
    assert.deepEqual([...encodeText("€", "CP858")], [0xd5]);
  });

  it("uses the Latin-1 bytes for Windows-1252", () => {
    assert.deepEqual([...encodeText("é", "CP1252")], [0xe9]);
    assert.deepEqual([...encodeText("€", "CP1252")], [0x80]);
  });

  it("drops the accent when the code page cannot draw the letter", () => {
    // PC437 has no À, so it prints a plain A rather than a wrong symbol.
    assert.deepEqual([...encodeText("À", "CP437")], [0x41]);
  });

  it("replaces typographic characters with plain ones", () => {
    assert.equal(encodeText("l’été – ok…", "CP858").toString("latin1").includes("?"), false);
    assert.equal(toPrintable("’", "CP858"), "'");
    assert.equal(toPrintable("–", "CP858"), "-");
    assert.equal(toPrintable("…", "CP858"), "...");
    assert.equal(toPrintable("a\u202fb", "CP858"), "a b"); // the narrow no-break space in French number formats
  });

  it("turns œ into oe, so widths must be measured after normalising", () => {
    assert.equal(toPrintable("œufs", "CP858"), "oeufs");
    assert.equal(toPrintable("Œuvre", "CP858"), "OEuvre");
  });

  it("prints a question mark for characters it cannot draw (Arabic, emoji)", () => {
    assert.equal(toPrintable("شاي", "CP858"), "???");
    assert.equal(toPrintable("🍵", "CP858").length <= 2, true);
  });

  it("toPrintable output always encodes to exactly one byte per character", () => {
    for (const s of ["Crème brûlée – vanille (œufs) €", "Ça va? Très bien!", "naïve façade", "شاي 🍵 x"]) {
      const printable = toPrintable(s, "CP858");
      assert.equal(encodeText(printable, "CP858").length, printable.length, s);
    }
  });
});

describe("EscPos", () => {
  it("starts with reset and the code page, in that order", () => {
    const b = new EscPos("CP858").toBuffer();
    assert.deepEqual([...b], [0x1b, 0x40, 0x1b, 0x74, 19]);
    assert.deepEqual([...new EscPos("CP437").toBuffer()].slice(-1), [0]);
    assert.deepEqual([...new EscPos("CP1252").toBuffer()].slice(-1), [16]);
  });

  it("builds the commands it promises", () => {
    const b = new EscPos("CP858").align("center").bold(true).size(2, 3).line("x").cut().toBuffer();
    const tail = [...b].slice(5);
    assert.deepEqual(tail, [0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x12, 0x78, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
  });

  it("feeds a number of lines", () => {
    assert.deepEqual([...new EscPos().feed(3).toBuffer()].slice(-3), [0x1b, 0x64, 3]);
  });
});
