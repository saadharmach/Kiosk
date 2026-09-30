/**
 * Just enough ESC/POS to print a receipt: text in a chosen code page, alignment,
 * bold, character size, feed and cut. Kept free of any framework so it can be
 * tested on its own and reused by the helper.
 */

export type CodePageName = "CP858" | "CP437" | "CP1252";

interface CodePage {
  /** The byte sent after ESC t so the printer switches to this table. */
  escT: number;
  /** Characters above ASCII that this table can print, and their byte. */
  map: Record<string, number>;
}

const CP437: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87, ê: 0x88, ë: 0x89,
  è: 0x8a, ï: 0x8b, î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f, É: 0x90, æ: 0x91, ô: 0x93, ö: 0x94,
  ò: 0x95, û: 0x96, ù: 0x97, ÿ: 0x98, Ö: 0x99, Ü: 0x9a, "£": 0x9c, ñ: 0xa4, Ñ: 0xa5,
  "«": 0xae, "»": 0xaf,
};

/** PC858 = PC850 plus the euro sign: the usual choice for French. */
const CP858: Record<string, number> = {
  ...CP437,
  á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3,
  À: 0xb7, Á: 0xb5, Â: 0xb6, È: 0xd4, Ê: 0xd2, Ë: 0xd3, Î: 0xd7, Ï: 0xd8, Ô: 0xe2, Û: 0xea, Ù: 0xeb,
  "€": 0xd5,
};

/** Windows-1252: Latin-1 bytes are the code points; a few extras sit at 0x80-0x9f. */
const CP1252: Record<string, number> = { "€": 0x80, Œ: 0x8c, œ: 0x9c };
for (let c = 0xa0; c <= 0xff; c++) CP1252[String.fromCharCode(c)] = c;

export const CODEPAGES: Record<CodePageName, CodePage> = {
  CP858: { escT: 19, map: CP858 },
  CP437: { escT: 0, map: CP437 },
  CP1252: { escT: 16, map: CP1252 },
};

/** Typographic characters that have a plain equivalent every table can print. */
const PLAIN: Record<string, string> = {
  "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-",
  "…": "...", " ": " ", " ": " ", " ": " ", "œ": "oe", "Œ": "OE",
};

/** One character to one byte. Unknown characters lose their accent, else become "?". */
function encodeChar(ch: string, page: CodePage): number[] {
  const code = ch.codePointAt(0)!;
  if (code >= 0x20 && code < 0x7f) return [code];
  if (page.map[ch] !== undefined) return [page.map[ch]];
  if (PLAIN[ch] !== undefined) return [...PLAIN[ch]].flatMap((c) => encodeChar(c, page));
  const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (base !== ch && base.length > 0) return [...base].flatMap((c) => encodeChar(c, page));
  return [0x3f];
}

/**
 * The text as it will actually print: every character replaced by one the code page
 * can draw (an accent-free letter, or "?"). Lay out with this, so a string measures
 * exactly as wide as it prints: "œ" prints as "oe", which is two characters.
 */
export function toPrintable(text: string, codepage: CodePageName): string {
  const page = CODEPAGES[codepage];
  const one = (ch: string): string => {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code < 0x7f) || page.map[ch] !== undefined) return ch;
    if (PLAIN[ch] !== undefined) return [...PLAIN[ch]].map(one).join("");
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (base !== ch && base.length > 0) return [...base].map(one).join("");
    return "?";
  };
  return [...text].map(one).join("");
}

export function encodeText(text: string, codepage: CodePageName): Buffer {
  const page = CODEPAGES[codepage];
  return Buffer.from([...text].flatMap((ch) => encodeChar(ch, page)));
}

/** Builds one print job as a list of byte chunks. */
export class EscPos {
  private readonly parts: Buffer[] = [];

  constructor(private readonly codepage: CodePageName = "CP858") {
    this.raw([0x1b, 0x40]); // ESC @: reset
    this.raw([0x1b, 0x74, CODEPAGES[codepage].escT]); // ESC t n: choose the code page
  }

  raw(bytes: number[]): this {
    this.parts.push(Buffer.from(bytes));
    return this;
  }

  text(s: string): this {
    this.parts.push(encodeText(s, this.codepage));
    return this;
  }

  /** Text followed by a line feed. */
  line(s = ""): this {
    return this.text(s).raw([0x0a]);
  }

  align(a: "left" | "center" | "right"): this {
    return this.raw([0x1b, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2]);
  }

  bold(on: boolean): this {
    return this.raw([0x1b, 0x45, on ? 1 : 0]);
  }

  /** Width and height multiplier, each 1 to 8. */
  size(width = 1, height = 1): this {
    return this.raw([0x1d, 0x21, ((width - 1) << 4) | (height - 1)]);
  }

  feed(lines: number): this {
    return this.raw([0x1b, 0x64, lines]);
  }

  /** Feed to the cutter and make a partial cut. */
  cut(): this {
    return this.raw([0x1d, 0x56, 0x42, 0x00]);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.parts);
  }
}
