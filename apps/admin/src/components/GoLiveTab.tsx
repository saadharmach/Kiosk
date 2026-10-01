"use client";

import { KIOSK_URL, type Check, type CheckState, type Readiness, type RestaurantDetail, type RestaurantTab } from "@/lib/platform";
import { secondary } from "./ui";

const ICON: Record<CheckState, { mark: string; label: string; tone: string }> = {
  done: { mark: "✓", label: "Done", tone: "bg-(--color-brand) text-(--color-brand-ink)" },
  todo: { mark: "✗", label: "To do", tone: "bg-red-100 text-red-900" },
  warning: { mark: "!", label: "Look at this", tone: "bg-amber-200 text-amber-950" },
};

function Row({ c, onOpenTab }: { c: Check; onOpenTab: (t: RestaurantTab) => void }) {
  const i = ICON[c.state];
  return (
    <li className="flex items-start gap-4 p-4">
      <span aria-label={i.label} role="img" className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i.tone}`}>{i.mark}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{c.label}</p>
        <p className="text-sm text-(--color-ink-muted)">{c.detail}</p>
      </div>
      {c.state !== "done" && c.tab ? (
        <button className={secondary + " shrink-0"} onClick={() => onOpenTab(c.tab!)}>Open {c.tab === "unTill" ? "unTill" : c.tab}</button>
      ) : null}
    </li>
  );
}

export default function GoLiveTab({ r, readiness, onOpenTab }: { r: RestaurantDetail; readiness: Readiness | null; onOpenTab: (t: RestaurantTab) => void }) {
  if (!readiness) return <p className="text-(--color-ink-muted)">Loading…</p>;
  const required = readiness.checks.filter((c) => c.required);
  const recommended = readiness.checks.filter((c) => !c.required);
  const pct = Math.round((readiness.requiredDone / readiness.requiredTotal) * 100);

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Progress">
        <p className="mb-2 text-lg font-medium">
          {readiness.ready ? "Ready to go live." : `${readiness.requiredTotal - readiness.requiredDone} thing${readiness.requiredTotal - readiness.requiredDone === 1 ? "" : "s"} to do before going live.`}
          <span className="ms-3 text-sm font-normal text-(--color-ink-muted)">{readiness.requiredDone} of {readiness.requiredTotal} required</span>
        </p>
        <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Required steps done" className="h-2.5 overflow-hidden rounded-full bg-(--color-surface-2)">
          <div className="h-full rounded-full bg-(--color-brand)" style={{ width: `${pct}%` }} />
        </div>
        {readiness.ready ? (
          <p className="mt-3 text-sm">The kiosk is at <a className="underline" href={`${KIOSK_URL}/r/${r.slug}`} target="_blank" rel="noreferrer">{KIOSK_URL}/r/{r.slug}</a>.</p>
        ) : null}
      </section>

      <section aria-label="Required">
        <h2 className="mb-3 text-lg font-medium">Required</h2>
        <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
          {required.map((c) => <Row key={c.key} c={c} onOpenTab={onOpenTab} />)}
        </ul>
      </section>

      <section aria-label="Recommended">
        <h2 className="mb-1 text-lg font-medium">Recommended</h2>
        <p className="mb-3 text-sm text-(--color-ink-muted)">These do not stop the restaurant from going live. {readiness.recommendedDone} of {readiness.recommendedTotal} done.</p>
        <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
          {recommended.map((c) => <Row key={c.key} c={c} onOpenTab={onOpenTab} />)}
        </ul>
      </section>
    </div>
  );
}
