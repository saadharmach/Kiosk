import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTicket, wrap, type TicketData } from "../src/printing/ticket.js";
import { decode } from "./helpers/escpos-decode.js";

const base: TicketData = {
  restaurantName: "Resto A",
  reference: "K0-0930-005",
  printedAt: "30/09/26 14:32",
  orderType: "Sur place",
  headline: "POSEZ CE NUMÉRO SUR VOTRE TABLE",
  bigText: "705",
  lines: [
    { quantity: 1, name: "Full Grid", total: 10.5, modifiers: [{ name: "Au plat", price: 1 }] },
    { quantity: 2, name: "Soupe du jour", total: 9, modifiers: [] },
  ],
  total: 19.5,
  currency: "MAD",
  payNote: "Présentez ce numéro en caisse pour payer",
  footer: "Merci de votre visite !",
};

describe("wrap", () => {
  it("breaks at spaces without exceeding the width", () => {
    for (const l of wrap("one two three four five six seven", 10)) assert.ok(l.length <= 10, l);
  });
  it("splits a word longer than a line", () => {
    assert.deepEqual(wrap("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  });
  it("keeps explicit line breaks", () => {
    assert.deepEqual(wrap("a\nb", 10), ["a", "b"]);
  });
});

describe("buildTicket", () => {
  const d = decode(buildTicket(base));

  it("uses PC858 and ends with a cut", () => {
    assert.equal(d.codepageByte, 19);
    assert.equal(d.cut, true);
  });

  it("can leave out the cut", () => {
    assert.equal(decode(buildTicket(base, { cut: false })).cut, false);
  });

  it("puts the reference, time, type and the big number on the ticket", () => {
    const text = d.plain.join("\n");
    assert.match(text, /Commande K0-0930-005 +30\/09\/26 14:32/);
    assert.match(text, /Sur place/);
    assert.match(text, /POSEZ CE NUMÉRO SUR VOTRE TABLE/);
    assert.ok(d.plain.includes("705"));
    assert.ok(d.maxSize >= 4, "a short number is printed at 4x");
  });

  it("lists items with quantity, price on the right and indented options", () => {
    assert.ok(d.plain.some((l) => /^1 x Full Grid +10,50$/.test(l)));
    assert.ok(d.plain.some((l) => /^ {4}Au plat +\+1,00$/.test(l)));
    assert.ok(d.plain.some((l) => /^2 x Soupe du jour +9,00$/.test(l)));
  });

  it("shows the total, the pay note and the footer", () => {
    assert.ok(d.plain.some((l) => /^TOTAL +19,50 MAD$/.test(l)));
    assert.match(d.plain.join("\n"), /Présentez ce numéro en caisse pour payer/);
    assert.match(d.plain.join("\n"), /Merci de votre visite !/);
  });

  it("omits the footer when there is none", () => {
    const text = decode(buildTicket({ ...base, footer: null })).plain.join("\n");
    assert.doesNotMatch(text, /Merci de votre visite/);
  });

  it("does not show a price for a free option", () => {
    const t = decode(buildTicket({ ...base, lines: [{ quantity: 1, name: "Steak", total: 25, modifiers: [{ name: "Medium", price: 0 }] }] }));
    const line = t.plain.find((l) => l.includes("Medium"));
    assert.equal(line?.trim(), "Medium");
  });

  it("never prints a line wider than 48 columns, whatever the content", () => {
    const nasty = decode(buildTicket({
      ...base,
      restaurantName: "Restaurant Le Grand Café de la Place des Nations Unies",
      lines: [
        { quantity: 3, name: "Crème brûlée – vanille (œufs) avec une très longue description qui continue encore", total: 21, modifiers: [{ name: "œufs brouillés à la crème", price: 1.5 }] },
        { quantity: 1, name: "شاي 🍵 Supercalifragilisticexpialidocious_Supercalifragilisticexpialidocious", total: 4, modifiers: [] },
        { quantity: 12, name: "Item", total: 12345.67, modifiers: [] },
      ],
      total: 12370.67,
    }));
    for (const line of nasty.plain) assert.ok(line.length <= 48, `${line.length} chars: ${line}`);
  });

  it("keeps the price at the right edge even after œ becomes oe", () => {
    const t = decode(buildTicket({ ...base, lines: [{ quantity: 1, name: "Crème brûlée (œufs)", total: 7, modifiers: [] }] }));
    const line = t.plain.find((l) => l.includes("brûlée") || l.includes("brulee") || l.includes("Crème") || l.includes("Cr"));
    assert.ok(line && line.length === 48, `line was ${line?.length}: ${line}`);
    assert.match(line, /oeufs/);
  });

  it("uses a smaller scale for a long reference than for a stand number", () => {
    const short = decode(buildTicket({ ...base, bigText: "705" })).maxSize;
    const long = decode(buildTicket({ ...base, bigText: "K0-0930-005" })).maxSize;
    assert.ok(long < short);
    assert.ok(long * "K0-0930-005".length <= 48, "the big reference still fits the paper");
  });

  it("honours a narrower paper", () => {
    const narrow = decode(buildTicket(base, { columns: 32 }), "CP858", 32);
    for (const line of narrow.plain) assert.ok(line.length <= 32, line);
  });

  it("encodes accents with the chosen code page", () => {
    const bytes = buildTicket({ ...base, payNote: "é" }, { codepage: "CP1252" });
    assert.ok(bytes.includes(0xe9));
    assert.equal(decode(bytes, "CP1252").codepageByte, 16);
  });
});
