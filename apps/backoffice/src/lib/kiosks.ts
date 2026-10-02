import { request } from "./api";
import type { PrinterView } from "./printer";

/** One of the restaurant's bornes (kiosk machines). */
export interface Borne {
  id: string;
  /** K1, K2...: leads the references of its orders. */
  code: string;
  name: string;
  isEnabled: boolean;
  /** The address to open on the machine: it tells the kiosk which borne it is. */
  url: string;
  orders: number;
  printer: PrinterView;
}

export const listBornes = (slug: string) => request<Borne[]>(`/restaurant/${slug}/kiosks`);
export const createBorne = (slug: string, name: string) =>
  request<Borne>(`/restaurant/${slug}/kiosks`, { method: "POST", body: JSON.stringify({ name }) });
export const updateBorne = (slug: string, id: string, body: { name?: string; isEnabled?: boolean }) =>
  request<{ id: string }>(`/restaurant/${slug}/kiosks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteBorne = (slug: string, id: string) =>
  request<{ removed: boolean }>(`/restaurant/${slug}/kiosks/${id}`, { method: "DELETE" });

/** One line for a borne's printer, for the list. */
export function printerState(p: PrinterView): { text: string; tone: "ok" | "warn" | "none" } {
  if (!p.configured) return { text: "No printer yet", tone: "none" };
  if (!p.isEnabled) return { text: "Printer switched off", tone: "warn" };
  if (p.helper.online) return { text: "Printer online", tone: "ok" };
  return { text: p.helper.lastSeenAt ? "Helper offline" : "Helper never connected", tone: "warn" };
}
