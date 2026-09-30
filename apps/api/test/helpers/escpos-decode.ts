import { CODEPAGES, type CodePageName } from "../../src/printing/escpos.js";

export interface Decoded {
  /** The lines as a printer would draw them, alignment applied. */
  lines: string[];
  /** The text lines only, with no size or alignment marks. */
  plain: string[];
  cut: boolean;
  codepageByte: number | null;
  /** Largest size multiplier seen. */
  maxSize: number;
}

/** Reads ESC/POS bytes back into the ticket a printer would draw. Approximate, but exact on widths. */
export function decode(buf: Buffer, page: CodePageName = "CP858", columns = 48): Decoded {
  const reverse = new Map(Object.entries(CODEPAGES[page].map).map(([ch, b]) => [b, ch]));
  const lines: string[] = [];
  const plain: string[] = [];
  let line = "";
  let align = 0;
  let size = 1;
  let cut = false;
  let codepageByte: number | null = null;
  let maxSize = 1;

  const flush = () => {
    const cols = Math.floor(columns / size);
    let l = line;
    if (align === 1) l = " ".repeat(Math.max(0, Math.floor((cols - l.length) / 2))) + l;
    if (align === 2) l = " ".repeat(Math.max(0, cols - l.length)) + l;
    lines.push((size > 1 ? `[x${size}]` : "") + l);
    plain.push(line);
    line = "";
  };

  const at = (k: number) => buf[k] ?? 0;
  for (let i = 0; i < buf.length; i++) {
    const b = at(i);
    if (b === 0x1b) {
      const c = at(i + 1);
      if (c === 0x40) i += 1;
      else if (c === 0x74) { codepageByte = at(i + 2); i += 2; }
      else if (c === 0x61) { align = at(i + 2); i += 2; }
      else if (c === 0x45) i += 2;
      else if (c === 0x64) { i += 2; for (let k = 0; k < at(i); k++) { lines.push(""); plain.push(""); } }
      continue;
    }
    if (b === 0x1d) {
      const c = at(i + 1);
      if (c === 0x21) { size = (at(i + 2) >> 4) + 1; maxSize = Math.max(maxSize, size); i += 2; }
      else if (c === 0x56) { cut = true; i += 3; }
      continue;
    }
    if (b === 0x0a) { flush(); continue; }
    line += b < 0x80 ? String.fromCharCode(b) : (reverse.get(b) ?? "?");
  }
  if (line) flush();
  return { lines, plain, cut, codepageByte, maxSize };
}
