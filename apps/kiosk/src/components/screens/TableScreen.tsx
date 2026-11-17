"use client";

import { useState } from "react";
import { STRINGS, type Locale } from "@/i18n";
import { checkTable, isUnavailableError, isNotRegisteredError, tableInRanges, type ApiError, type TableRange } from "@/lib/api";
import KioskHeader from "../KioskHeader";
import { Icon } from "../icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export default function TableScreen({
  slug, locale, name, ranges, taken: takenAtStart = null, onLocale, onConfirm, onBack, onUnavailable,
}: {
  slug: string;
  locale: Locale;
  name: string;
  ranges: TableRange[];
  /** A number refused when the order was placed (taken meanwhile): shown at once. */
  taken?: number | null;
  onUnavailable?: (e: ApiError) => void;
  onLocale: (l: Locale) => void;
  onConfirm: (n: number) => void;
  onBack: () => void;
}) {
  const t = STRINGS[locale];
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  // The number unTill still has a bill open on, and whether we are asking.
  const [taken, setTaken] = useState<number | null>(takenAtStart);
  const [checking, setChecking] = useState(false);

  const n = Number(value);
  const valid = value.length > 0 && Number.isInteger(n) && tableInRanges(n, ranges);
  const showInvalid = touched && value.length > 0 && !valid;
  const showError = showInvalid || taken !== null;

  const press = (k: string) => {
    if (checking) return;
    setTouched(true);
    setTaken(null);
    if (k === "clear") return setValue("");
    if (k === "back") return setValue((v) => v.slice(0, -1));
    setValue((v) => (v.length >= 4 ? v : v + k));
  };

  // A number with a bill still open in unTill would land on that bill: the customer takes another chevalet. If the
  // question cannot be answered, the customer goes on (the order is checked again when it is placed).
  const confirm = async () => {
    if (!valid || checking) return;
    setChecking(true);
    try {
      const r = await checkTable(slug, n);
      if (!r.free) { setTaken(n); return; }
    } catch (e) {
      if (isUnavailableError(e) || isNotRegisteredError(e)) return onUnavailable?.(e as ApiError);
    } finally {
      setChecking(false);
    }
    onConfirm(n);
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <KioskHeader name={name} locale={locale} onLocale={onLocale} onBack={onBack} backLabel={t.back} />

      <div className="flex flex-1 flex-col items-center px-14 pt-12 pb-12">
        <h1 className="text-center font-display text-8xl leading-[0.95] font-extrabold">{t.tableTitle}</h1>
        <p className="mt-4 text-center text-3xl font-medium text-(--color-ink-muted)">{t.tableHint}</p>

        {/* What the customer typed, big. */}
        <div dir="ltr"
          className={`mt-10 flex min-h-40 w-[44rem] max-w-full items-center justify-center rounded-[2.5rem] border-4 bg-(--color-surface) font-display text-[9rem] leading-none font-extrabold tabular-nums ${
            showError ? "border-(--color-danger) text-(--color-danger)" : "border-(--color-brand)"
          }`}>
          {value || <span className="text-(--color-line)">—</span>}
        </div>

        <p role="alert" className={`mt-4 flex min-h-14 items-center gap-3 text-3xl font-bold ${showError ? "text-(--color-danger)" : "invisible"}`}>
          <Icon name="warning" className="size-8" />
          {taken !== null ? t.tableTaken.replace("{n}", String(taken)) : t.tableInvalid}
        </p>

        <div dir="ltr" className="mt-4 grid w-[44rem] max-w-full grid-cols-3 gap-5">
          {KEYS.map((k) => (
            <button key={k} onClick={() => press(k)}
              aria-label={k === "clear" ? t.clear : k === "back" ? "⌫" : undefined}
              className={`flex min-h-32 items-center justify-center rounded-[2rem] font-display text-7xl font-extrabold tabular-nums shadow-md ${
                k === "clear"
                  ? "bg-(--color-danger-soft) text-2xl tracking-wide text-(--color-danger) uppercase"
                  : k === "back"
                    ? "bg-(--color-line)"
                    : "bg-(--color-surface)"
              }`}>
              {k === "clear" ? t.clear : k === "back" ? <Icon name="backspace" className="size-14" /> : k}
            </button>
          ))}
        </div>

        <span className="flex-1" />
        <div className="flex w-[44rem] max-w-full gap-5">
          <button onClick={onBack}
            className="min-h-28 flex-1 rounded-full border-2 border-(--color-line) bg-(--color-surface) font-display text-4xl font-extrabold tracking-wide uppercase">
            {t.back}
          </button>
          <button onClick={confirm} disabled={!valid || checking || taken !== null}
            className="min-h-28 flex-[2] rounded-full bg-(--color-brand) font-display text-5xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase disabled:bg-(--color-line) disabled:text-(--color-ink-muted)">
            {checking ? t.tableChecking : t.confirm}
          </button>
        </div>
      </div>
    </main>
  );
}
