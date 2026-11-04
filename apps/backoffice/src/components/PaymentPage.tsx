"use client";

import { useCallback, useEffect, useState } from "react";
import { getPaymentSettings, savePaymentSettings, saveTerminal, type PaymentPage as Page, type PaymentSettings } from "@/lib/payments";

const field = "field";
const lbl = "field-label";
const card = "card";
const hint = "mt-1 text-[12.5px] text-(--color-ink-muted)";
const primary = "btn btn-primary";

/** One of the restaurant's unTill payment types. */
function PaymentType({ page, value, onChange, id }: { page: Page; value: string | null; onChange: (v: string | null) => void; id: string }) {
  return (
    <select id={id} className={field} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choisir…</option>
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

  if (!page || !form) return error ? <p className="note note-err">{error}</p> : <p className="text-(--color-ink-muted)">Chargement…</p>;
  const set = (patch: Partial<PaymentSettings>) => setForm({ ...form, ...patch });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="note note-info">
        Après la commande, la borne affiche un écran <b>Règlement</b> avec les moyens de paiement activés ici. Les bornes prennent en compte
        un changement en quelques secondes.
      </p>
      {page.warnings.map((w) => <p key={w} role="status" className="note note-warn">{w}</p>)}

      <section className={card}>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" className="size-[18px] accent-(--color-brand)" checked={form.cardEnabled} onChange={(e) => set({ cardEnabled: e.target.checked })} />
          Carte bancaire (TPE de la borne)
        </label>
        <p className={hint}>Le client paie sur le terminal de carte de la borne. Une fois le paiement accepté, la commande part dans unTill <b>déjà clôturée</b>, avec le moyen de paiement ci-dessous. Seules les bornes équipées d’un terminal (plus bas) le proposent.</p>
        {form.cardEnabled ? (
          <div className="mt-3 max-w-sm">
            <label className={lbl} htmlFor="card-type">Moyen de paiement unTill pour les commandes par carte</label>
            <PaymentType id="card-type" page={page} value={form.cardUntillPaymentId} onChange={(v) => set({ cardUntillPaymentId: v })} />
          </div>
        ) : null}
      </section>

      <section className={card}>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" className="size-[18px] accent-(--color-brand)" checked={form.cashEnabled} onChange={(e) => set({ cashEnabled: e.target.checked })} />
          Espèces
        </label>
        {form.cashEnabled ? (
          <div className="mt-3 flex flex-col gap-3">
            {([
              [false, "Laisser la commande ouverte dans unTill", "Le client paie au comptoir avec le numéro du ticket (comme aujourd’hui)."],
              [true, "Clôturer la commande dans unTill tout de suite", "Elle compte comme payée en espèces avec le moyen de paiement ci-dessous. À utiliser seulement si l’équipe n’a jamais besoin de la retrouver ouverte."],
            ] as const).map(([close, title, text]) => (
              <label key={title} className="flex cursor-pointer items-start gap-3">
                <input type="radio" name="cash-close" className="mt-1 size-4 accent-(--color-brand)" checked={form.cashClosesOrder === close} onChange={() => set({ cashClosesOrder: close })} />
                <span><span className="font-semibold">{title}</span><span className="block text-[12.5px] text-(--color-ink-muted)">{text}</span></span>
              </label>
            ))}
            {form.cashClosesOrder ? (
              <div className="max-w-sm">
                <label className={lbl} htmlFor="cash-type">Moyen de paiement unTill pour les commandes en espèces</label>
                <PaymentType id="cash-type" page={page} value={form.cashUntillPaymentId} onChange={(v) => set({ cashUntillPaymentId: v })} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className={primary} disabled={busy} onClick={() => void run(() => savePaymentSettings(slug, form), "Enregistré.")}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        {notice ? <span role="status" className="badge badge-ok">{notice}</span> : null}
        {error ? <span role="alert" className="text-[13px] text-(--color-danger)">{error}</span> : null}
      </div>

      <section className={card}>
        <h2 className="card-title mb-1">Terminal de carte de chaque borne</h2>
        <p className={hint}>
          La connexion aux terminaux est en préparation avec la société du TPE ; en attendant, seul le simulateur de test existe
          (et seulement sur un serveur de test : il ne prend jamais d’argent réel).
        </p>
        {page.bornes.length === 0 ? <p className="mt-3 text-(--color-ink-muted)">Pas encore de borne : ajoutez-en dans Bornes.</p> : (
          <ul className="mt-3 divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
            {page.bornes.map((b) => (
              <li key={b.kioskId} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1"><span className="font-semibold">{b.code} · {b.name}</span>
                  <span className="mt-0.5 block">
                    {b.terminal?.usable ? <span className="badge badge-ok">Accepte la carte</span>
                      : b.terminal?.provider ? <span className="badge badge-warn">Terminal désactivé</span>
                      : <span className="badge badge-muted">Pas de terminal</span>}
                  </span>
                </span>
                <select aria-label={`Terminal de carte de ${b.name}`} className="field w-auto" disabled={busy}
                  value={b.terminal?.isEnabled ? b.terminal.provider ?? "" : ""}
                  onChange={(e) => void run(() => saveTerminal(slug, b.kioskId, { provider: e.target.value || null, isEnabled: Boolean(e.target.value) }), `${b.name} : enregistré.`)}>
                  <option value="">Pas de terminal</option>
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
