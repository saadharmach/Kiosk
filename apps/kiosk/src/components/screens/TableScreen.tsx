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

      <div className="flex flex-1 flex-col items-center px-12 pt-16 pb-12">
        <h1 className="text-center font-display text-6xl leading-tight font-bold">{t.tableTitle}</h1>
        <p className="mt-4 text-center text-3xl text-(--color-ink-muted)">{t.tableHint}</p>

        <div dir="ltr"
          className={`mt-12 flex min-h-36 w-160 max-w-full items-center justify-center rounded-4xl border-4 bg-(--color-surface) font-display text-8xl font-bold tabular-nums ${
            showError ? "border-red-500 text-(--color-danger)" : "border-(--color-navy)"
          }`}>
          {value || "—"}
        </div>

        <p role="alert" className={`mt-4 flex min-h-14 items-center gap-3 text-3xl font-semibold ${showError ? "text-(--color-danger)" : "invisible"}`}>
          <Icon name="warning" className="size-8" />
          {t.tableInvalid}
        </p>

        <div dir="ltr" className="mt-6 flex items-start gap-12">
          <div className="grid w-160 grid-cols-3 gap-5">
            {KEYS.map((k) => (
              <button key={k} onClick={() => press(k)}
                aria-label={k === "clear" ? t.clear : k === "back" ? "⌫" : undefined}
                className={`flex min-h-32 items-center justify-center rounded-3xl border-2 font-display text-6xl font-bold tabular-nums shadow-sm ${
                  k === "clear"
                    ? "border-transparent bg-(--color-danger-soft) text-2xl text-(--color-danger)"
                    : k === "back"
                      ? "border-transparent bg-(--color-line)"
                      : "border-(--color-line) bg-(--color-surface)"
                }`}>
                {k === "clear" ? t.clear : k === "back" ? <Icon name="backspace" className="size-14" /> : k}
              </button>
            ))}
          </div>

          <div dir={locale === "ar" ? "rtl" : "ltr"} className="w-72">
            <button onClick={() => valid && onConfirm(n)} disabled={!valid}
              className="min-h-32 w-full rounded-full bg-(--color-brand) font-display text-4xl font-bold text-(--color-brand-ink) disabled:opacity-40">
              {t.confirm}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
