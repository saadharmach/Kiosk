import { request } from "./api";

export type CodePage = "CP858" | "CP437" | "CP1252";

export interface PrinterConfig {
  autoPrint: boolean;
  copies: number;
  cut: boolean;
  codepage: CodePage;
}

export type PrinterView =
  | { configured: false; config: PrinterConfig }
  | {
      configured: true;
      name: string;
      address: string | null;
      port: number | null;
      isEnabled: boolean;
      config: PrinterConfig;
      helper: { tokenIssuedAt: string | null; online: boolean; lastSeenAt: string | null };
      lastError: { message: string; at: string | null } | null;
    };

export interface PrintJobRow {
  id: string;
  kind: "TICKET" | "TEST";
  status: "QUEUED" | "PRINTING" | "PRINTED" | "FAILED";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  printedAt: string | null;
  order: { id: string; reference: string } | null;
}

export interface SavePrinterBody {
  name: string;
  address: string;
  port: number;
  isEnabled: boolean;
  autoPrint: boolean;
  copies: number;
  cut: boolean;
  codepage: CodePage;
}

export const getPrinter = (slug: string) => request<PrinterView>(`/restaurant/${slug}/printer`);

export const savePrinter = (slug: string, body: SavePrinterBody) =>
  request<PrinterView>(`/restaurant/${slug}/printer`, { method: "PUT", body: JSON.stringify(body) });

/** The token is only ever returned here, once. */
export const issuePrinterToken = (slug: string) =>
  request<{ token: string }>(`/restaurant/${slug}/printer/token`, { method: "POST" });

export const testPrint = (slug: string) =>
  request<{ id: string }>(`/restaurant/${slug}/printer/test`, { method: "POST" });

export const listPrintJobs = (slug: string) => request<PrintJobRow[]>(`/restaurant/${slug}/printer/jobs?limit=15`);

export const reprintOrder = (slug: string, orderId: string) =>
  request<{ id: string }>(`/restaurant/${slug}/orders/${orderId}/print`, { method: "POST" });
