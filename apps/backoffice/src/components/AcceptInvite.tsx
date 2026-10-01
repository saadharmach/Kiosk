"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
const input = "h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3";
const primary = "h-11 rounded-lg bg-(--color-brand) px-5 font-medium text-(--color-brand-ink) disabled:opacity-50";
const ErrorText = ({ message }: { message: string | null }) => (message ? <p role="alert" className="text-sm text-(--color-danger)">{message}</p> : null);
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block"><span className="mb-1 block text-sm text-(--color-ink-muted)">{label}</span>{children}{hint ? <span className="mt-1 block text-xs text-(--color-ink-muted)">{hint}</span> : null}</label>
);

interface Info { email: string; name: string | null; kind: "INVITE" | "RESET"; service: string; slug: string | null }
const BAD = "This link is not valid any more. Ask for a new one.";

/** What a person sees after opening the link in their email: choose a password, then sign in. */
export default function AcceptInvite() {
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");   // kept in memory only
  const [info, setInfo] = useState<Info | null>(null);
  const [problem, setProblem] = useState<string | null>(token ? null : BAD);
  const [f, setF] = useState({ next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The address bar no longer needs the token (and history should not keep a credential).
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) return;
    fetch(`/api/restaurant/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.message ?? BAD); setInfo(b as Info); })
      .catch((e) => setProblem((e as Error).message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.next.length < 12) return setError("The password must be at least 12 characters.");
    if (f.next !== f.again) return setError("The two passwords are not the same.");
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/restaurant/auth/accept-invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: f.next }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(Array.isArray(b?.message) ? b.message.join(", ") : (b?.message ?? "Could not save the password"));
      setDone(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-8">
        {done ? (
          <>
            <h1 className="text-2xl font-semibold">Password saved</h1>
            <p className="mt-2 text-sm text-(--color-ink-muted)">You can now sign in with the restaurant address <strong>{info?.slug}</strong> and the email <strong>{info?.email}</strong>.</p>
            <a href="/" className={primary + " mt-6 inline-flex items-center"}>Go to sign in</a>
          </>
        ) : problem ? (
          <>
            <h1 className="text-2xl font-semibold">Link not valid</h1>
            <p role="alert" className="mt-2 text-sm text-(--color-danger)">{problem}</p>
            <p className="mt-4 text-sm text-(--color-ink-muted)">Links work once and expire. Ask whoever invited you to send a new one.</p>
          </>
        ) : !info ? <p className="text-(--color-ink-muted)">Loading…</p> : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{info.kind === "RESET" ? "Choose a new password" : "Welcome"}</h1>
              <p className="mt-1 text-sm text-(--color-ink-muted)">{info.name ? `${info.name}, ` : ""}choose a password for <strong>{info.email}</strong> ({info.service}).</p>
            </div>
            <Field label="New password" hint="At least 12 characters."><input className={input} type="password" autoComplete="new-password" required minLength={12} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
            <Field label="New password, again"><input className={input} type="password" autoComplete="new-password" required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></Field>
            <ErrorText message={error} />
            <button type="submit" disabled={busy} className={primary}>{busy ? "Saving…" : "Save my password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
