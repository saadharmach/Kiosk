"use client";

import { useCallback, useEffect, useState } from "react";
import { getPaymentSettings, savePaymentSettings, saveTerminal, type PaymentPage as Page, type PaymentSettings } from "@/lib/payments";

const field = "h-10 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3";
const lbl = "mb-1 block text-sm text-(--color-ink-muted)";
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5";
const hint = "mt-1 text-xs text-(--color-ink-muted)";
const btn = "h-10 rounded-lg px-4 font-medium disabled:opacity-50";
const primary = `${btn} bg-(--color-brand) text-(--color-brand-ink)`;

/** One of the restaurant's unTill payment types. */
function PaymentType({ page, value, onChange, id }: { page: Page; value: string | null; onChange: (v: string | null) => void; id: string }) {
  return (
    <select id={id} className={field} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choose…</option>
      {page.untillPayments.map((p) => <option key={p.untillId} value={p.untillId}>{p.number} — {p.name}</option>)}
    </select>
  );
}

/**
 * How customers pay at the kiosk (the Règlement screen): card on the borne's TPE, cash, or both. A card payment goes to
 * unTill already closed; cash is left open for the counter as before, or closed at once.
 */
export default function PaymentPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [form, setForm] = useState<PaymentSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = (p: Page) => { setPage(p); setForm(p.settings); };
  const load = useCallback(() => { getPaymentSettings(slug).then(adopt).catch((e) => setError((e as Error).message)); }, [slug]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<Page>, done: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { adopt(await fn()); setNotice(done); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!page || !form) return error ? <p className="text-(--color-danger)">{error}</p> : <p className="text-(--color-ink-muted)">Loading…</p>;
  const set = (patch: Partial<PaymentSettings>) => setForm({ ...form, ...patch });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm text-(--color-ink-muted)">
        After the order, the kiosk shows a <b>Règlement</b> screen with the ways to pay you switch on here. The kiosks pick up a change within
        a few seconds.
      </p>
      {page.warnings.map((w) => <p key={w} role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{w}</p>)}

      <section className={card}>
        <label className="flex items-center gap-3 font-medium">
          <input type="checkbox" className="h-5 w-5" checked={form.cardEnabled} onChange={(e) => set({ cardEnabled: e.target.checked })} />
          Card (TPE at the borne)
        </label>
        <p className={hint}>The customer pays on the borne&apos;s card terminal. Once the payment is approved the order goes to unTill <b>already closed</b>, with the payment type below. Only bornes with a card terminal (below) offer it.</p>
        {form.cardEnabled ? (
          <div className="mt-3 max-w-sm">
            <label className={lbl} htmlFor="card-type">unTill payment type for card orders</label>
            <PaymentType id="card-type" page={page} value={form.cardUntillPaymentId} onChange={(v) => set({ cardUntillPaymentId: v })} />
          </div>
        ) : null}
      </section>

      <section className={card}>
        <label className="flex items-center gap-3 font-medium">
          <input type="checkbox" className="h-5 w-5" checked={form.cashEnabled} onChange={(e) => set({ cashEnabled: e.target.checked })} />
          Cash
        </label>
        {form.cashEnabled ? (
          <div className="mt-3 flex flex-col gap-3">
            {([
              [false, "Leave the order open in unTill", "The customer pays at the counter with the ticket's number (as today)."],
              [true, "Close the order in unTill at once", "It is counted as paid in cash with the payment type below. Use this only if your staff never need to find it open."],
            ] as const).map(([close, title, text]) => (
              <label key={title} className="flex cursor-pointer items-start gap-3">
                <input type="radio" name="cash-close" className="mt-1 h-4 w-4" checked={form.cashClosesOrder === close} onChange={() => set({ cashClosesOrder: close })} />
                <span><span className="font-medium">{title}</span><span className="block text-sm text-(--color-ink-muted)">{text}</span></span>
              </label>
            ))}
            {form.cashClosesOrder ? (
              <div className="max-w-sm">
                <label className={lbl} htmlFor="cash-type">unTill payment type for cash orders</label>
                <PaymentType id="cash-type" page={page} value={form.cashUntillPaymentId} onChange={(v) => set({ cashUntillPaymentId: v })} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className={primary} disabled={busy} onClick={() => void run(() => savePaymentSettings(slug, form), "Saved.")}>{busy ? "Saving…" : "Save"}</button>
        {notice ? <span role="status" className="text-sm text-green-700">{notice}</span> : null}
        {error ? <span role="alert" className="text-sm text-(--color-danger)">{error}</span> : null}
      </div>

      <section className={card}>
        <h2 className="mb-1 font-medium">Card terminal of each borne</h2>
        <p className={hint}>
          The connection to the terminals is being prepared with the TPE company; until it is in, only the test simulator exists
          (and only on a test server: it never takes real money).
        </p>
        {page.bornes.length === 0 ? <p className="mt-3 text-sm text-(--color-ink-muted)">No bornes yet: add them under Bornes.</p> : (
          <ul className="mt-3 divide-y divide-(--color-line) rounded-lg border border-(--color-line) bg-(--color-surface)">
            {page.bornes.map((b) => (
              <li key={b.kioskId} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1"><span className="font-medium">{b.code} · {b.name}</span>
                  <span className="block text-xs text-(--color-ink-muted)">
                    {b.terminal?.usable ? "takes cards" : b.terminal?.provider ? "terminal switched off" : "no card terminal"}
                  </span>
                </span>
                <select aria-label={`Card terminal of ${b.name}`} className="h-10 rounded-lg border border-(--color-line) bg-(--color-surface) px-2" disabled={busy}
                  value={b.terminal?.isEnabled ? b.terminal.provider ?? "" : ""}
                  onChange={(e) => void run(() => saveTerminal(slug, b.kioskId, { provider: e.target.value || null, isEnabled: Boolean(e.target.value) }), `${b.name}: saved.`)}>
                  <option value="">No card terminal</option>
                  {page.providers.map((p) => <option key={p.name} value={p.name}>{p.label}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
