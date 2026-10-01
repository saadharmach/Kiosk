import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });

/** The text between the parentheses of every `constructor(` in the file (a file can hold several classes). */
function constructorParams(src: string): string[] {
  const found: string[] = [];
  for (let start = src.indexOf("constructor("); start >= 0; start = src.indexOf("constructor(", start + 1)) {
    let depth = 0;
    for (let i = start + "constructor".length; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) { found.push(src.slice(start + "constructor(".length, i)); break; }
    }
  }
  return found;
}

/** Splits at commas that are not inside <>, (), {} or []. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if ("<({[".includes(ch)) depth++;
    if (">)}]".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Types Nest has no way to create. (The test runner does not emit the type metadata Nest reads, so this reads the source.) */
const NOT_INJECTABLE = /^(string|number|boolean|object|any|unknown|bigint)\b|^NodeJS\.|^Record<|^Partial<|^Array<|^\{|\[\]$|^Request\b|^Response\b/;

describe("every class Nest has to create can have its constructor filled in", () => {
  it("no constructor asks for a plain object, a primitive or a settings bag without a named @Inject token", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      if (!/@(Injectable|Controller)\(/.test(src)) continue;
      const all = constructorParams(src);
      if (all.length === 0) continue;
      checked++;
      for (const p of all.flatMap(splitTopLevel)) {
        if (/@Inject\(/.test(p)) continue;
        const type = /:\s*([^=]+?)\s*(=.*)?$/s.exec(p.replace(/^(private|public|protected)?\s*(readonly\s+)?@?\w*(\([^)]*\))?\s*/, (m) => m))?.[1]?.trim();
        const typePart = p.includes(":") ? p.slice(p.indexOf(":") + 1).split("=")[0]!.trim() : undefined;
        const t = typePart ?? type;
        if (t && NOT_INJECTABLE.test(t)) problems.push(`${relative(SRC, file)}: constructor argument "${p.replace(/\s+/g, " ").slice(0, 70)}" is a ${t.split(/[<\s]/)[0]}, which Nest cannot provide`);
      }
    }
    assert.ok(checked > 30, `only looked at ${checked} classes: the scan itself is broken`);
    assert.deepEqual(problems, []);
  });

  it("the scan understands the shapes that are fine, and recognises the shapes that are not", () => {
    const bad = ["env: NodeJS.ProcessEnv = process.env", "private readonly name: string", "opts: { a: number }", "list: string[]", "o: Record<string, string>"];
    const good = ["private readonly prisma: PrismaService", "private readonly mail: MailerService", "@Inject(\"X\") env: NodeJS.ProcessEnv = process.env"];
    for (const p of bad) assert.ok(NOT_INJECTABLE.test(p.slice(p.indexOf(":") + 1).split("=")[0]!.trim()), p);
    for (const p of good) assert.ok(/@Inject\(/.test(p) || !NOT_INJECTABLE.test(p.slice(p.indexOf(":") + 1).split("=")[0]!.trim()), p);
  });
});
