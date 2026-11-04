/**
 * TPAPI WSDL inspector.
 * Downloads (or reads) the ITPAPIPOS WSDL and lists the REAL operations,
 * message parameters and data types. Nothing here is guessed.
 *
 * Usage:
 *   pnpm --filter @kiosk/tpapi-discovery wsdl                     # uses TPAPI_WSDL_URL or the test server
 *   pnpm --filter @kiosk/tpapi-discovery wsdl http://host:port/wsdl/ITPAPIPOS
 *   pnpm --filter @kiosk/tpapi-discovery wsdl ./output/ITPAPIPOS.wsdl
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const SOURCE =
  process.argv[2] ??
  process.env.TPAPI_WSDL_URL ??
  "http://testapi.untill.com:3063/wsdl/ITPAPIPOS";
const OUT_DIR = path.resolve(import.meta.dirname, "../output");

type Field = { name: string; type: string; minOccurs?: string; maxOccurs?: string };
type TypeDef = {
  name: string;
  kind: "complex" | "array" | "enum" | "element";
  base?: string;
  itemType?: string;
  fields?: Field[];
  values?: string[];
};
type Part = { name: string; type: string };
type Operation = { portType: string; name: string; input: Part[]; output: Part[]; doc?: string };

const asArray = <T>(v: T | T[] | undefined | null | ""): T[] =>
  v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v];
const strip = (q?: string): string => (q ? (q.split(":").pop() ?? q) : "");

async function loadWsdl(): Promise<string> {
  if (existsSync(SOURCE)) return readFile(SOURCE, "utf8");
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${SOURCE}`);
  return res.text();
}

function fieldsOf(node: any): Field[] {
  if (!node || typeof node !== "object") return [];
  const els = [
    ...asArray<any>(node.sequence?.element),
    ...asArray<any>(node.all?.element),
    ...asArray<any>(node.choice?.element),
  ];
  return els.map((e) => ({
    name: e["@name"] ?? strip(e["@ref"]),
    type: strip(e["@type"]) || "(inline type)",
    minOccurs: e["@minOccurs"],
    maxOccurs: e["@maxOccurs"],
  }));
}

function parseComplexType(ct: any, nameOverride?: string, kind: TypeDef["kind"] = "complex"): TypeDef {
  const name = nameOverride ?? ct["@name"];
  const cc = ct?.complexContent;
  if (cc) {
    const inner = cc.restriction ?? cc.extension;
    const arrAttr = asArray<any>(inner?.attribute).find((a) => a["@arrayType"]);
    if (arrAttr) {
      return { name, kind: "array", itemType: strip(arrAttr["@arrayType"]).replace(/\[\]$/, "") };
    }
    return { name, kind, base: strip(inner?.["@base"]), fields: fieldsOf(inner) };
  }
  return { name, kind, fields: fieldsOf(ct) };
}

async function main() {
  console.log(`\n🔎 Reading WSDL from: ${SOURCE}\n`);
  const xml = await loadWsdl();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "ITPAPIPOS.wsdl"), xml);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
    isArray: (name) =>
      ["operation", "message", "part", "complexType", "simpleType", "element",
       "enumeration", "schema", "portType", "binding", "service", "port"].includes(name),
  });
  const doc = parser.parse(xml);
  const defs = doc.definitions;
  if (!defs) throw new Error("Not a WSDL document (no <definitions> root). First 300 chars:\n" + xml.slice(0, 300));

  // Messages
  const messages = new Map<string, Part[]>();
  for (const m of asArray<any>(defs.message)) {
    messages.set(
      m["@name"],
      asArray<any>(m.part).map((p) => ({ name: p["@name"], type: strip(p["@type"] ?? p["@element"]) })),
    );
  }

  // Operations
  const operations: Operation[] = [];
  for (const pt of asArray<any>(defs.portType)) {
    for (const op of asArray<any>(pt.operation)) {
      operations.push({
        portType: pt["@name"],
        name: op["@name"],
        input: messages.get(strip(op.input?.["@message"])) ?? [],
        output: messages.get(strip(op.output?.["@message"])) ?? [],
        doc: typeof op.documentation === "string" ? op.documentation : undefined,
      });
    }
  }

  // Binding style + endpoints
  const binding = asArray<any>(defs.binding)[0];
  const soapBinding = asArray<any>(binding?.binding)[0];
  const firstBindingOp = asArray<any>(binding?.operation)[0];
  const style = soapBinding?.["@style"] ?? "unknown";
  const use = firstBindingOp?.input?.body?.["@use"] ?? "unknown";
  const namespace = firstBindingOp?.input?.body?.["@namespace"] ?? defs["@targetNamespace"];
  const endpoints = asArray<any>(defs.service).flatMap((s) =>
    asArray<any>(s.port).map((p) => p.address?.["@location"]).filter(Boolean),
  );

  // Types
  const types: TypeDef[] = [];
  for (const schema of asArray<any>(defs.types?.schema)) {
    for (const ct of asArray<any>(schema.complexType)) types.push(parseComplexType(ct));
    for (const st of asArray<any>(schema.simpleType)) {
      types.push({
        name: st["@name"],
        kind: "enum",
        base: strip(st.restriction?.["@base"]),
        values: asArray<any>(st.restriction?.enumeration).map((e) => e["@value"]),
      });
    }
    for (const el of asArray<any>(schema.element)) {
      const inline = asArray<any>(el.complexType)[0];
      if (inline) types.push(parseComplexType(inline, el["@name"], "element"));
    }
  }

  // Console output
  console.log(`SOAP style: ${style} | body use: ${use}`);
  console.log(`Namespace:  ${namespace}`);
  console.log(`Endpoints:  ${endpoints.join(", ") || "(none declared)"}`);
  console.log(`\n📋 ${operations.length} operations:\n`);
  for (const op of operations) {
    const inp = op.input.map((p) => `${p.name}: ${p.type}`).join(", ");
    const out = op.output.map((p) => `${p.name}: ${p.type}`).join(", ");
    console.log(`  • ${op.name}(${inp})\n      → ${out || "(no output)"}`);
  }
  console.log(`\n🧱 ${types.length} types (full details in output/wsdl-summary.md)`);

  // Files
  const summary = { source: SOURCE, style, use, namespace, endpoints, operations, types };
  await writeFile(path.join(OUT_DIR, "wsdl-summary.json"), JSON.stringify(summary, null, 2));

  const md: string[] = [
    `# TPAPI WSDL summary`, ``,
    `- Source: ${SOURCE}`, `- Style: ${style} / ${use}`, `- Namespace: ${namespace}`,
    `- Endpoints: ${endpoints.join(", ")}`, ``,
    `## Operations (${operations.length})`, ``,
  ];
  for (const op of operations) {
    md.push(`### ${op.name}`);
    if (op.doc) md.push(``, op.doc);
    md.push(``, `**Input**`, ...op.input.map((p) => `- ${p.name}: \`${p.type}\``));
    md.push(``, `**Output**`, ...op.output.map((p) => `- ${p.name}: \`${p.type}\``), ``);
  }
  md.push(`## Types (${types.length})`, ``);
  for (const t of types) {
    if (t.kind === "array") md.push(`### ${t.name} — array of \`${t.itemType}\``, ``);
    else if (t.kind === "enum") md.push(`### ${t.name} — enum (${t.base})`, ``, `Values: ${t.values?.join(", ")}`, ``);
    else {
      md.push(`### ${t.name}${t.base ? ` (extends ${t.base})` : ""}`, ``);
      md.push(...(t.fields ?? []).map((f) => `- ${f.name}: \`${f.type}\`${f.maxOccurs === "unbounded" ? " []" : ""}`), ``);
    }
  }
  await writeFile(path.join(OUT_DIR, "wsdl-summary.md"), md.join("\n"));

  console.log(`\n✅ Saved:\n  ${OUT_DIR}/ITPAPIPOS.wsdl\n  ${OUT_DIR}/wsdl-summary.json\n  ${OUT_DIR}/wsdl-summary.md\n`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ ${msg}`);
  if (/timeout|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(msg)) {
    console.error("   → Network problem reaching the WSDL. Try it in a browser on Windows, or check firewall/VPN.");
  }
  process.exit(1);
});