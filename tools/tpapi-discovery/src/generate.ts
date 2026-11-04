/**
 * Generates packages/tpapi/src/generated/{types.ts,metadata.ts} from the WSDL.
 * Run after downloading the WSDL with `wsdl`. Never edit the generated files.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const WSDL_FILE = path.resolve(import.meta.dirname, "../output/ITPAPIPOS.wsdl");
const OUT_DIR = path.resolve(import.meta.dirname, "../../../packages/tpapi/src/generated");

type FieldMeta = { name: string; type: string; optional: boolean };
type TypeMeta =
  | { kind: "complex"; base?: string; fields: FieldMeta[] }
  | { kind: "array"; itemType: string }
  | { kind: "enum"; base: string; values: string[] };

const asArray = <T>(v: T | T[] | undefined | null | ""): T[] =>
  v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v];
const local = (q: string): string => (q.includes(":") ? q.slice(q.indexOf(":") + 1) : q);
const prefix = (q: string): string => (q.includes(":") ? q.slice(0, q.indexOf(":")) : "");

const XSD_TS: Record<string, string> = {
  string: "string", int: "number", long: "number", double: "number", float: "number",
  decimal: "number", short: "number", byte: "number", unsignedInt: "number",
  integer: "number", boolean: "boolean", dateTime: "string", date: "string",
  time: "string", base64Binary: "string",
};

function tsType(qname: string | undefined): string {
  if (!qname) return "unknown";
  const p = prefix(qname);
  const n = local(qname);
  if (p === "xs" || p === "xsd") return XSD_TS[n] ?? "unknown";
  if (p === "soapenc") return "unknown";
  return n;
}

function fieldsFrom(node: any): FieldMeta[] {
  const els = [
    ...asArray<any>(node?.["xs:sequence"]?.["xs:element"]),
    ...asArray<any>(node?.["xs:all"]?.["xs:element"]),
  ];
  return els.map((e) => ({
    name: e["@_name"],
    type: e["@_type"] ?? "xs:string",
    optional: e["@_minOccurs"] === "0" || e["@_minOccurs"] === 0,
  }));
}

async function main() {
  const xml = await readFile(WSDL_FILE, "utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) =>
      ["xs:schema", "xs:complexType", "xs:simpleType", "xs:element", "xs:attribute",
       "xs:enumeration", "message", "part", "operation", "binding", "portType"].includes(name),
  });
  const doc = parser.parse(xml);
  const defs = doc.definitions;

  // Namespace prefixes used by the types (urn:... only)
  const namespaces: Record<string, string> = {};
  for (const [k, v] of Object.entries(defs)) {
    if (k.startsWith("@_xmlns:") && typeof v === "string" && v.startsWith("urn:")) {
      namespaces[k.slice("@_xmlns:".length)] = v;
    }
  }

  // ---- Types ----
  const types: Record<string, TypeMeta> = {};
  for (const schema of asArray<any>(defs.types?.["xs:schema"])) {
    for (const ct of asArray<any>(schema["xs:complexType"])) {
      const name: string = ct["@_name"];
      const cc = ct["xs:complexContent"];
      if (cc) {
        const ext = cc["xs:extension"];
        const res = cc["xs:restriction"];
        if (res) {
          const arrAttr = asArray<any>(res["xs:attribute"]).find((a) => a["@_n1:arrayType"]);
          const raw: string | undefined = arrAttr?.["@_n1:arrayType"];
          if (raw) { types[name] = { kind: "array", itemType: raw.replace(/\[\]$/, "") }; continue; }
        }
        types[name] = { kind: "complex", base: ext?.["@_base"], fields: fieldsFrom(ext ?? res) };
        continue;
      }
      types[name] = { kind: "complex", fields: fieldsFrom(ct) };
    }
    for (const st of asArray<any>(schema["xs:simpleType"])) {
      types[st["@_name"]] = {
        kind: "enum",
        base: st["xs:restriction"]?.["@_base"] ?? "xs:string",
        values: asArray<any>(st["xs:restriction"]?.["xs:enumeration"]).map((e) => e["@_value"]),
      };
    }
  }

  // ---- Messages ----
  const messages = new Map<string, { part: string; type: string }>();
  for (const m of asArray<any>(defs.message)) {
    const p = asArray<any>(m.part)[0];
    if (p) messages.set(m["@_name"], { part: p["@_name"], type: p["@_type"] });
  }

  // ---- Operations (portType + binding) ----
  const soapActions = new Map<string, string>();
  for (const b of asArray<any>(defs.binding)) {
    for (const op of asArray<any>(b.operation)) {
      const action = op["soap:operation"]?.["@_soapAction"];
      if (action) soapActions.set(op["@_name"], action);
    }
  }

  const operations: Record<string, {
    soapAction: string; partName: string; requestType: string;
    responsePart: string; responseType: string;
  }> = {};
  for (const pt of asArray<any>(defs.portType)) {
    for (const op of asArray<any>(pt.operation)) {
      const name: string = op["@_name"];
      const inMsg = messages.get(local(op.input?.["@_message"] ?? ""));
      const outMsg = messages.get(local(op.output?.["@_message"] ?? ""));
      if (!inMsg || !outMsg) continue;
      operations[name] = {
        soapAction: soapActions.get(name) ?? "",
        partName: inMsg.part,
        requestType: inMsg.type,
        responsePart: outMsg.part,
        responseType: outMsg.type,
      };
    }
  }

  const endpoint: string = asArray<any>(defs.service)[0]?.port?.["soap:address"]?.["@_location"] ?? "";
  const opNamespace = Object.values(operations)[0]?.soapAction.split("#")[0] ?? "";

  // ---- Emit types.ts ----
  const banner = `// GENERATED FROM ITPAPIPOS.wsdl — DO NOT EDIT BY HAND.\n// Regenerate: pnpm --filter @kiosk/tpapi-discovery generate\n\n`;
  const t: string[] = [banner];
  for (const [name, meta] of Object.entries(types)) {
    if (meta.kind === "array") { t.push(`export type ${name} = ${tsType(meta.itemType)}[];\n`); continue; }
    if (meta.kind === "enum") {
      t.push(`export type ${name} = ${meta.values.length ? meta.values.map((v) => `"${v}"`).join(" | ") : tsType(meta.base)};\n`);
      continue;
    }
    const ext = meta.base && tsType(meta.base) !== "unknown" ? ` extends ${tsType(meta.base)}` : "";
    t.push(`export interface ${name}${ext} {`);
    for (const f of meta.fields) t.push(`  ${f.name}${f.optional ? "?" : ""}: ${tsType(f.type)};`);
    t.push(`}\n`);
  }

  // ---- Emit metadata.ts ----
  const m: string[] = [
    banner,
    `export type FieldMeta = { name: string; type: string; optional: boolean };`,
    `export type TypeMeta =`,
    `  | { kind: "complex"; base?: string; fields: FieldMeta[] }`,
    `  | { kind: "array"; itemType: string }`,
    `  | { kind: "enum"; base: string; values: string[] };`,
    `export type OperationMeta = {`,
    `  soapAction: string; partName: string; requestType: string;`,
    `  responsePart: string; responseType: string;`,
    `};\n`,
    `export const DEFAULT_ENDPOINT = ${JSON.stringify(endpoint)};`,
    `export const OPERATION_NAMESPACE = ${JSON.stringify(opNamespace)};`,
    `export const NAMESPACES: Record<string, string> = ${JSON.stringify(namespaces, null, 2)};\n`,
    `export const TYPES: Record<string, TypeMeta> = ${JSON.stringify(types, null, 2)};\n`,
    `export const OPERATIONS: Record<string, OperationMeta> = ${JSON.stringify(operations, null, 2)};\n`,
  ];

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "types.ts"), t.join("\n"));
  await writeFile(path.join(OUT_DIR, "metadata.ts"), m.join("\n"));

  console.log(`✅ Generated ${Object.keys(types).length} types and ${Object.keys(operations).length} operations`);
  console.log(`   ${OUT_DIR}/types.ts`);
  console.log(`   ${OUT_DIR}/metadata.ts`);
}

main().catch((e) => { console.error(`❌ ${e instanceof Error ? e.message : e}`); process.exit(1); });