"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Info { email: string; name: string | null; kind: "INVITE" | "RESET"; service: string; slug: string | null }
const BAD = "Ce lien n’est plus valable. Demandez-en un nouveau.";

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
      .then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) throw new Error(BAD); setInfo(b as Info); })
      .catch((e) => setProblem((e as Error).message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.next.length < 12) return setError("Le mot de passe doit faire au moins 12 caractères.");
    if (f.next !== f.again) return setError("Les deux mots de passe ne sont pas identiques.");
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/restaurant/auth/accept-invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: f.next }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(Array.isArray(b?.message) ? b.message.join(", ") : (b?.message ?? "Le mot de passe n’a pas pu être enregistré."));
      setDone(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card flex w-full max-w-sm flex-col gap-4 p-8">
        {done ? (
          <>
            <h1 className="text-[19px] font-bold">Mot de passe enregistré</h1>
            <p className="text-(--color-ink-muted)">Vous pouvez maintenant vous connecter avec l’adresse du restaurant <strong>{info?.slug}</strong> et l’e-mail <strong>{info?.email}</strong>.</p>
            <a href="/" className="btn btn-primary">Aller à la connexion</a>
          </>
        ) : problem ? (
          <>
            <h1 className="text-[19px] font-bold">Lien non valable</h1>
            <p role="alert" className="note note-err">{problem}</p>
            <p className="text-(--color-ink-muted)">Les liens fonctionnent une fois et expirent. Demandez-en un nouveau à la personne qui vous a invité.</p>
          </>
        ) : !info ? <p className="text-(--color-ink-muted)">Chargement…</p> : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <h1 className="text-[19px] font-bold">{info.kind === "RESET" ? "Choisissez un nouveau mot de passe" : "Bienvenue"}</h1>
              <p className="mt-1 text-(--color-ink-muted)">{info.name ? `${info.name}, c` : "C"}hoisissez un mot de passe pour <strong>{info.email}</strong> ({info.service}).</p>
            </div>
            <div>
              <label className="field-label" htmlFor="pw1">Nouveau mot de passe</label>
              <input id="pw1" className="field" type="password" autoComplete="new-password" required minLength={12} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
              <span className="field-hint">Au moins 12 caractères.</span>
            </div>
            <div>
              <label className="field-label" htmlFor="pw2">Nouveau mot de passe, encore</label>
              <input id="pw2" className="field" type="password" autoComplete="new-password" required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} />
            </div>
            {error ? <p role="alert" className="note note-err">{error}</p> : null}
            <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Enregistrement…" : "Enregistrer mon mot de passe"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
