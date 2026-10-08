"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addPeriod, cancelPeriod, changePeriod, getSubscription, setBackofficeRule, type PeriodState, type SubscriptionPeriod, type SubscriptionView,
} from "@/lib/platform";
import { ErrorText, Field, input, primary, secondary } from "./ui";

/** "2026-10-31" → "31 Oct 2026", read as a calendar day (no time zone shifts). */
const day = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** A day plus n days, as "YYYY-MM-DD". */
const plusDays = (s: string, n: number) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** The last day of a period of n months starting on `from`: 1 Nov + 1 month → 30 Nov. */
const monthsLater = (from: string, n: number) => {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
  return plusDays(end.toISOString().slice(0, 10), -1);
};

const STATE: Record<PeriodState, [string, string]> = {
  current: ["Running", "bg-green-100 text-green-900"],
  upcoming: ["Upcoming", "bg-sky-100 text-sky-900"],
  past: ["Over", "bg-(--color-surface-2) text-(--color-ink-muted)"],
  cancelled: ["Cancelled", "bg-red-100 text-red-900"],
};

function Standing({ v }: { v: SubscriptionView }) {
  const s = v.standing;
  const [tone, text] =
    s.state === "active" ? ["border-green-600 bg-green-50", `Running until ${day(s.coveredUntil!)} — ${s.daysLeft} days left. The kiosks take orders.`]
    : s.state === "ending" ? ["border-amber-500 bg-amber-50", `Ends on ${day(s.coveredUntil!)} — ${s.daysLeft === 1 ? "today is the last day" : `${s.daysLeft} days left`}. Add the next period to keep the kiosks on.`]
    : ["border-red-600 bg-red-50", `No running subscription: the kiosks are not taking orders${s.state === "none" ? " (it never had one)" : ""}. ${v.closeBackofficeWhenEnded ? "The back office is closed too: its staff cannot sign in." : "The back office stays open."}`];
  return (
    <div role="status" className={`rounded-(--radius-card) border-2 p-4 ${tone}`}>
      <p className="font-medium">{text}</p>
      {s.next ? <p className="mt-1 text-sm">Next period: {day(s.next.startsOn)} to {day(s.next.endsOn)}.</p> : null}
    </div>
  );
}

function PeriodRow({ p, currency, canWrite, busy, onChangeEnd, onCancel }: {
  p: SubscriptionPeriod; currency: string; canWrite: boolean; busy: boolean;
  onChangeEnd: (endsOn: string) => void; onCancel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [end, setEnd] = useState(p.endsOn);
  const [label, tone] = STATE[p.state];
  const live = p.state === "current" || p.state === "upcoming";
  return (
    <tr className="border-t border-(--color-line) align-top">
      <td className="px-4 py-3 whitespace-nowrap">{day(p.startsOn)}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        {editing ? (
          <span className="flex items-center gap-2">
            <input type="date" className={`${input} h-9 w-40`} value={end} min={p.startsOn} onChange={(e) => setEnd(e.target.value)} aria-label="New last day" />
            <button className={secondary + " h-9"} disabled={busy || !end} onClick={() => { onChangeEnd(end); setEditing(false); }}>Save</button>
            <button className="text-sm underline" onClick={() => { setEditing(false); setEnd(p.endsOn); }}>Cancel</button>
          </span>
        ) : day(p.endsOn)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap tabular-nums">{p.amount === null ? "—" : `${p.amount.toLocaleString()} ${currency}`}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
        {p.note ? <p className="mt-1 text-sm text-(--color-ink-muted)">{p.note}</p> : null}
        {p.cancelledAt ? (
          <p className="mt-1 text-xs text-(--color-ink-muted)">Cancelled {new Date(p.cancelledAt).toLocaleString()}{p.cancelReason ? `: ${p.cancelReason}` : ""}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-end whitespace-nowrap">
        {canWrite && live && !editing ? (
          <span className="flex justify-end gap-3 text-sm">
            <button className="underline" disabled={busy} onClick={() => setEditing(true)}>Change end</button>
            <button className="text-(--color-danger) underline" disabled={busy} onClick={onCancel}>Cancel now</button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * The restaurant's subscription: the periods the platform team chose. Without a running one its kiosks show
 * "unavailable" (within 20 seconds); its back office stays open with a banner.
 */
export default function SubscriptionTab({ id, canWrite, onChanged }: { id: string; canWrite: boolean; onChanged: () => void }) {
  const [v, setV] = useState<SubscriptionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const adopt = useCallback((next: SubscriptionView) => {
    setV(next);
    // The next period starts the day after the current cover ends (or today, if nothing runs).
    const start = next.standing.coveredUntil ? plusDays(next.standing.coveredUntil, 1) : next.today;
    setFrom(start);
    setTo(monthsLater(start, 1));
  }, []);
  useEffect(() => { getSubscription(id).then(adopt).catch((e) => setError((e as Error).message)); }, [id, adopt]);

  const run = async (fn: () => Promise<SubscriptionView>, done: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      adopt(await fn());
      setNotice(done);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!v) return error ? <ErrorText message={error} /> : <p className="text-(--color-ink-muted)">Loading…</p>;

  const add = () => run(async () => {
    const r = await addPeriod(id, { startsOn: from, endsOn: to, amount: amount.trim() ? Number(amount.replace(",", ".")) : null, note: note.trim() || null });
    setAmount(""); setNote("");
    return r;
  }, `Period added: ${day(from)} to ${day(to)}.`);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Standing v={v} />
      <ErrorText message={error} />
      {notice ? <p role="status" className="text-sm text-green-700">{notice}</p> : null}

      <section className="rounded-(--radius-card) border border-(--color-line) p-5">
        <h2 className="mb-3 font-medium">When no period is running</h2>
        <fieldset className="flex flex-col gap-3" disabled={!canWrite || busy}>
          {([
            [false, "Only the kiosks stop", "The back office stays open with a red banner, so they can still see their orders and renew."],
            [true, "Close the back office too", "Its staff cannot sign in; anyone signed in is signed out within 15 minutes. Nothing is deleted: when you add a period, everything comes back as it was."],
          ] as const).map(([close, label, help]) => (
            <label key={label} className="flex cursor-pointer items-start gap-3">
              <input type="radio" name="backoffice-rule" className="mt-1 h-4 w-4" checked={v.closeBackofficeWhenEnded === close}
                onChange={() => void run(() => setBackofficeRule(id, close), close ? "From now on the back office closes when no period is running." : "The back office now stays open when no period is running.")} />
              <span><span className="font-medium">{label}</span><span className="block text-sm text-(--color-ink-muted)">{help}</span></span>
            </label>
          ))}
        </fieldset>
      </section>

      {canWrite ? (
        <section className="rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5">
          <h2 className="mb-1 font-medium">Add a period</h2>
          <p className="mb-4 text-sm text-(--color-ink-muted)">
            From one day to another, both included, in the restaurant&apos;s own time. To renew, add the next period: it can start the day
            after the current one ends.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From"><input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To (last day included)"><input type="date" className={input} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 3, 6, 12].map((n) => (
              <button key={n} type="button" className={secondary + " h-8"} disabled={!from} onClick={() => setTo(monthsLater(from, n))}>
                {n === 12 ? "1 year" : `${n} month${n === 1 ? "" : "s"}`}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={`Amount paid (${v.currency}, optional)`}>
              <input inputMode="decimal" className={input} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="1200" />
            </Field>
            <Field label="Note (optional)">
              <input className={input} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Paid by transfer, invoice 2026-041" />
            </Field>
          </div>
          <button className={primary + " mt-4"} disabled={busy || !from || !to || to < from} onClick={() => void add()}>
            {busy ? "Saving…" : `Add ${from && to ? `${day(from)} – ${day(to)}` : "period"}`}
          </button>
        </section>
      ) : <p className="text-sm text-(--color-ink-muted)">Only a super admin can change subscriptions.</p>}

      <section>
        <h2 className="mb-2 font-medium">Periods</h2>
        {v.periods.length === 0 ? <p className="text-sm text-(--color-ink-muted)">None yet.</p> : (
          <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
            <table className="w-full text-sm">
              <thead className="bg-(--color-surface-2) text-start text-(--color-ink-muted)">
                <tr><th className="px-4 py-2 text-start font-medium">From</th><th className="px-4 py-2 text-start font-medium">To</th><th className="px-4 py-2 text-start font-medium">Amount</th><th className="px-4 py-2 text-start font-medium">State</th><th /></tr>
              </thead>
              <tbody>
                {v.periods.map((p) => (
                  <PeriodRow key={p.id} p={p} currency={v.currency} canWrite={canWrite} busy={busy}
                    onChangeEnd={(endsOn) => void run(() => changePeriod(id, p.id, { endsOn }), `Now ends on ${day(endsOn)}.`)}
                    onCancel={() => {
                      const reason = window.prompt(`Cancel the period ${day(p.startsOn)} – ${day(p.endsOn)} now? Its kiosks stop taking orders within a minute.\n\nReason (optional):`, "");
                      if (reason === null) return;
                      void run(() => cancelPeriod(id, p.id, reason), "Cancelled. The kiosks stop taking orders within a minute.");
                    }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
