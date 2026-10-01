"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  getConnection, runSync, saveConnection, syncRuns, testConnection,
  type Connection, type SyncRun, type TestResult,
} from "@/lib/platform";
import { ErrorText, Field, input, primary, secondary, when } from "./ui";

export default function ConnectionTab({ id, canWrite, onChanged }: { id: string; canWrite: boolean; onChanged: () => void }) {
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);   // undefined: loading, null: none yet
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [f, setF] = useState({ host: "", port: "", useTls: false, isEnabled: true, appName: "", userName: "", password: "", appToken: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "sync" | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await getConnection(id);
      setConn(c);
      setF((cur) => ({ ...cur, host: c.host, port: String(c.port), useTls: c.useTls, isEnabled: c.isEnabled, appName: c.appName, userName: "", password: "", appToken: "" }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setConn(null); else setError((e as Error).message);
    }
    syncRuns(id).then(setRuns).catch(() => undefined);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (kind: "save" | "test" | "sync", fn: () => Promise<void>) => {
    setBusy(kind); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const save = () => act("save", async () => {
    const creds = f.userName || f.password || f.appToken ? { userName: f.userName, password: f.password, appToken: f.appToken } : {};
    await saveConnection(id, { host: f.host.trim(), port: Number(f.port), useTls: f.useTls, isEnabled: f.isEnabled, ...(f.appName.trim() ? { appName: f.appName.trim() } : {}), ...creds });
    setSaved(true); setTest(null); await load(); onChanged();
  });

  if (conn === undefined && !error) return <p className="text-(--color-ink-muted)">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Connection to the till (unTill TPAPI)</h2>
        {conn ? (
          <dl className="mb-4 grid gap-x-8 gap-y-1 text-sm md:grid-cols-2">
            <div><dt className="inline text-(--color-ink-muted)">Last success: </dt><dd className="inline">{when(conn.lastSuccessAt)}</dd></div>
            <div><dt className="inline text-(--color-ink-muted)">Last failure: </dt><dd className="inline">{when(conn.lastFailureAt)}</dd></div>
            <div><dt className="inline text-(--color-ink-muted)">Last sync: </dt><dd className="inline">{when(conn.lastSyncAt)}</dd></div>
            <div><dt className="inline text-(--color-ink-muted)">Last latency: </dt><dd className="inline">{conn.lastLatencyMs === null ? "—" : `${conn.lastLatencyMs} ms`}</dd></div>
            {conn.lastErrorMessage ? <div className="md:col-span-2 text-(--color-danger)">Last error: {conn.lastErrorMessage}</div> : null}
          </dl>
        ) : <p className="mb-4 text-sm text-(--color-ink-muted)">This restaurant has no till connection yet.{canWrite ? " Fill the form to set one up." : ""}</p>}

        <fieldset disabled={!canWrite || busy !== null} className="grid gap-4 md:grid-cols-3">
          <Field label="Host"><input className={input} value={f.host} onChange={(e) => { setF({ ...f, host: e.target.value }); setSaved(false); }} /></Field>
          <Field label="Port"><input className={input} inputMode="numeric" value={f.port} onChange={(e) => { setF({ ...f, port: e.target.value.replace(/\D/g, "") }); setSaved(false); }} /></Field>
          <Field label="App name"><input className={input} value={f.appName} placeholder="KioskPlatform" onChange={(e) => setF({ ...f, appName: e.target.value })} /></Field>
          <Field label="User name" hint={conn?.hasCredentials ? "Leave the three credential fields empty to keep the stored ones." : "Required the first time."}>
            <input className={input} autoComplete="off" value={f.userName} placeholder={conn?.hasCredentials ? "unchanged" : ""} onChange={(e) => setF({ ...f, userName: e.target.value })} />
          </Field>
          <Field label="Password"><input className={input} type="password" autoComplete="new-password" value={f.password} placeholder={conn?.hasCredentials ? "unchanged" : ""} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="App token"><input className={input} type="password" autoComplete="off" value={f.appToken} placeholder={conn?.hasCredentials ? "unchanged" : ""} onChange={(e) => setF({ ...f, appToken: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.useTls} onChange={(e) => setF({ ...f, useTls: e.target.checked })} /> Use TLS (https)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isEnabled} onChange={(e) => setF({ ...f, isEnabled: e.target.checked })} /> Enabled</label>
        </fieldset>
        <p className="mt-2 text-xs text-(--color-ink-muted)">Credentials are stored encrypted on the server and are never shown again, here or anywhere.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canWrite ? <button onClick={save} disabled={busy !== null || !f.host.trim() || !f.port} className={primary}>{busy === "save" ? "Saving…" : "Save"}</button> : null}
          {conn ? <button disabled={busy !== null} className={secondary} onClick={() => act("test", async () => { setTest(await testConnection(id)); await load(); onChanged(); })}>{busy === "test" ? "Testing…" : "Test connection"}</button> : null}
          {saved ? <span role="status" className="text-sm text-(--color-ink-muted)">Saved</span> : null}
          <ErrorText message={error} />
        </div>

        {test ? (
          <p role="status" className={`mt-3 rounded-lg p-3 text-sm ${test.ok ? "bg-(--color-surface-2)" : "text-(--color-danger) bg-(--color-surface-2)"}`}>
            {test.ok ? `Reached the till in ${test.durationMs} ms${test.version ? `, unTill ${test.version}` : ""}.` : `Could not reach the till: ${test.error ?? test.message ?? "no answer"}`}
          </p>
        ) : null}
      </section>

      {conn ? (
        <section>
          <div className="mb-3 flex items-center gap-4">
            <h2 className="text-lg font-medium">Menu sync</h2>
            <button disabled={busy !== null} className={secondary} onClick={() => {
              if (window.confirm("Read the menu from the till now? This replaces the restaurant's copy of the menu data (prices, products, options). Photos, translations and suggestions are kept.")) {
                void act("sync", async () => { await runSync(id); await load(); onChanged(); });
              }
            }}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
          </div>
          {runs.length === 0 ? <p className="text-sm text-(--color-ink-muted)">No sync has run yet.</p> : (
            <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
              <table className="w-full text-sm">
                <thead className="bg-(--color-surface-2) text-(--color-ink-muted)"><tr>{["Started", "Result", "How", "Took", "Message"].map((h) => <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-(--color-line)">
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">{when(r.startedAt)}</td>
                      <td className={`px-4 py-2 font-medium ${r.status === "FAILED" ? "text-(--color-danger)" : ""}`}>{r.status.toLowerCase()}</td>
                      <td className="px-4 py-2">{r.trigger.toLowerCase()}</td>
                      <td className="px-4 py-2">{r.durationMs === null ? "—" : `${(r.durationMs / 1000).toFixed(1)} s`}</td>
                      <td className="px-4 py-2 text-(--color-ink-muted)">{r.errorMessage ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
