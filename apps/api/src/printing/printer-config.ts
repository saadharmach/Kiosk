import { CODEPAGES, type CodePageName } from "./escpos.js";

/** Ticket behaviour, kept in Printer.config. Paper is always 80mm (48 columns). */
export interface PrinterConfig {
  /** Print a ticket for every kiosk order as soon as it is placed. */
  autoPrint: boolean;
  copies: number;
  cut: boolean;
  codepage: CodePageName;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  autoPrint: true,
  copies: 1,
  cut: true,
  codepage: "CP858",
};

export const CODEPAGE_NAMES = Object.keys(CODEPAGES) as CodePageName[];

/** Printer.config is Json. Never trust its shape: fill anything missing or wrong from the defaults. */
export function readPrinterConfig(value: unknown): PrinterConfig {
  const o = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const d = DEFAULT_PRINTER_CONFIG;
  const copies = Number(o.copies);
  return {
    autoPrint: typeof o.autoPrint === "boolean" ? o.autoPrint : d.autoPrint,
    copies: Number.isInteger(copies) && copies >= 1 && copies <= 3 ? copies : d.copies,
    cut: typeof o.cut === "boolean" ? o.cut : d.cut,
    codepage: CODEPAGE_NAMES.includes(o.codepage as CodePageName) ? (o.codepage as CodePageName) : d.codepage,
  };
}
