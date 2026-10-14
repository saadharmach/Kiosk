import { request } from "./api";

export interface PaymentSettings {
  cardEnabled: boolean;
  cardUntillPaymentId: string | null;
  cashEnabled: boolean;
  cashUntillPaymentId: string | null;
  /** Cash: closed in unTill at once (true), or left open to be paid at the counter (false). */
  cashClosesOrder: boolean;
}

export interface PaymentPage {
  settings: PaymentSettings;
  /** The restaurant's payment types, as unTill has them (read with the menu). */
  untillPayments: { untillId: string; number: number; name: string; kind: number }[];
  /** The card terminal connections this server can use. */
  providers: { name: string; label: string }[];
  bornes: {
    kioskId: string; code: string; name: string; borneEnabled: boolean;
    terminal: { provider: string | null; isEnabled: boolean; usable: boolean } | null;
  }[];
  warnings: string[];
}

export const getPaymentSettings = (slug: string) => request<PaymentPage>(`/restaurant/${slug}/payment-settings`);
export const savePaymentSettings = (slug: string, body: PaymentSettings) =>
  request<PaymentPage>(`/restaurant/${slug}/payment-settings`, { method: "PUT", body: JSON.stringify(body) });
export const saveTerminal = (slug: string, kioskId: string, body: { provider: string | null; isEnabled: boolean }) =>
  request<PaymentPage>(`/restaurant/${slug}/payment-settings/terminals/${kioskId}`, { method: "PUT", body: JSON.stringify(body) });
