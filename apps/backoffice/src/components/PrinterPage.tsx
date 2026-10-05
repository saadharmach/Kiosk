"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPrinter, issuePairingCode, issuePrinterToken, listPrintJobs, savePrinter, testPrint,
  type CodePage, type PrintJobRow, type PrinterView, type SavePrinterBody,
} from "@/lib/printer";

const field = "h-10 w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3";
const lbl = "mb-1 block text-sm text-(--color-ink-muted)";
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5";
const hint = "mt-1 text-xs text-(--color-ink-muted)";
const btn = "h-10 rounded-lg px-4 font-medium disabled:opacity-50";
const primary = `${btn} bg-(--color-brand) text-(--color-brand-ink)`;
const secondary = `${btn} border border-(--color-line)`;

const CODEPAGES: { value: CodePage; label: string }[] = [
  { value: "CP858", label: "PC858: French accents and the € sign (recommended)" },
  { value: "CP437", label: "PC437: the common default, fewer accents" },
  { value: "CP1252", label: "Windows-1252: for printers that use it" },
];

const EMPTY: SavePrinterBody = {
  name: "Ticket printer", address: "", port: 9100, isEnabled: true,
  autoPrint: true, copies: 1, cut: true, codepage: "CP858",
};

/** "12 s ago", "3 min ago", or the date, for a sign of life. */
function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString();
}

const STATUS_CLASS: Record<PrintJobRow["status"], string> = {
  PRINTED: "text-green-700",
  QUEUED: "text-(--color-ink-muted)",
  PRINTING: "text-(--color-ink-muted)",
  FAILED: "text-(--color-danger)",
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
      setNotice("The helper used the code. It is set up and will show as Online in a moment.");
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
    setNotice("Saved.");
  });

  const generateToken = () => run(async () => {
    if (view?.configured && view.helper.tokenIssuedAt &&
        !window.confirm("This replaces the current token. The helper at the restaurant stops printing until you give it the new one. Continue?")) return;
    setToken((await issuePrinterToken(slug, kioskId)).token);
    await refresh();
  });

  const getCode = () => run(async () => {
    if (view?.configured && view.helper.tokenIssuedAt &&
        !window.confirm("The helper that is already set up keeps working until the new code is used. Running the setup replaces its secret. Continue?")) return;
    sawWaiting.current = false;
    setPairing(await issuePairingCode(slug, kioskId));
    await refresh();
  });

  const sendTest = () => run(async () => {
    await testPrint(slug, kioskId);
    setNotice("Test ticket queued. It prints as soon as the helper picks it up.");
    await refresh();
  });

  if (!view) {
    return error ? <p className="text-(--color-danger)">{error}</p> : <p className="text-(--color-ink-muted)">Loading…</p>;
  }

  const configured = view.configured;
  const helper = configured ? view.helper : null;
  const neverConnected = configured && !helper?.lastSeenAt;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* ---- status */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-(--color-ink-muted)">Print helper</p>
            <p className={`text-lg font-medium ${helper?.online ? "text-green-700" : ""}`}>
              {!configured ? "Not set up" : helper?.online ? "Online" : neverConnected ? "Never connected" : "Offline"}
            </p>
            {configured && helper?.lastSeenAt ? (
              <p className={hint}>Last contact {ago(helper.lastSeenAt)}</p>
            ) : null}
          </div>
          <button type="button" className={secondary} disabled={busy || !configured} onClick={sendTest}>
            Print a test ticket
          </button>
        </div>
        {view.configured && view.lastError ? (
          <p className="mt-3 rounded-lg border border-(--color-danger) p-3 text-sm text-(--color-danger)" role="alert">
            Last printing error ({ago(view.lastError.at)}): {view.lastError.message}
          </p>
        ) : null}
        {!configured ? (
          <p className={hint}>Save the printer's address below, then generate a token for the helper.</p>
        ) : null}
      </section>

      {error ? <p className="text-sm text-(--color-danger)" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm text-green-700" role="status">{notice}</p> : null}

      {/* ---- settings */}
      <section className={card}>
        <h2 className="mb-4 text-lg font-medium">Ticket printer</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <div>
            <label className={lbl} htmlFor="p-address">Printer address (IP or host name)</label>
            <input id="p-address" className={field} value={form.address} placeholder="192.168.1.50"
              onChange={(e) => edit({ address: e.target.value })} />
            <p className={hint}>The printer's address on the restaurant's network, without http://.</p>
          </div>
          <div>
            <label className={lbl} htmlFor="p-port">Port</label>
            <input id="p-port" className={field} type="number" min={1} max={65535} value={form.port}
              onChange={(e) => edit({ port: Number(e.target.value) })} />
            <p className={hint}>Usually 9100.</p>
          </div>
        </div>

        <div className="mt-4">
          <label className={lbl} htmlFor="p-name">Name</label>
          <input id="p-name" className={field} value={form.name} onChange={(e) => edit({ name: e.target.value })} />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isEnabled} onChange={(e) => edit({ isEnabled: e.target.checked })} />
            <span>Printer is switched on</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.autoPrint} onChange={(e) => edit({ autoPrint: e.target.checked })} />
            <span>Print a ticket automatically for every order</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.cut} onChange={(e) => edit({ cut: e.target.checked })} />
            <span>Cut the paper after each ticket</span>
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div>
            <label className={lbl} htmlFor="p-copies">Copies</label>
            <select id="p-copies" className={field} value={form.copies} onChange={(e) => edit({ copies: Number(e.target.value) })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl} htmlFor="p-codepage">Character set</label>
            <select id="p-codepage" className={field} value={form.codepage} onChange={(e) => edit({ codepage: e.target.value as CodePage })}>
              {CODEPAGES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <p className={hint}>If accents print wrongly on the test ticket, try another one.</p>
          </div>
        </div>

        <p className={`${hint} mt-4`}>
          Tickets are printed in French on 80 mm paper. The footer line is set in Settings.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <button type="button" className={primary} disabled={busy || !dirty || !form.address.trim()} onClick={save}>
            {busy ? "Saving…" : "Save printer"}
          </button>
          {dirty ? <span className="text-sm text-(--color-ink-muted)">Unsaved changes</span> : null}
        </div>
      </section>

      {/* ---- helper setup */}
      <section className={card}>
        <h2 className="mb-1 text-lg font-medium">Print helper</h2>
        <p className="mb-3 text-sm text-(--color-ink-muted)">
          A small program on a computer at the restaurant (on the same network as the printer). It fetches new tickets and
          sends them to the printer. Setting it up takes one command, with a code from here.
        </p>
        <button type="button" className={primary} disabled={busy || !configured} onClick={getCode}>
          {pairing ? "Get a new code" : "Set up the helper"}
        </button>
        {!configured ? <p className={hint}>Save the printer's address first.</p> : null}
        {configured && helper?.tokenIssuedAt ? (
          <p className={hint}>A helper was set up {ago(helper.tokenIssuedAt)}. Setting it up again replaces its secret.</p>
        ) : null}

        {pairing ? (
          <div className="mt-4 rounded-lg border border-(--color-line) bg-(--color-surface) p-4" role="status">
            <p className="text-sm">Your setup code (works once, until {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}):</p>
            <p className="my-2 font-mono text-3xl font-semibold tracking-widest select-all">{pairing.code}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>On the restaurant computer, put the <code>tools/print-helper</code> folder and install <b>Node.js 20 or newer</b> (nodejs.org).</li>
              <li>Open a terminal in that folder (on Windows: PowerShell with <i>Run as administrator</i>) and run:</li>
            </ol>
            <pre className="mt-2 overflow-x-auto rounded bg-(--color-surface-2) p-2 text-xs select-all">
{`node src/cli.mjs setup ${typeof window !== "undefined" ? window.location.origin : ""} ${pairing.code}`}
            </pre>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" className={secondary} onClick={() => navigator.clipboard?.writeText(
                `node src/cli.mjs setup ${window.location.origin} ${pairing.code}`).then(() => setNotice("Command copied."))}>
                Copy the command
              </button>
              <button type="button" className="underline" onClick={() => setPairing(null)}>Hide</button>
            </div>
            <p className={`${hint} mt-3`}>
              It saves its settings, checks that the computer can reach the printer, starts itself at every boot and queues a test
              ticket. This page shows <b>Online</b> when it works. To add another borne's printer to the same computer, run it again
              with that printer's own code.
            </p>
          </div>
        ) : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-(--color-ink-muted)">Set up by hand with a token instead</summary>
          <button type="button" className={`${secondary} mt-3`} disabled={busy || !configured} onClick={generateToken}>
            {configured && helper?.tokenIssuedAt ? "Generate a new token" : "Generate token"}
          </button>
          {token ? (
            <div className="mt-4 rounded-lg border border-(--color-line) bg-(--color-surface) p-4" role="status">
              <p className="mb-2 text-sm font-medium">Copy this token now. It is shown only once.</p>
              <code className="block overflow-x-auto rounded bg-(--color-surface-2) p-2 text-sm select-all">{token}</code>
              <div className="mt-2 flex items-center gap-3">
                <button type="button" className={secondary} onClick={() => navigator.clipboard?.writeText(token).then(() => setNotice("Token copied."))}>
                  Copy
                </button>
                <button type="button" className="underline" onClick={() => setToken(null)}>I have saved it</button>
              </div>
              <p className={`${hint} mt-3`}>On the restaurant computer, run the helper with:</p>
              <pre className="mt-1 overflow-x-auto rounded bg-(--color-surface-2) p-2 text-xs">
{`KIOSK_API_URL=${typeof window !== "undefined" ? window.location.origin : ""}
PRINT_HELPER_TOKEN=${token}
node tools/print-helper/src/cli.mjs`}
              </pre>
            </div>
          ) : null}
        </details>
      </section>

      {/* ---- recent jobs */}
      <section>
        <h2 className="mb-2 text-lg font-medium">Recent tickets</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">Nothing has been sent to the printer yet.</p>
        ) : (
          <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                <span className="w-32 text-(--color-ink-muted)">{ago(j.createdAt)}</span>
                <span className="w-40 font-mono">{j.order?.reference ?? (j.kind === "TEST" ? "Test ticket" : "Ticket")}</span>
                <span className={`w-24 font-medium ${STATUS_CLASS[j.status]}`}>{j.status}</span>
                {j.attempts > 1 ? <span className="text-(--color-ink-muted)">{j.attempts} attempts</span> : null}
                {j.lastError && j.status !== "PRINTED" ? (
                  <span className="basis-full text-(--color-danger)">{j.lastError}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
