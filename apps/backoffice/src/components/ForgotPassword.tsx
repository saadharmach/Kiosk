"use client";

import { useState } from "react";

/** Ask for a link to choose a new password. The answer is the same whether or not the address has an account. */
export default function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [f, setF] = useState({ slug: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <div className="card flex w-full max-w-sm flex-col gap-4 p-8">
      <h1 className="text-[19px] font-bold">Mot de passe oublié ?</h1>
      {sent ? (
        <>
          <p role="status" className="note note-ok">
            S’il existe un compte pour <strong>{f.email.trim()}</strong> dans ce restaurant, nous lui avons envoyé un lien pour choisir un
            nouveau mot de passe. Le lien fonctionne une fois et expire dans 24 heures.
          </p>
          <p className="text-(--color-ink-muted)">Rien reçu après quelques minutes ? Regardez dans les indésirables, ou demandez un lien à votre contact NEXBORN.</p>
          <button onClick={onBack} className="btn btn-secondary">Retour à la connexion</button>
        </>
      ) : (
        <form className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null);
            try {
              const res = await fetch("/api/restaurant/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: f.slug.trim().toLowerCase(), email: f.email.trim() }) });
              if (res.status === 429) throw new Error("Trop de demandes. Attendez une minute puis réessayez.");
              if (!res.ok) throw new Error("La demande n’a pas pu être envoyée. Vérifiez l’adresse du restaurant et l’e-mail, puis réessayez.");
              setSent(true);
            } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}
        >
          <p className="text-(--color-ink-muted)">Indiquez votre restaurant et votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
          <div>
            <label className="field-label" htmlFor="forgot-slug">Adresse du restaurant</label>
            <input id="forgot-slug" required value={f.slug} autoComplete="organization" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="field" onChange={(e) => setF({ ...f, slug: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor="forgot-email">E-mail</label>
            <input id="forgot-email" type="email" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={f.email} className="field" onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          {error ? <p role="alert" className="note note-err">{error}</p> : null}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">{busy ? "Envoi…" : "M’envoyer un lien"}</button>
          <button type="button" onClick={onBack} className="self-start text-[13px] text-(--color-brand) hover:underline">Retour à la connexion</button>
        </form>
      )}
    </div>
  );
}
