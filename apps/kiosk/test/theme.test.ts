import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BRAND, brandColors } from "../src/lib/theme";

describe("brandColors", () => {
  it("keeps a valid colour and picks dark text on a light accent", () => {
    assert.deepEqual(brandColors("#f59e0b"), { brand: "#f59e0b", ink: "#14110d" });
    assert.deepEqual(brandColors("#FFFFFF"), { brand: "#FFFFFF", ink: "#14110d" });
  });

  it("picks white text on a dark accent", () => {
    assert.equal(brandColors("#0E6B54").ink, "#ffffff");
    assert.equal(brandColors("#000000").ink, "#ffffff");
    assert.equal(brandColors("#1e3a8a").ink, "#ffffff");
  });

  it("expands the short form", () => {
    assert.deepEqual(brandColors("#fff"), { brand: "#ffffff", ink: "#14110d" });
    assert.equal(brandColors("#000").brand, "#000000");
  });

  it("falls back to the default accent for anything unusable", () => {
    const fallback = brandColors(DEFAULT_BRAND);
    for (const bad of [null, undefined, "", "red", "#12", "#12345", "#1234567", "#gggggg", "0E6B54", "rgb(1,2,3)", "#0E6B54;background:url(x)", "#fff } body { display:none"]) {
      assert.deepEqual(brandColors(bad as never), fallback, String(bad));
    }
  });

  it("only ever returns a hex colour, so it can never inject CSS", () => {
    for (const input of ["#fff;", "url(javascript:1)", "</style>", "#abc\n"]) {
      assert.match(brandColors(input).brand, /^#[0-9a-f]{6}$/i);
    }
  });

  it("gives every accent the better of the two text colours (contrast at least 4.2:1)", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    let worst = Infinity;
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const { brand, ink } = brandColors(hex);
      const [a, c] = [lum(brand), lum(ink === "#ffffff" ? "#ffffff" : "#14110d")].sort((x, y) => y - x);
      worst = Math.min(worst, (a! + 0.05) / (c! + 0.05));
    }
    assert.ok(worst >= 4.2, `the worst accent/text pair has contrast ${worst.toFixed(2)}`);
  });
});
