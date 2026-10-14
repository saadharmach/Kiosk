/**
 * The connection to a borne's card terminal (TPE). The TPE company's SDK is not in yet: the only connection today is
 * a SIMULATOR for testing, which never charges anything and can only be used on a server where PAYMENT_SIMULATOR=on
 * (never set on the live server). When the SDK arrives, it becomes one more provider here; nothing else changes.
 *
 * A provider is asked to start a charge; the answer (approved, declined…) comes back later through
 * PaymentsService.complete(), from wherever the SDK reports it (a callback, the helper app on the borne's PC…).
 */

export interface TerminalCharge {
  paymentId: string;
  /** The order's total as the server computed it. */
  amount: number;
  currency: string;
  /** Printed on the TPE receipt and in its own records, to find the order again. */
  reference: string;
  terminal: { id: string; name: string; config: unknown };
}

export interface PaymentProvider {
  /** What the back office shows. */
  readonly label: string;
  /** Asks the TPE to charge. Throwing means the TPE could not be asked: the payment fails at once. */
  start(charge: TerminalCharge): Promise<void>;
  /** The customer stopped: tell the TPE, best effort. */
  cancel(charge: Pick<TerminalCharge, "paymentId" | "terminal">): Promise<void>;
}

export const simulatorAllowed = (env: Record<string, string | undefined> = process.env) => env.PAYMENT_SIMULATOR === "on";

/** Charges nothing; the payment is approved or declined by hand (the kiosk shows two test buttons). */
const simulator: PaymentProvider = {
  label: "Test simulator (no real payment)",
  async start() { /* the test buttons answer */ },
  async cancel() { /* nothing to tell */ },
};

/** The providers this server can use, by the name stored on the terminal. */
export function providerFor(name: string | null | undefined, env: Record<string, string | undefined> = process.env): PaymentProvider | null {
  if (name === "SIMULATOR") return simulatorAllowed(env) ? simulator : null;
  return null;
}

/** What the back office may choose from on this server. */
export function availableProviders(env: Record<string, string | undefined> = process.env) {
  return simulatorAllowed(env) ? [{ name: "SIMULATOR", label: simulator.label }] : [];
}
