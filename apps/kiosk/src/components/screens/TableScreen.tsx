"use client";

import { useState } from "react";
import { STRINGS, type Locale } from "@/i18n";
import { tableInRanges, type TableRange } from "@/lib/api";
import KioskHeader from "../KioskHeader";
import { Icon } from "../icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export default function TableScreen({
  locale, name, ranges, onLocale, onConfirm, onBack,
}: {
  locale: Locale;
  name: string;
  ranges: TableRange[];
  onLocale: (l: Locale) => void;
  onConfirm: (n: number) => void;
  onBack: () => void;
}) {
  const t = STRINGS[locale];
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const n = Number(value);
  const valid = value.length > 0 && Number.isInteger(n) && tableInRanges(n, ranges);
  const showError = touched && value.length > 0 && !valid;

  const press = (k: string) => {
    setTouched(true);
    if (k === "clear") return setValue("");
    if (k === "back") return setValue((v) => v.slice(0, -1));
    setValue((v) => (v.length >= 4 ? v : v + k));
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
          {t.tableInvalid}
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
          <button onClick={() => valid && onConfirm(n)} disabled={!valid}
            className="min-h-28 flex-[2] rounded-full bg-(--color-brand) font-display text-5xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase disabled:bg-(--color-line) disabled:text-(--color-ink-muted)">
            {t.confirm}
          </button>
        </div>
      </div>
    </main>
  );
}
