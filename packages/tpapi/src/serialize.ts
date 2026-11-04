import { NAMESPACES, OPERATION_NAMESPACE, OPERATIONS, TYPES, type FieldMeta } from "./generated/metadata.js";

/**
 * Element name used for items inside a SOAP-ENC array.
 * The WSDL does not state it. "item" is the usual Delphi form; if a server
 * rejects arrays, this is the first thing to try changing.
 */
export const ARRAY_ITEM_NAME = "item";

const local = (q: string): string => (q.includes(":") ? q.slice(q.indexOf(":") + 1) : q);
const prefixOf = (q: string): string => (q.includes(":") ? q.slice(0, q.indexOf(":")) : "");
const isPrimitive = (q: string): boolean => ["xs", "xsd"].includes(prefixOf(q));
const xsiType = (q: string): string => (isPrimitive(q) ? `xsd:${local(q)}` : q);

export function allFields(typeQName: string): FieldMeta[] {
  const meta = TYPES[local(typeQName)];
  if (!meta || meta.kind !== "complex") return [];
  return meta.base ? [...allFields(meta.base), ...meta.fields] : meta.fields;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
}

/** Delphi SOAP servers expect no timezone suffix. */
function formatDateTime(v: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}.${p(v.getMilliseconds(), 3)}`;
}

function primitiveText(value: unknown, xsdName: string): string {
  if (value instanceof Date) return formatDateTime(value);
  switch (xsdName) {
    case "boolean": return value ? "true" : "false";
    case "int": case "long": case "short": case "byte": case "integer": case "unsignedInt":
      return String(Math.trunc(Number(value) || 0));
    case "double": case "float": case "decimal":
      return String(Number(value) || 0);
    default:
      return escapeXml(String(value));
  }
}

export function serializeValue(name: string, typeQName: string, value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return `<${name} xsi:nil="true"/>`;

  const meta = TYPES[local(typeQName)];

  if (meta?.kind === "array") {
    const items = Array.isArray(value) ? value : [value];
    const inner = items.map((it) => serializeValue(ARRAY_ITEM_NAME, meta.itemType, it)).join("");
    return `<${name} xsi:type="SOAP-ENC:Array" SOAP-ENC:arrayType="${xsiType(meta.itemType)}[${items.length}]">${inner}</${name}>`;
  }

  if (meta?.kind === "complex") {
    const obj = (value ?? {}) as Record<string, unknown>;
    const inner = allFields(typeQName)
      .map((f) => serializeValue(f.name, f.type, obj[f.name]))
      .join("");
    return `<${name} xsi:type="${typeQName}">${inner}</${name}>`;
  }

  return `<${name} xsi:type="${xsiType(typeQName)}">${primitiveText(value, local(typeQName))}</${name}>`;
}

export function serializeRequest(operation: string, request: Record<string, unknown>): string {
  const op = OPERATIONS[operation];
  if (!op) throw new Error(`Unknown operation: ${operation}`);

  const nsDecls = Object.entries(NAMESPACES).map(([p, uri]) => `xmlns:${p}="${uri}"`).join(" ");
  const body = serializeValue(op.partName, op.requestType, request);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<SOAP-ENV:Envelope ` +
    `xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `${nsDecls} xmlns:op="${OPERATION_NAMESPACE}">` +
    `<SOAP-ENV:Body SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<op:${operation}>${body}</op:${operation}>` +
    `</SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

/** Replaces the password with *** so envelopes can be logged safely. */
export function redact(xml: string): string {
  return xml.replace(/(<Password[^>]*>)[^<]*(<\/Password>)/gi, "$1***$2");
}