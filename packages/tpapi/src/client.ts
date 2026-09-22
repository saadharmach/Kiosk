import { XMLParser } from "fast-xml-parser";
import { randomUUID } from "node:crypto";
import { DEFAULT_ENDPOINT, OPERATIONS } from "./generated/metadata.js";
import {
  TpapiFaultError, TpapiReturnCodeError, TpapiTransportError, TpapiUnknownOperationError,
} from "./errors.js";
import { coerce } from "./parse.js";
import { redact, serializeRequest } from "./serialize.js";

export interface TpapiCredentials {
  userName: string;
  password: string;
  appToken: string;
  appName?: string;
}

export interface TpapiLogEvent {
  correlationId: string;
  operation: string;
  endpoint: string;
  durationMs: number;
  ok: boolean;
  returnCode?: number;
  returnMessage?: string;
  error?: string;
  requestXml?: string;   // password already redacted
  responseXml?: string;
}

export interface TpapiClientOptions {
  endpoint?: string;
  credentials: TpapiCredentials;
  timeoutMs?: number;
  /** ReturnCode values treated as success. Default [0]. */
  successCodes?: number[];
  /** Include the XML in log events. Debugging only. */
  captureXml?: boolean;
  logger?: (event: TpapiLogEvent) => void;
}

export interface TpapiCallOptions {
  timeoutMs?: number;
  correlationId?: string;
  /** Skip the ReturnCode check and return the raw response. */
  ignoreReturnCode?: boolean;
}

export interface TpapiBaseResponse {
  ReturnCode: number;
  ReturnMessage: string;
  [key: string]: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const firstChild = (node: unknown): unknown => {
  if (!node || typeof node !== "object") return undefined;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!k.startsWith("@") && k !== "#text") return v;
  }
  return undefined;
};

export class TpapiClient {
  readonly endpoint: string;
  private readonly credentials: TpapiCredentials;
  private readonly timeoutMs: number;
  private readonly successCodes: number[];
  private readonly captureXml: boolean;
  private readonly logger?: (event: TpapiLogEvent) => void;

  constructor(options: TpapiClientOptions) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.credentials = options.credentials;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.successCodes = options.successCodes ?? [0];
    this.captureXml = options.captureXml ?? false;
    this.logger = options.logger;
  }

  async call<T extends TpapiBaseResponse = TpapiBaseResponse>(
    operation: string,
    request: Record<string, unknown> = {},
    callOptions: TpapiCallOptions = {},
  ): Promise<T> {
    const op = OPERATIONS[operation];
    if (!op) throw new TpapiUnknownOperationError(operation);

    const correlationId = callOptions.correlationId ?? randomUUID();
    const payload: Record<string, unknown> = {
      UserName: this.credentials.userName,
      Password: this.credentials.password,
      AppToken: this.credentials.appToken,
      AppName: this.credentials.appName ?? "KioskPlatform",
      ...request,
    };

    const requestXml = serializeRequest(operation, payload);
    const started = Date.now();
    const base = { correlationId, operation, endpoint: this.endpoint };
    const log = (e: Partial<TpapiLogEvent> & { ok: boolean }) =>
      this.logger?.({
        ...base,
        durationMs: Date.now() - started,
        ...(this.captureXml ? { requestXml: redact(requestXml) } : {}),
        ...e,
      } as TpapiLogEvent);

    let responseText: string;
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"${op.soapAction}"`,
        },
        body: requestXml,
        signal: AbortSignal.timeout(callOptions.timeoutMs ?? this.timeoutMs),
      });
      responseText = await res.text();
      if (!res.ok && !responseText.includes("Fault")) {
        const err = new TpapiTransportError(`HTTP ${res.status} ${res.statusText}`, { ...base, body: responseText.slice(0, 500) });
        log({ ok: false, error: err.message });
        throw err;
      }
    } catch (e) {
      if (e instanceof TpapiTransportError) throw e;
      const err = new TpapiTransportError(e instanceof Error ? e.message : String(e), base);
      log({ ok: false, error: err.message });
      throw err;
    }

    const doc = parser.parse(responseText);
    const body = doc?.Envelope?.Body;
    const captured = this.captureXml ? { responseXml: responseText } : {};

    const fault = body?.Fault;
    if (fault) {
      const err = new TpapiFaultError(
        String(fault.faultcode ?? "unknown"),
        String(fault.faultstring ?? ""),
        base,
      );
      log({ ok: false, error: err.message, ...captured });
      throw err;
    }

    const opResponse = firstChild(body);
    const returnNode = (opResponse as Record<string, unknown> | undefined)?.[op.responsePart];
    const data = coerce(returnNode, op.responseType) as T;

    const returnCode = Number(data?.ReturnCode ?? 0);
    const returnMessage = String(data?.ReturnMessage ?? "");
       const codeOk = this.successCodes.includes(returnCode);

    log({ ok: codeOk, returnCode, returnMessage, ...captured });

    if (!codeOk && !callOptions.ignoreReturnCode) {
      throw new TpapiReturnCodeError(returnCode, returnMessage, base);
    }
  }

  /** Connection test: a real Ping call with timing. */
  async ping(callOptions: TpapiCallOptions = {}): Promise<{ ok: boolean; durationMs: number; returnCode?: number; message?: string; error?: string }> {
    const started = Date.now();
    try {
      const res = await this.call("Ping", {}, { ...callOptions, ignoreReturnCode: true });
      return {
        ok: this.successCodes.includes(Number(res.ReturnCode)),
        durationMs: Date.now() - started,
        returnCode: Number(res.ReturnCode),
        message: String(res.ReturnMessage ?? ""),
      };
    } catch (e) {
      return { ok: false, durationMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
    }
  }
}