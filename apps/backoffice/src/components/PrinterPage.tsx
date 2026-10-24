"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPrinter, issuePairingCode, issuePrinterToken, listPrintJobs, savePrinter, testPrint,
  type CodePage, type PrintJobRow, type PrinterView, type SavePrinterBody,
} from "@/lib/printer";

const field = "field";
const lbl = "field-label";
// Shown inside a borne's card (or the default printer's): a soft panel, not another white card.
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-page) p-4";
const hint = "mt-1 text-[12.5px] text-(--color-ink-muted)";
const primary = "btn btn-primary";
const secondary = "btn btn-secondary";

const CODEPAGES: { value: CodePage; label: string }[] = [
  { value: "CP858", label: "PC858 : accents français et signe € (conseillé)" },
  { value: "CP437", label: "PC437 : le réglage courant, moins d’accents" },
  { value: "CP1252", label: "Windows-1252 : pour les imprimantes qui l’utilisent" },
];

const EMPTY: SavePrinterBody = {
  name: "Imprimante tickets", address: "", port: 9100, isEnabled: true,
  autoPrint: true, copies: 1, cut: true, codepage: "CP858",
};

/** "il y a 12 s", "il y a 3 min", or the date, for a sign of life. */
function ago(iso: string | null): string {
  if (!iso) return "jamais";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

const STATUS: Record<PrintJobRow["status"], [string, string]> = {
  PRINTED: ["Imprimé", "badge-ok"],
  QUEUED: ["En file", "badge-muted"],
  PRINTING: ["Impression…", "badge-info"],
  FAILED: ["Échec", "badge-err"],
};

/** The printer settings, helper and recent tickets: the restaurant's default printer, or one borne's when `kioskId` is given. */
export default function PrinterPage({ slug, kioskId }: { slug: string; kioskId?: string }) {
  const [view, setView] = useState<PrinterView | null>(null);
  const [form, setForm] = useState<SavePrinterBody>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [jobs, setJobs] = useState<PrintJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const formTouched = useRef(false);

  const adopt = useCallback((v: PrinterView) => {
    setView(v);
    // Never overwrite what the manager is typing with what the server last said.
    if (formTouched.current) return;
    setForm(
      v.configured
        ? { name: v.name, address: v.address ?? "", port: v.port ?? 9100, isEnabled: v.isEnabled, ...v.config }
        : { ...EMPTY, ...v.config },
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [p, j] = await Promise.all([getPrinter(slug, kioskId), listPrintJobs(slug, kioskId)]);
      adopt(p);
      setJobs(j);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, kioskId, adopt]);

  useEffect(() => { refresh(); }, [refresh]);

  // Status and jobs move on their own (the helper is a separate program), so look again every few seconds.
  useEffect(() => {
    const id = setInterval(() => { refresh().catch(() => undefined); }, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // The helper trades the code for its secret: once the server no longer has a waiting code, ours is spent.
  const waiting = view?.configured ? view.helper.pairingPending : false;
  // (Only after the server has first reported it waiting: right after issuing, the page still holds the older status.)
  const sawWaiting = useRef(false);
  useEffect(() => {
    if (waiting) sawWaiting.current = true;
    else if (pairing && sawWaiting.current && new Date(pairing.expiresAt).getTime() > Date.now()) {
      sawWaiting.current = false;
      setPairing(null);
      setNotice("Le Helper a utilisé le code. Il est configuré et apparaîtra En ligne dans un instant.");
    }
  }, [waiting, pairing]);

  const edit = (patch: Partial<SavePrinterBody>) => {
    formTouched.current = true;
    setDirty(true);
    setNotice(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => {
    const res = await savePrinter(slug, { ...form, name: form.name.trim(), address: form.address.trim() }, kioskId);
    formTouched.current = false;
    setDirty(false);
    adopt(res);
    setNotice("Enregistré.");
  });

  const generateToken = () => run(async () => {
    if (view?.configured && view.helper.tokenIssuedAt &&
        !window.confirm("Cela remplace le jeton actuel. Le Helper du restaurant n’imprime plus tant qu’il n’a pas le nouveau. Continuer ?")) return;
    setToken((await issuePrinterToken(slug, kioskId)).token);
    await refresh();
  });

  const getCode = () => run(async () => {
    if (view?.configured && view.helper.tokenIssuedAt &&
        !window.confirm("Le Helper déjà configuré continue de fonctionner jusqu’à l’utilisation du nouveau code. La configuration remplace son secret. Continuer ?")) return;
    sawWaiting.current = false;
    setPairing(await issuePairingCode(slug, kioskId));
    await refresh();
  });

  const sendTest = () => run(async () => {
    await testPrint(slug, kioskId);
    setNotice("Ticket de test en file d’attente. Il s’imprime dès que le Helper le récupère.");
    await refresh();
  });

  if (!view) {
    return error ? <p className="note note-err">{error}</p> : <p className="text-(--color-ink-muted)">Chargement…</p>;
  }

  const configured = view.configured;
  const helper = configured ? view.helper : null;
  const neverConnected = configured && !helper?.lastSeenAt;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {/* ---- status */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12.5px] text-(--color-ink-muted)">NEXBORN Helper (impression)</p>
            <p className="mt-1">
              {!configured ? <span className="badge badge-muted">Pas configuré</span>
                : helper?.online ? <span className="badge badge-ok">En ligne</span>
                : neverConnected ? <span className="badge badge-warn">Jamais connecté</span>
                : <span className="badge badge-err">Hors ligne</span>}
            </p>
            {configured && helper?.lastSeenAt ? <p className={hint}>Dernier contact {ago(helper.lastSeenAt)}</p> : null}
          </div>
          <button type="button" className={secondary} disabled={busy || !configured} onClick={sendTest}>
            Imprimer un ticket de test
          </button>
        </div>
        {view.configured && view.lastError ? (
          <p className="note note-err mt-3" role="alert">
            Dernière erreur d’impression ({ago(view.lastError.at)}) : {view.lastError.message}
          </p>
        ) : null}
        {!configured ? <p className={hint}>Enregistrez l’adresse de l’imprimante ci-dessous, puis configurez le Helper.</p> : null}
      </section>

      {error ? <p className="note note-err" role="alert">{error}</p> : null}
      {notice ? <p className="note note-ok" role="status">{notice}</p> : null}

      {/* ---- settings */}
      <section className={card}>
        <h2 className="card-title">Imprimante tickets</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <div>
            <label className={lbl} htmlFor={`p-address-${kioskId ?? "d"}`}>Adresse de l’imprimante (IP ou nom)</label>
            <input id={`p-address-${kioskId ?? "d"}`} className={field} value={form.address} placeholder="192.168.1.50"
              onChange={(e) => edit({ address: e.target.value })} />
            <p className={hint}>L’adresse de l’imprimante sur le réseau du restaurant, sans http://.</p>
          </div>
          <div>
            <label className={lbl} htmlFor={`p-port-${kioskId ?? "d"}`}>Port</label>
            <input id={`p-port-${kioskId ?? "d"}`} className={field} type="number" min={1} max={65535} value={form.port}
              onChange={(e) => edit({ port: Number(e.target.value) })} />
            <p className={hint}>En général 9100.</p>
          </div>
        </div>

        <div className="mt-4">
          <label className={lbl} htmlFor={`p-name-${kioskId ?? "d"}`}>Nom</label>
          <input id={`p-name-${kioskId ?? "d"}`} className={field} value={form.name} onChange={(e) => edit({ name: e.target.value })} />
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-(--color-brand)" checked={form.isEnabled} onChange={(e) => edit({ isEnabled: e.target.checked })} />
            <span>Imprimante en service</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-(--color-brand)" checked={form.autoPrint} onChange={(e) => edit({ autoPrint: e.target.checked })} />
            <span>Imprimer automatiquement un ticket pour chaque commande</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-(--color-brand)" checked={form.cut} onChange={(e) => edit({ cut: e.target.checked })} />
            <span>Couper le papier après chaque ticket</span>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div>
            <label className={lbl} htmlFor={`p-copies-${kioskId ?? "d"}`}>Exemplaires</label>
            <select id={`p-copies-${kioskId ?? "d"}`} className={field} value={form.copies} onChange={(e) => edit({ copies: Number(e.target.value) })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl} htmlFor={`p-codepage-${kioskId ?? "d"}`}>Jeu de caractères</label>
            <select id={`p-codepage-${kioskId ?? "d"}`} className={field} value={form.codepage} onChange={(e) => edit({ codepage: e.target.value as CodePage })}>
              {CODEPAGES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <p className={hint}>Si les accents s’impriment mal sur le ticket de test, essayez-en un autre.</p>
          </div>
        </div>

        <p className={`${hint} mt-4`}>Les tickets sont imprimés en français sur du papier 80 mm. La ligne de pied de page se règle dans Paramètres.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={busy || !dirty || !form.address.trim()} onClick={save}>
            {busy ? "Enregistrement…" : "Enregistrer l’imprimante"}
          </button>
          {dirty ? (
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-(--color-warning)">
              <span className="dot dot-warn" />Modifications non enregistrées
            </span>
          ) : null}
        </div>
      </section>

      {/* ---- helper setup */}
      <section className={card}>
        <h2 className="card-title mb-1">NEXBORN Helper</h2>
        <p className="mb-3 text-(--color-ink-muted)">
          Une petite application sur un ordinateur du restaurant (sur le même réseau que l’imprimante). Elle récupère les nouveaux
          tickets et les envoie à l’imprimante. Installez-la, puis collez-y un code obtenu ici.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <a href="/downloads/NEXBORN-Helper.exe" download className={secondary}>Télécharger NEXBORN Helper (Windows)</a>
          <button type="button" className={primary} disabled={busy || !configured} onClick={getCode}>
            {pairing ? "Obtenir un nouveau code" : "Configurer le Helper"}
          </button>
        </div>
        {!configured ? <p className={hint}>Enregistrez d’abord l’adresse de l’imprimante.</p> : null}
        {configured && helper?.tokenIssuedAt ? (
          <p className={hint}>Un Helper a été configuré {ago(helper.tokenIssuedAt)}. Le reconfigurer remplace son secret.</p>
        ) : null}

        {pairing ? (
          <div className="note note-info mt-4" role="status">
            <p>Votre code de configuration (valable une fois, jusqu’à {new Date(pairing.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}) :</p>
            <p className="my-2 font-mono text-3xl font-bold tracking-widest text-(--color-ink) select-all">{pairing.code}</p>
            <ol className="list-decimal space-y-1 ps-5">
              <li>Sur l’ordinateur du restaurant, <a href="/downloads/NEXBORN-Helper.exe" download className="underline">téléchargez NEXBORN Helper</a> et ouvrez-le. La première fois, Windows demande l’autorisation : choisissez <b>Oui</b> (si un cadre bleu « Windows a protégé votre ordinateur » apparaît : <i>Informations complémentaires</i> › <i>Exécuter quand même</i>). Il s’installe et démarre avec Windows.</li>
              <li>Sa page s’ouvre dans le navigateur : collez ce code, appuyez sur <b>Ajouter</b>. Un ticket de test s’imprime.</li>
            </ol>
            <div className="mt-2 flex items-center gap-2.5">
              <button type="button" className={secondary} onClick={() => navigator.clipboard?.writeText(pairing.code).then(() => setNotice("Code copié."))}>
                Copier le code
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPairing(null)}>Masquer</button>
            </div>
            <p className="mt-3 text-[12.5px]">
              Cette page affiche <b>En ligne</b> quand cela fonctionne. Pour ajouter l’imprimante d’une autre borne sur le même ordinateur,
              collez le code de cette imprimante dans la même application (rouvrez NEXBORN Helper pour voir sa page).
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer">Pas Windows ? Utilisez plutôt la commande</summary>
              <p className="mt-2 text-[12.5px]">Il faut Node.js 20 ou plus récent. <a href="/downloads/kiosk-print-helper.zip" download className="underline">Téléchargez le Helper (zip)</a>, décompressez-le, et dans son dossier lancez :</p>
              <pre className="mt-1 overflow-x-auto rounded-(--radius-card) bg-(--color-nav) p-2.5 text-[12.5px] text-[#d6e2f2] select-all">
{`node src/cli.mjs setup ${origin} ${pairing.code}`}
              </pre>
            </details>
          </div>
        ) : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-(--color-ink-muted)">Configurer à la main avec un jeton</summary>
          <button type="button" className={`${secondary} mt-3`} disabled={busy || !configured} onClick={generateToken}>
            {configured && helper?.tokenIssuedAt ? "Générer un nouveau jeton" : "Générer un jeton"}
          </button>
          {token ? (
            <div className="note note-warn mt-4" role="status">
              <p className="mb-2 font-semibold">Copiez ce jeton maintenant : il n’est affiché qu’une fois.</p>
              <code className="block overflow-x-auto rounded-(--radius-card) bg-(--color-surface) p-2 text-[13px] text-(--color-ink) select-all">{token}</code>
              <div className="mt-2 flex items-center gap-2.5">
                <button type="button" className={secondary} onClick={() => navigator.clipboard?.writeText(token).then(() => setNotice("Jeton copié."))}>
                  Copier
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setToken(null)}>Je l’ai enregistré</button>
              </div>
              <p className="mt-3 text-[12.5px]">Sur l’ordinateur du restaurant, lancez le Helper avec :</p>
              <pre className="mt-1 overflow-x-auto rounded-(--radius-card) bg-(--color-nav) p-2.5 text-[12.5px] text-[#d6e2f2]">
{`KIOSK_API_URL=${origin}
PRINT_HELPER_TOKEN=${token}
node tools/print-helper/src/cli.mjs`}
              </pre>
            </div>
          ) : null}
        </details>
      </section>

      {/* ---- recent jobs */}
      <section>
        <h2 className="card-title mb-2">Derniers tickets</h2>
        {jobs.length === 0 ? (
          <p className="text-(--color-ink-muted)">Rien n’a encore été envoyé à l’imprimante.</p>
        ) : (
          <div className="table-wrap">
            <table className="table min-w-[480px]">
              <thead><tr><th>Quand</th><th>Ticket</th><th>Statut</th><th>Tentatives</th></tr></thead>
              <tbody>
                {jobs.map((j) => {
                  const [label, badge] = STATUS[j.status];
                  return (
                    <tr key={j.id}>
                      <td className="whitespace-nowrap text-(--color-ink-muted)">{ago(j.createdAt)}</td>
                      <td className="font-semibold">{j.order?.reference ?? (j.kind === "TEST" ? "Ticket de test" : "Ticket")}</td>
                      <td>
                        <span className={`badge ${badge}`}>{label}</span>
                        {j.lastError && j.status !== "PRINTED" ? <span className="block text-[12px] text-(--color-danger)">{j.lastError}</span> : null}
                      </td>
                      <td className="tabular-nums">{j.attempts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
