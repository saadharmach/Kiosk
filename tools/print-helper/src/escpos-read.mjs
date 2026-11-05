/**
 * Reads back the tickets the server prepares (its small set of ESC/POS commands) as lines of text with their size,
 * weight and alignment, so a USB printer can print them through its Windows driver, the way Notepad prints: Windows
 * draws the letters, so accents always come out right, whatever the printer's own character tables are.
 */

/** The upper half (0x80-0xFF) of each character table, 16 per row. */
const rows = (...r) => {
  const s = r.join("");
  if ([...s].length !== 128) throw new Error(`a character table must have 128 characters, not ${[...s].length}`);
  return [...s];
};

const CP437 = rows(
  "ÇüéâäàåçêëèïîìÄÅ", "ÉæÆôöòûùÿÖÜ¢£¥₧ƒ", "áíóúñÑªº¿⌐¬½¼¡«»", "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐",
  "└┴┬├─┼╞╟╚╔╩╦╠═╬╧", "╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀", "αßΓπΣσµτΦΘΩδ∞φε∩", "≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ",
);
const CP850 = rows(
  "ÇüéâäàåçêëèïîìÄÅ", "ÉæÆôöòûùÿÖÜø£Ø×ƒ", "áíóúñÑªº¿®¬½¼¡«»", "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐",
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤", "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀", "ÓßÔÒõÕµþÞÚÛÙýÝ¯´", "­±‗¾¶§÷¸°¨·¹³²■ ",
);
/** PC858 is PC850 with the euro sign in place of the dotless i. */
const CP858 = CP850.map((c, i) => (i === 0xd5 - 0x80 ? "€" : c));
const CP1252 = [...new TextDecoder("windows-1252").decode(Uint8Array.from({ length: 128 }, (_, i) => 0x80 + i))];

/** The table chosen with ESC t n, by n (the numbers the server sends). */
const TABLES = { 0: CP437, 2: CP850, 16: CP1252, 19: CP858 };

/**
 * The ticket's pages (one per cut: copies are cut apart) as lines: { text, align, bold, width, height }, where width
 * and height are the size multipliers (1 to 8). Unknown commands are skipped.
 */
export function readTicket(bytes) {
  const buf = Buffer.from(bytes);
  const pages = [];
  let lines = [];
  let table = CP437;
  let align = "left", bold = false, width = 1, height = 1;
  let text = "";
  let started = false;
  const endLine = () => { lines.push({ text, align, bold, width, height }); text = ""; started = false; };
  const at = (k) => buf[k] ?? 0;
  for (let i = 0; i < buf.length; i++) {
    const b = at(i);
    if (b === 0x1b) {
      const c = at(i + 1);
      if (c === 0x40) { i += 1; align = "left"; bold = false; width = 1; height = 1; }
      else if (c === 0x74) { table = TABLES[at(i + 2)] ?? CP437; i += 2; }
      else if (c === 0x61) { align = ["left", "center", "right"][at(i + 2)] ?? "left"; i += 2; }
      else if (c === 0x45) { bold = at(i + 2) === 1; i += 2; }
      else if (c === 0x64) { for (let k = 0; k < at(i + 2); k++) lines.push({ text: "", align, bold, width: 1, height: 1 }); i += 2; }
      else i += 1;
      continue;
    }
    if (b === 0x1c) { i += 1; continue; } // FS . and the like
    if (b === 0x1d) {
      const c = at(i + 1);
      if (c === 0x21) { const n = at(i + 2); width = (n >> 4) + 1; height = (n & 0x0f) + 1; i += 2; }
      else if (c === 0x56) {
        // A cut ends a copy: the next one is a page of its own.
        if (started) endLine();
        pages.push(trimEnd(lines)); lines = [];
        i += at(i + 2) === 0x41 || at(i + 2) === 0x42 ? 3 : 2;
      } else i += 1;
      continue;
    }
    if (b === 0x0a) { endLine(); continue; }
    if (b < 0x20) continue;
    text += b < 0x80 ? String.fromCharCode(b) : table[b - 0x80];
    started = true;
  }
  if (started) endLine();
  if (lines.some((l) => l.text)) pages.push(trimEnd(lines));
  return pages.filter((p) => p.length > 0);
}

/** The blank lines fed before the cutter are not needed when the driver prints: keep one. */
function trimEnd(lines) {
  const out = [...lines];
  while (out.length > 1 && !out[out.length - 1].text && !out[out.length - 2].text) out.pop();
  return out;
}
