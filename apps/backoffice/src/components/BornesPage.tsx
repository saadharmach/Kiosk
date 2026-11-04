"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createBorne, deleteBorne, getRegistration, listBornes, printerState, screenCode, setRegistration, unregisterScreen, updateBorne, type Borne,
} from "@/lib/kiosks";
import PrinterPage from "./PrinterPage";

const field = "field";
const primary = "btn btn-primary";
const secondary = "btn btn-secondary";
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)";

const TONE = { ok: "badge-ok", warn: "badge-warn", none: "badge-muted" } as const;

function BorneCard({ slug, b, open, onToggle, onChanged, onError }: {
  slug: string; b: Borne; open: boolean; onToggle: () => void; onChanged: () => void; onError: (m: string | null) => void;
}) {
  const [name, setName] = useState(b.name);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const state = printerState(b.printer);
  const registerUrl = `${b.url}${b.url.includes("?") ? "&" : "?"}register`;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); onError(null);
    try { await fn(); onChanged(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <li className={card}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-(--radius-card) bg-(--color-nav) text-[13px] font-bold text-white">{b.code}</span>
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-start">
          <span className="block truncate font-bold">{b.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`badge ${b.screen.registered ? "badge-ok" : "badge-warn"}`}>
              {b.screen.registered ? "Écran enregistré" : "Écran non enregistré"}
            </span>
            <span className={`badge ${TONE[state.tone]}`}>{state.text}</span>
            {b.orders ? <span className="text-[12.5px] text-(--color-ink-muted)">{b.orders} commande{b.orders === 1 ? "" : "s"}</span> : null}
          </span>
        </button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={b.isEnabled} disabled={busy} className="size-4 accent-(--color-brand)"
            onChange={(e) => void act(() => updateBorne(slug, b.id, { isEnabled: e.target.checked }))} />
          Prend des commandes
        </label>
        <button type="button" className={secondary} onClick={onToggle}>{open ? "Fermer" : "Configurer"}</button>
      </div>

      {open ? (
        <div className="flex flex-col gap-5 border-t border-(--color-line) p-4">
          <section>
            <h3 className="card-title mb-2">Nom</h3>
            <div className="flex gap-2">
              <input aria-label="Nom de la borne" className={`${field} w-full sm:w-72`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <button type="button" className={secondary} disabled={busy || !name.trim() || name.trim() === b.name}
                onClick={() => void act(() => updateBorne(slug, b.id, { name: name.trim() }))}>Renommer</button>
            </div>
            <p className="field-hint">Le nom est imprimé sur les tickets de cette borne : l’équipe sait où se trouve le client.</p>
          </section>

          <section>
            <h3 className="card-title mb-2">Adresse de cette machine</h3>
            <div className="flex gap-2">
              <input readOnly aria-label="Adresse de la borne" className={`${field} min-w-0 flex-1 font-mono text-[13px]`} value={b.url} onFocus={(e) => e.target.select()} />
              <button type="button" className={secondary}
                onClick={() => navigator.clipboard?.writeText(b.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
                {copied ? "Copiée" : "Copier"}
              </button>
            </div>
            <p className="field-hint">
              Ouvrez exactement cette adresse dans le navigateur de la machine. Elle retient quelle borne elle est : recharger ne pose pas de
              problème. Ses commandes commencent par {b.code} et s’impriment sur l’imprimante de cette borne.
            </p>
          </section>

          <section>
            <h3 className="card-title mb-2">Écran</h3>
            {b.screen.registered ? (
              <p>Enregistré{b.screen.registeredAt ? ` le ${new Date(b.screen.registeredAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : ""} : cette machine est {b.code}, quelle que soit son adresse.</p>
            ) : (
              <p className="text-(--color-ink-muted)">Pas encore enregistré. Enregistrez l’écran de la machine pour que le serveur sache que c’est bien cette borne.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={secondary} disabled={busy}
                onClick={() => void act(async () => setCode(await screenCode(slug, b.id)))}>
                {b.screen.registered ? "Enregistrer un autre écran" : "Enregistrer un écran"}
              </button>
              {b.screen.registered ? (
                <button type="button" className="btn btn-ghost text-(--color-danger)" disabled={busy}
                  onClick={() => { if (window.confirm(`Désenregistrer l’écran de ${b.name} ? Si seuls les écrans enregistrés peuvent commander, il s’arrête aussitôt jusqu’à un nouvel enregistrement.`)) void act(() => unregisterScreen(slug, b.id)); }}>
                  Désenregistrer
                </button>
              ) : null}
            </div>
            {code ? (
              <div className="note note-info mt-3" role="status">
                <ol className="list-decimal space-y-1 ps-5">
                  <li>Sur la borne, ouvrez <a className="font-mono underline" href={registerUrl} target="_blank" rel="noreferrer">{registerUrl}</a> (quand seuls les écrans enregistrés sont autorisés, tout écran non enregistré affiche cette page de lui-même).</li>
                  <li>Tapez ce code avec les touches de l’écran puis appuyez sur <b>Enregistrer</b> :</li>
                </ol>
                <p className="my-2 font-mono text-3xl font-bold tracking-widest text-(--color-ink) select-all">{code.code}</p>
                <p className="text-[12.5px]">
                  Valable une fois, jusqu’à {new Date(code.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Enregistrer un écran
                  remplace le précédent de cette borne.
                </p>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="card-title mb-2">Imprimante de cette borne</h3>
            <PrinterPage slug={slug} kioskId={b.id} />
          </section>

          <section className="border-t border-(--color-line) pt-4">
            {b.orders === 0 ? (
              <button type="button" className="btn btn-danger" disabled={busy}
                onClick={() => { if (window.confirm(`Supprimer ${b.name} (${b.code}) et les réglages de son imprimante ? C’est définitif.`)) void act(() => deleteBorne(slug, b.id)); }}>
                Supprimer cette borne
              </button>
            ) : (
              <p className="text-[12.5px] text-(--color-ink-muted)">
                Cette borne a pris {b.orders} commande{b.orders === 1 ? "" : "s"} : elle ne peut pas être supprimée, ses commandes gardent son nom.
                Décochez « Prend des commandes » pour l’arrêter.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </li>
  );
}

export default function BornesPage({ slug }: { slug: string }) {
  const [bornes, setBornes] = useState<Borne[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const [required, setRequired] = useState<boolean | null>(null);
  const [savingRequired, setSavingRequired] = useState(false);
  const load = useCallback(() => {
    listBornes(slug).then(setBornes).catch((e) => setError((e as Error).message));
    getRegistration(slug).then((r) => setRequired(r.required)).catch(() => undefined);
  }, [slug]);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  if (!bornes) return error ? <p className="note note-err">{error}</p> : <p className="text-(--color-ink-muted)">Chargement…</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="note note-info">
        Une borne = une machine. Donnez à chaque machine sa borne, avec sa propre imprimante : les tickets s’impriment là où se trouve le
        client. Les commandes d’une machine sans borne, ou d’une borne dont l’imprimante est arrêtée, vont à l’imprimante par défaut (plus bas).
      </p>
      {error ? <p className="note note-err" role="alert">{error}</p> : null}

      {required === false && bornes.some((b) => b.screen.registered) ? (
        <p role="status" className="note note-warn">
          <b>Pas encore protégé.</b> {bornes.filter((b) => b.screen.registered).length} écran(s) de borne sur {bornes.length} enregistré(s), mais
          n’importe quel autre appareil peut encore ouvrir l’adresse de la borne tant que la case ci-dessous n’est pas cochée.
          {bornes.some((b) => b.isEnabled && !b.screen.registered) ? " Enregistrez d’abord les écrans des autres bornes, sinon elles s’arrêteront aussi." : ""}
        </p>
      ) : null}
      {required === true ? (
        <p role="status" className="note note-ok">
          <b>Protégé.</b> Seuls les écrans enregistrés affichent le menu et prennent des commandes ; tout autre appareil voit « Enregistrer cet écran ».
        </p>
      ) : null}
      {required !== null ? (
        <section className="card">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 size-[18px] accent-(--color-brand)" checked={required} disabled={savingRequired}
              onChange={async (e) => {
                const next = e.target.checked;
                if (next && !window.confirm("Seuls les écrans enregistrés afficheront le menu et prendront des commandes. Tout autre appareil, et toute borne dont l’écran n’est pas encore enregistré, verra « Enregistrer cet écran ». Continuer ?")) return;
                setSavingRequired(true); setError(null);
                try { setRequired((await setRegistration(slug, next)).required); } catch (err) { setError((err as Error).message); } finally { setSavingRequired(false); }
              }} />
            <span>
              <span className="block font-bold">Seuls les écrans enregistrés peuvent afficher le menu et prendre des commandes</span>
              <span className="block text-[12.5px] text-(--color-ink-muted)">
                Conseillé une fois l’écran de chaque borne enregistré. L’adresse de la borne seule ne sert alors à rien : quelqu’un qui
                l’ouvre sur son téléphone ne voit que « Enregistrer cet écran », et personne ne peut se faire passer pour une de vos bornes.
              </span>
            </span>
          </label>
        </section>
      ) : null}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setAdding(true); setError(null);
          try { const b = await createBorne(slug, name.trim()); setName(""); setOpen(b.id); load(); } catch (err) { setError((err as Error).message); } finally { setAdding(false); }
        }}
      >
        <div>
          <label className="field-label" htmlFor="borne-name">Nouvelle borne</label>
          <input id="borne-name" className={`${field} w-full sm:w-72`} value={name} maxLength={60} placeholder="Borne entrée" onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" className={primary} disabled={adding || !name.trim()}>{adding ? "Ajout…" : "Ajouter une borne"}</button>
      </form>

      {bornes.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-6 text-center text-(--color-ink-muted)">
          Pas encore de borne. Tout passe par l’imprimante par défaut. Ajoutez une borne pour chaque machine qui doit avoir sa propre imprimante.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bornes.map((b) => (
            <BorneCard key={b.id} slug={slug} b={b} open={open === b.id} onToggle={() => setOpen(open === b.id ? null : b.id)} onChanged={load} onError={setError} />
          ))}
        </ul>
      )}

      <section className={card}>
        <button type="button" className="flex w-full items-center justify-between p-4 text-start" aria-expanded={open === "default"} onClick={() => setOpen(open === "default" ? null : "default")}>
          <span>
            <span className="block font-bold">Imprimante par défaut</span>
            <span className="block text-[12.5px] text-(--color-ink-muted)">Pour les commandes sans borne, et quand l’imprimante d’une borne manque ou est arrêtée.</span>
          </span>
          <span className={secondary}>{open === "default" ? "Fermer" : "Configurer"}</span>
        </button>
        {open === "default" ? <div className="border-t border-(--color-line) p-4"><PrinterPage slug={slug} /></div> : null}
      </section>
    </div>
  );
}
