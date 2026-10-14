"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  bridgePairing, getConnection, runSync, saveConnection, syncRuns, syncSchedule, testConnection,
  type Connection, type SyncRun, type SyncSchedule, type TestResult,
} from "@/lib/platform";
import { ErrorText, Field, input, primary, secondary, when } from "./ui";

export default function ConnectionTab({ id, canWrite, onChanged }: { id: string; canWrite: boolean; onChanged: () => void }) {
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);   // undefined: loading, null: none yet
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [schedule, setSchedule] = useState<SyncSchedule | null>(null);
  const [f, setF] = useState({ host: "", port: "", useTls: false, isEnabled: true, appName: "", userName: "", password: "", appToken: "", route: "DIRECT" as "DIRECT" | "BRIDGE" });
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "sync" | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await getConnection(id);
      setConn(c);
      setF((cur) => ({ ...cur, host: c.host, port: String(c.port), useTls: c.useTls, isEnabled: c.isEnabled, appName: c.appName, userName: "", password: "", appToken: "", route: c.route }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setConn(null); else setError((e as Error).message);
    }
    syncRuns(id).then(setRuns).catch(() => undefined);
    syncSchedule(id).then(setSchedule).catch(() => undefined);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  // While the bridge is being set up (or is not connected), look again every few seconds: it shows up by itself.
  const watchBridge = conn?.route === "BRIDGE" && (!conn.bridge.online || Boolean(code));
  useEffect(() => {
    if (!watchBridge) return;
    const t = setInterval(() => { getConnection(id).then(setConn).catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, [watchBridge, id]);

  const act = async (kind: "save" | "test" | "sync", fn: () => Promise<void>) => {
    setBusy(kind); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const save = () => act("save", async () => {
    const creds = f.userName || f.password || f.appToken ? { userName: f.userName, password: f.password, appToken: f.appToken } : {};
    await saveConnection(id, { host: f.host.trim(), port: Number(f.port), useTls: f.useTls, isEnabled: f.isEnabled, route: f.route, ...(f.appName.trim() ? { appName: f.appName.trim() } : {}), ...creds });
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

        <fieldset disabled={!canWrite || busy !== null} className="mb-4 flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">How the server reaches the till</legend>
          {([
            ["DIRECT", "Over the internet", "The till's address below can be reached from the server (a public address, or a port opened in the restaurant's router)."],
            ["BRIDGE", "Through the bridge at the restaurant", "The till is only on the restaurant's network (for example 192.168.0.106). A computer there runs the helper as a bridge: it connects out to us, so nothing is opened in the router."],
          ] as const).map(([value, label, help]) => (
            <label key={value} className="flex cursor-pointer items-start gap-3">
              <input type="radio" name="till-route" className="mt-1 h-4 w-4" checked={f.route === value} onChange={() => { setF({ ...f, route: value }); setSaved(false); }} />
              <span><span className="font-medium">{label}</span><span className="block text-sm text-(--color-ink-muted)">{help}</span></span>
            </label>
          ))}
        </fieldset>

        <fieldset disabled={!canWrite || busy !== null} className="grid gap-4 md:grid-cols-3">
          <Field label={f.route === "BRIDGE" ? "Till's address on the restaurant's network" : "Host"}><input className={input} value={f.host} onChange={(e) => { setF({ ...f, host: e.target.value }); setSaved(false); }} /></Field>
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

        {conn?.route === "BRIDGE" ? (
          <div className="mt-5 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-4">
            <p className="font-medium">
              Bridge:{" "}
              {conn.bridge.online
                ? <span className="text-green-700">connected</span>
                : <span className="text-(--color-danger)">{conn.bridge.paired ? "not connected (the computer at the restaurant is off, or the helper is not running)" : "not set up yet"}</span>}
            </p>
            {conn.bridge.pairedAt ? <p className="text-sm text-(--color-ink-muted)">Set up {when(conn.bridge.pairedAt)}.</p> : null}
            {canWrite ? (
              <button className={secondary + " mt-3"} disabled={busy !== null}
                onClick={() => act("save", async () => { setCode(await bridgePairing(id)); })}>
                {conn.bridge.paired ? "Set up the bridge again" : "Set up the bridge"}
              </button>
            ) : null}
            {code ? (
              <>
              <ol className="mt-4 flex list-decimal flex-col gap-2 ps-5 text-sm">
                <li>On a computer at the restaurant that is always on and on the same network as the till (the printer&apos;s computer is fine): <a href="/downloads/NEXBORN-Helper.exe" download className="underline">download NEXBORN Helper</a> and open it (if it is already installed, opening it shows its page). The first time Windows asks to allow it: <b>Yes</b> (a blue &quot;Windows protected your PC&quot; box: <i>More info</i> › <i>Run anyway</i>).</li>
                <li>In its page, paste this code and press <b>Add</b>:
                  <span className="mt-1 block font-mono text-2xl font-semibold tracking-widest select-all">{code.code}</span>
                  It works once, until {new Date(code.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Setting up again replaces the old bridge.
                </li>
                <li>This page shows the bridge as <b>connected</b> within a few seconds. Then press <b>Test connection</b>.</li>
              </ol>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-(--color-ink-muted)">Not Windows? Use the command instead</summary>
                <p className="mt-1 text-(--color-ink-muted)">Needs Node.js 20 or newer. <a href="/downloads/kiosk-print-helper.zip" download className="underline">Download the helper (zip)</a>, unzip it, and in its folder run:</p>
                <code className="mt-1 block overflow-x-auto rounded bg-(--color-surface) p-2 select-all">node src/cli.mjs setup-bridge {typeof window === "undefined" ? "" : window.location.origin} {code.code}</code>
              </details>
              </>
            ) : null}
          </div>
        ) : null}

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
              if (window.confirm("Read the menu from the till now? The kiosk keeps showing the current menu until the new one is complete. Photos, translations and suggestions are kept.")) {
                void act("sync", async () => { await runSync(id); await load(); onChanged(); });
              }
            }}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
          </div>
          {schedule ? (
            <p className="mb-3 text-sm text-(--color-ink-muted)">
              {!schedule.enabled
                ? "Automatic syncing is switched off on this server: the menu changes only when someone presses Sync now."
                : !conn.isEnabled
                  ? "Automatic syncing waits until this connection is switched on."
                  : `Read automatically about every ${schedule.intervalMin >= 60 && schedule.intervalMin % 60 === 0 ? `${schedule.intervalMin / 60} h` : `${schedule.intervalMin} min`}. ${schedule.nextAt ? `Next read around ${new Date(schedule.nextAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "The next read is due now."} After a failure it tries again sooner.`}
            </p>
          ) : null}
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
