import { TYPES } from "./generated/metadata.js";
import { allFields } from "./serialize.js";

const local = (q: string): string => (q.includes(":") ? q.slice(q.indexOf(":") + 1) : q);
const prefixOf = (q: string): string => (q.includes(":") ? q.slice(0, q.indexOf(":")) : "");

function primitive(node: unknown, xsdName: string): unknown {
  if (node === undefined || node === null) return undefined;
  let raw: unknown = node;
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o["@nil"] === "true" || o["@xsi:nil"] === "true") return null;
    raw = o["#text"] ?? "";
  }
  const s = String(raw);
  switch (xsdName) {
    case "boolean": return s === "true" || s === "1";
    case "int": case "long": case "short": case "byte": case "integer":
    case "unsignedInt": case "double": case "float": case "decimal":
      return s === "" ? 0 : Number(s);
    default: return s;
  }
}

function coerceArray(node: unknown, itemQName: string): unknown[] {
  if (node === undefined || node === null || node === "") return [];
  if (typeof node !== "object") return [];
  const out: unknown[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith("@") || key === "#text") continue;
    for (const item of Array.isArray(value) ? value : [value]) out.push(coerce(item, itemQName));
  }
  return out;
}

export function coerce(node: unknown, typeQName: string): unknown {
  const meta = TYPES[local(typeQName)];
  if (meta?.kind === "array") return coerceArray(node, meta.itemType);
  if (meta?.kind === "complex") {
    const src = (node ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const f of allFields(typeQName)) {
      const value = coerce(src[f.name], f.type);
      if (value !== undefined) out[f.name] = value;
    }
    return out;
  }
  if (meta?.kind === "enum") return primitive(node, local(meta.base));
  if (prefixOf(typeQName) === "xs" || prefixOf(typeQName) === "xsd") return primitive(node, local(typeQName));
  return primitive(node, "string");
}