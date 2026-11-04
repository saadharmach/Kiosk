import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCALES, STRINGS, dirOf, isLocale, localized, money } from "../src/i18n/index";

describe("the three languages", () => {
  const keys = (l: (typeof LOCALES)[number]) => Object.keys(STRINGS[l]).sort();

  it("have exactly the same set of texts", () => {
    for (const l of LOCALES) assert.deepEqual(keys(l), keys("fr"), `${l} differs from fr`);
  });

  it("have no empty text", () => {
    for (const l of LOCALES) for (const [k, v] of Object.entries(STRINGS[l])) assert.ok(String(v).trim().length > 0, `${l}.${k}`);
  });

  it("use the same placeholders in every language", () => {
    const slots = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const k of Object.keys(STRINGS.fr)) {
      const fr = slots((STRINGS.fr as Record<string, string>)[k]!);
      for (const l of LOCALES) assert.equal(slots((STRINGS[l] as Record<string, string>)[k]!), fr, `${l}.${k}`);
    }
  });

  it("write Arabic right to left and the others left to right", () => {
    assert.equal(dirOf("ar"), "rtl");
    assert.equal(dirOf("fr"), "ltr");
    assert.equal(dirOf("en"), "ltr");
  });

  it("recognise only the supported languages", () => {
    assert.equal(isLocale("ar"), true);
    assert.equal(isLocale("de"), false);
    assert.equal(isLocale(""), false);
  });
});

describe("localized", () => {
  it("returns the customer's language, else any language with text, else null", () => {
    assert.equal(localized({ fr: "Bonjour", en: "Hello" }, "en"), "Hello");
    assert.equal(localized({ fr: "Bonjour" }, "ar"), "Bonjour");
    assert.equal(localized({ fr: "  " }, "fr"), null);
    assert.equal(localized({}, "fr"), null);
    assert.equal(localized(undefined, "fr"), null);
  });
});

describe("money", () => {
  it("formats in the customer's language with western digits, even in Arabic", () => {
    assert.match(money(9.5, "MAD", "en"), /9\.50/);
    assert.match(money(9.5, "MAD", "fr"), /9,50/);
    assert.match(money(9.5, "MAD", "ar"), /9[.,٫]50/);
    assert.doesNotMatch(money(1234.5, "MAD", "ar"), /[٠-٩]/);
  });
  it("does not throw on an unknown currency code", () => {
    assert.ok(money(1, "XX", "en").length > 0);
  });
});
