"use client";

import { useState } from "react";
import { STRINGS, type Locale } from "@/i18n";
import { tableInRanges, type TableRange } from "@/lib/api";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export default function TableScreen({
  locale, ranges, onConfirm, onBack,
}: {
  locale: Locale;
  ranges: TableRange[];
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
    <main className="flex min-h-dvh flex-col gap-6 p-10">
      <h1 className="mt-8 text-center text-5xl font-semibold">{t.tableTitle}</h1>
      <p className="text-center text-2xl text-(--color-ink-muted)">{t.tableHint}</p>

      <div className="my-4 flex min-h-28 items-center justify-center rounded-(--radius-card) bg-(--color-surface-2) text-7xl font-semibold tabular-nums">
        {value || "—"}
      </div>

      <p className={`min-h-8 text-center text-2xl ${showError ? "text-(--color-danger)" : "text-transparent"}`}>
        {t.tableInvalid}
      </p>

      <div className="grid grid-cols-3 gap-4">
        {KEYS.map((k) => (
          <button key={k} onClick={() => press(k)}
            className="min-h-24 rounded-(--radius-card) bg-(--color-surface-2) text-4xl font-medium tabular-nums">
            {k === "clear" ? t.clear : k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-4">
        <button onClick={onBack} className="min-h-24 flex-1 rounded-(--radius-card) border border-(--color-line) text-2xl">
          {t.back}
        </button>
        <button onClick={() => valid && onConfirm(n)} disabled={!valid}
          className="min-h-24 flex-2 rounded-(--radius-card) bg-(--color-brand) text-3xl font-medium text-(--color-brand-ink) disabled:opacity-40">
          {t.confirm}
        </button>
      </div>
    </main>
  );
}
