import { EscPos, toPrintable, type CodePageName } from "./escpos.js";

/** Everything a ticket shows, already in French. Independent of the database. */
export interface TicketData {
  restaurantName: string;
  /** The order reference, e.g. K0-0930-005. */
  reference: string;
  /** Local time of the restaurant, already formatted, e.g. "30/09/26 14:32". */
  printedAt: string;
  /** "Sur place", "À emporter", "Livraison". */
  orderType: string;
  /** The line above the big number, e.g. "POSEZ CE NUMÉRO SUR VOTRE TABLE". */
  headline: string;
  /** The number the customer needs: a stand or table number, or the reference. */
  bigText: string;
  lines: {
    quantity: number;
    name: string;
    total: number;
    modifiers: { name: string; price: number }[];
  }[];
  total: number;
  currency: string;
  /** "Présentez ce numéro en caisse pour payer". */
  payNote: string;
  footer: string | null;
}

export interface TicketOptions {
  /** Characters per line: 48 for 80mm paper. */
  columns?: number;
  codepage?: CodePageName;
  cut?: boolean;
}

const money = (n: number) => n.toFixed(2).replace(".", ",");

/** Greedy word wrap; a word longer than a line is split. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > width) {
        if (current) { out.push(current); current = ""; }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!current) current = word;
      else if (current.length + 1 + word.length <= width) current += ` ${word}`;
      else { out.push(current); current = word; }
    }
    out.push(current);
  }
  return out;
}

/** Left text and right text on one line, padded to `width`. */
const pair = (left: string, right: string, width: number) =>
  left + " ".repeat(Math.max(1, width - left.length - right.length)) + right;

export function buildTicket(source: TicketData, opts: TicketOptions = {}): Buffer {
  const width = opts.columns ?? 48;
  const codepage = opts.codepage ?? "CP858";
  const p = new EscPos(codepage);

  // Measure every string as it will really print (see toPrintable).
  const pr = (s: string) => toPrintable(s, codepage);
  const data: TicketData = {
    ...source,
    restaurantName: pr(source.restaurantName),
    reference: pr(source.reference),
    printedAt: pr(source.printedAt),
    orderType: pr(source.orderType),
    headline: pr(source.headline),
    bigText: pr(source.bigText),
    currency: pr(source.currency),
    payNote: pr(source.payNote),
    footer: source.footer === null ? null : pr(source.footer),
    lines: source.lines.map((l) => ({
      ...l,
      name: pr(l.name),
      modifiers: l.modifiers.map((m) => ({ ...m, name: pr(m.name) })),
    })),
  };
  const rule = "-".repeat(width);

  // Header: the restaurant, at double size (half as many characters fit).
  p.align("center").bold(true).size(2, 2);
  for (const l of wrap(data.restaurantName, Math.floor(width / 2))) p.line(l);
  p.size(1, 1).bold(false).align("left");
  p.line(rule);

  const head = `Commande ${data.reference}`;
  if (head.length + 1 + data.printedAt.length <= width) p.line(pair(head, data.printedAt, width));
  else {
    // Narrow paper: the time goes on its own line instead of running off the edge.
    for (const l of wrap(head, width)) p.line(l);
    p.line(pair("", data.printedAt, width));
  }
  p.line(data.orderType);
  p.line(rule);

  // The number the customer must not lose takes the middle of the ticket.
  p.align("center").bold(true);
  for (const l of wrap(data.headline, width)) p.line(l);
  const scale = data.bigText.length <= 6 ? 4 : data.bigText.length <= 12 ? 2 : 1;
  p.size(scale, scale).line(data.bigText).size(1, 1).bold(false).align("left");
  p.line(rule);

  for (const item of data.lines) {
    const price = money(item.total);
    const nameWidth = width - price.length - 1;
    const [first, ...rest] = wrap(`${item.quantity} x ${item.name}`, nameWidth);
    p.line(pair(first ?? "", price, width));
    for (const l of rest) p.line(`    ${l}`);
    for (const m of item.modifiers) {
      const extra = m.price > 0 ? `+${money(m.price)}` : "";
      const [mFirst, ...mRest] = wrap(m.name, width - 4 - (extra ? extra.length + 1 : 0));
      p.line(pair(`    ${mFirst ?? ""}`, extra, width));
      for (const l of mRest) p.line(`    ${l}`);
    }
  }
  p.line(rule);

  // The total in taller type, same width so it stays on one line.
  p.bold(true).size(1, 2).line(pair("TOTAL", `${money(data.total)} ${data.currency}`, width)).size(1, 1).bold(false);
  p.line();

  p.align("center");
  for (const l of wrap(data.payNote, width)) p.line(l);
  if (data.footer) {
    p.line();
    for (const l of wrap(data.footer, width)) p.line(l);
  }
  p.align("left");

  p.feed(3);
  if (opts.cut ?? true) p.cut();
  return p.toBuffer();
}
