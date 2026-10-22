"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createBorne, deleteBorne, getRegistration, listBornes, printerState, screenCode, setRegistration, unregisterScreen, updateBorne, type Borne,
} from "@/lib/kiosks";
import PrinterPage from "./PrinterPage";

const field = "h-10 rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3";
const btn = "h-10 rounded-lg px-4 font-medium disabled:opacity-50";
const primary = `${btn} bg-(--color-brand) text-(--color-brand-ink)`;
const secondary = `${btn} border border-(--color-line)`;
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2)";

const TONE = { ok: "text-green-700", warn: "text-amber-700", none: "text-(--color-ink-muted)" } as const;

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
        <span className="rounded bg-(--color-brand) px-2 py-0.5 text-sm font-semibold text-(--color-brand-ink)">{b.code}</span>
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-start">
          <span className="block truncate text-lg font-medium">{b.name}</span>
          <span className={`block text-sm ${TONE[state.tone]}`}>● {state.text}{b.orders ? ` · ${b.orders} order${b.orders === 1 ? "" : "s"}` : ""}</span>
          <span className={`block text-sm ${b.screen.registered ? "text-green-700" : "text-(--color-ink-muted)"}`}>
            {b.screen.registered ? "● Screen registered" : "○ Screen not registered"}
          </span>
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.isEnabled} disabled={busy}
            onChange={(e) => void act(() => updateBorne(slug, b.id, { isEnabled: e.target.checked }))} />
          Takes orders
        </label>
        <button type="button" className={secondary} onClick={onToggle}>{open ? "Close" : "Open"}</button>
      </div>

      {open ? (
        <div className="flex flex-col gap-6 border-t border-(--color-line) p-4">
          <section>
            <h3 className="mb-2 font-medium">Name</h3>
            <div className="flex gap-2">
              <input aria-label="Borne name" className={`${field} w-full sm:w-72`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <button type="button" className={secondary} disabled={busy || !name.trim() || name.trim() === b.name}
                onClick={() => void act(() => updateBorne(slug, b.id, { name: name.trim() }))}>Rename</button>
            </div>
            <p className="mt-1 text-xs text-(--color-ink-muted)">The name is printed on this borne&apos;s tickets, so staff know where the customer is.</p>
          </section>

          <section>
            <h3 className="mb-2 font-medium">Address for this machine</h3>
            <div className="flex gap-2">
              <input readOnly aria-label="Borne address" className={`${field} min-w-0 flex-1 font-mono text-sm`} value={b.url} onFocus={(e) => e.target.select()} />
              <button type="button" className={secondary}
                onClick={() => navigator.clipboard?.writeText(b.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1 text-xs text-(--color-ink-muted)">
              Open exactly this address in the browser of the machine. It remembers which borne it is, so reloading is safe. Orders from
              it start with {b.code} and print on this borne&apos;s printer.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-medium">Screen</h3>
            {b.screen.registered ? (
              <p className="text-sm">Registered{b.screen.registeredAt ? ` on ${new Date(b.screen.registeredAt).toLocaleString()}` : ""}: this machine is {b.code}, whatever its address says.</p>
            ) : (
              <p className="text-sm text-(--color-ink-muted)">Not registered yet. Register the machine&apos;s screen so the server knows it is really this borne.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={secondary} disabled={busy}
                onClick={() => void act(async () => setCode(await screenCode(slug, b.id)))}>
                {b.screen.registered ? "Register another screen" : "Register a screen"}
              </button>
              {b.screen.registered ? (
                <button type="button" className={`${secondary} text-(--color-danger)`} disabled={busy}
                  onClick={() => { if (window.confirm(`Unregister ${b.name}'s screen? If only registered screens may order, it stops at once until it is registered again.`)) void act(() => unregisterScreen(slug, b.id)); }}>
                  Unregister
                </button>
              ) : null}
            </div>
            {code ? (
              <div className="mt-3 rounded-lg border border-(--color-line) bg-(--color-surface) p-4" role="status">
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>On the kiosk machine, open <a className="font-mono underline" href={registerUrl} target="_blank" rel="noreferrer">{registerUrl}</a> (when only registered screens are allowed, any unregistered screen shows this page by itself).</li>
                  <li>Type this code with the keys on the screen and press <b>Enregistrer</b>:</li>
                </ol>
                <p className="my-2 font-mono text-3xl font-semibold tracking-widest select-all">{code.code}</p>
                <p className="text-xs text-(--color-ink-muted)">
                  It works once, until {new Date(code.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Registering a screen replaces this
                  borne&apos;s previous one.
                </p>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 font-medium">This borne&apos;s printer</h3>
            <PrinterPage slug={slug} kioskId={b.id} />
          </section>

          <section className="border-t border-(--color-line) pt-4">
            {b.orders === 0 ? (
              <button type="button" className={`${secondary} text-(--color-danger)`} disabled={busy}
                onClick={() => { if (window.confirm(`Delete ${b.name} (${b.code}) and its printer settings? This cannot be undone.`)) void act(() => deleteBorne(slug, b.id)); }}>
                Delete this borne
              </button>
            ) : (
              <p className="text-sm text-(--color-ink-muted)">
                This borne has taken {b.orders} order{b.orders === 1 ? "" : "s"}, so it cannot be deleted: its orders keep its name. Untick
                &ldquo;Takes orders&rdquo; to switch it off.
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

  if (!bornes) return error ? <p className="text-(--color-danger)">{error}</p> : <p className="text-(--color-ink-muted)">Loading…</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm text-(--color-ink-muted)">
        A borne is one kiosk machine. Give each machine its own borne, with its own printer: tickets then print where the customer is.
        Orders from a machine with no borne, or from a borne whose printer is off, go to the default printer below.
      </p>
      {error ? <p className="text-sm text-(--color-danger)" role="alert">{error}</p> : null}

      {required === false && bornes.some((b) => b.screen.registered) ? (
        <p role="status" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">
          <b>Not protected yet.</b> {bornes.filter((b) => b.screen.registered).length} of {bornes.length} borne screen(s) registered, but any other
          device can still open the kiosk address until you tick the box below.
          {bornes.some((b) => b.isEnabled && !b.screen.registered) ? " Register the other bornes' screens first, or they will stop too." : ""}
        </p>
      ) : null}
      {required === true ? (
        <p role="status" className="rounded-lg border-2 border-green-600 bg-green-50 p-3 text-sm text-green-900">
          <b>Protected.</b> Only registered screens show the menu and take orders; any other device sees &ldquo;Register this screen&rdquo;.
        </p>
      ) : null}
      {required !== null ? (
        <section className={`${card} p-4`}>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={required} disabled={savingRequired}
              onChange={async (e) => {
                const next = e.target.checked;
                if (next && !window.confirm("Only registered screens will show the menu and take orders. Any other device, and any borne whose screen is not registered yet, sees “Register this screen”. Continue?")) return;
                setSavingRequired(true); setError(null);
                try { setRequired((await setRegistration(slug, next)).required); } catch (err) { setError((err as Error).message); } finally { setSavingRequired(false); }
              }} />
            <span>
              <span className="block font-medium">Only registered screens can show the menu and take orders</span>
              <span className="block text-sm text-(--color-ink-muted)">
                Recommended once every borne&apos;s screen is registered. Then the kiosk address alone is worth nothing: someone opening it
                on their phone sees only &ldquo;Register this screen&rdquo;, and no one can pretend to be one of your bornes.
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
          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="borne-name">New borne</label>
          <input id="borne-name" className={`${field} w-full sm:w-72`} value={name} maxLength={60} placeholder="Borne entrée" onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" className={primary} disabled={adding || !name.trim()}>{adding ? "Adding…" : "Add a borne"}</button>
      </form>

      {bornes.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-6 text-center text-(--color-ink-muted)">
          No borne yet. Everything uses the default printer. Add a borne for each machine that should have its own printer.
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
            <span className="block text-lg font-medium">Default printer</span>
            <span className="block text-sm text-(--color-ink-muted)">Used for orders from no borne, and when a borne&apos;s own printer is missing or switched off.</span>
          </span>
          <span className={secondary + " flex items-center"}>{open === "default" ? "Close" : "Open"}</span>
        </button>
        {open === "default" ? <div className="border-t border-(--color-line) p-4"><PrinterPage slug={slug} /></div> : null}
      </section>
    </div>
  );
}
