import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickLocalized, readLocalizedMap, resolveLocale } from "../src/common/locale.js";

describe("resolveLocale", () => {
  it("takes the first supported candidate", () => {
    assert.equal(resolveLocale("en", "ar"), "en");
    assert.equal(resolveLocale(undefined, "ar"), "ar");
    assert.equal(resolveLocale("xx", null, "fr"), "fr");
  });
  it("falls back to French", () => {
    assert.equal(resolveLocale(), "fr");
    assert.equal(resolveLocale("de", 5, {}), "fr");
  });
});

describe("pickLocalized", () => {
  it("returns the asked language when it has text", () => {
    assert.equal(pickLocalized({ fr: "Soupe", en: "Soup", ar: "شوربة" }, "en", "x"), "Soup");
  });
  it("falls through the other languages before the fallback", () => {
    assert.equal(pickLocalized({ fr: "Soupe" }, "ar", "x"), "Soupe");
    assert.equal(pickLocalized({ ar: "شوربة" }, "en", "x"), "شوربة");
  });
  it("ignores blank text", () => {
    assert.equal(pickLocalized({ fr: "  ", en: "Soup" }, "fr", "x"), "Soup");
  });
  it("uses the fallback when nothing is usable", () => {
    assert.equal(pickLocalized({}, "fr", "fallback"), "fallback");
    assert.equal(pickLocalized(null, "fr", "fallback"), "fallback");
    assert.equal(pickLocalized([], "fr", "fallback"), "fallback");
    assert.equal(pickLocalized(undefined, "fr", null), null);
  });
  it("accepts a plain string", () => {
    assert.equal(pickLocalized("Soupe", "en", "x"), "Soupe");
    assert.equal(pickLocalized("", "en", "x"), "x");
  });
});

describe("readLocalizedMap", () => {
  it("keeps only the three languages with text, trimmed", () => {
    assert.deepEqual(readLocalizedMap({ fr: " Bonjour ", en: "", ar: 5, de: "Hallo" }), { fr: "Bonjour" });
  });
  it("returns an empty map for anything else", () => {
    for (const v of [null, undefined, "x", 3, []]) assert.deepEqual(readLocalizedMap(v), {});
  });
});
