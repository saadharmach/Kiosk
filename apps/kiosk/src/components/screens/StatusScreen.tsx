"use client";

import type { Locale } from "@/i18n";
import KioskHeader from "../KioskHeader";
import { Icon, type IconName } from "../icons";

/** A full-screen message with one main action: errors, lost connection. */
export default function StatusScreen({
  header, icon, title, text, action, secondary,
}: {
  /** Shown as the navy bar when the restaurant is known. */
  header?: { name: string; locale: Locale; onLocale: (l: Locale) => void };
  icon: IconName;
  title: string;
  text: string;
  action: { label: string; icon: IconName; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <main role="alert" className="flex min-h-dvh flex-col">
      {header ? <KioskHeader name={header.name} locale={header.locale} onLocale={header.onLocale} /> : null}

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-28 text-center">
        <span className="flex size-60 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-deep)">
          <Icon name={icon} className="size-28" strokeWidth={1.5} />
        </span>
        <h1 className="font-display text-7xl leading-tight font-bold">{title}</h1>
        <p className="text-3xl leading-snug text-(--color-ink-muted)">{text}</p>

        <button onClick={action.onClick}
          className="mt-6 flex min-h-30 items-center gap-4 rounded-full bg-(--color-brand) px-16 font-display text-4xl font-bold text-(--color-brand-ink)">
          <Icon name={action.icon} className="size-9" strokeWidth={2.2} />
          {action.label}
        </button>

        {secondary ? (
          <button onClick={secondary.onClick}
            className="px-8 py-5 font-display text-3xl font-semibold text-slate-700 underline decoration-2 underline-offset-8">
            {secondary.label}
          </button>
        ) : null}
      </div>
    </main>
  );
}
