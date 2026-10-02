"use client";

import { useState } from "react";
import { ErrorText, input, primary } from "./ui";

/** Ask for a link to choose a new password. The answer is the same whether or not the address has an account. */
export default function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <div className="w-full max-w-sm rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-8">
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      {sent ? (
        <>
          <p role="status" className="mt-4 text-sm">If there is a platform account for <strong>{email.trim()}</strong>, we have emailed it a link to choose a new password. The link works once and expires in 24 hours.</p>
          <p className="mt-2 text-sm text-(--color-ink-muted)">Nothing arrived after a few minutes? Check the spam folder, or ask another super admin to send you a reset link.</p>
          <button onClick={onBack} className="mt-6 text-sm underline">Back to sign in</button>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null);
            try {
              const res = await fetch("/api/admin/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
              if (res.status === 429) throw new Error("Too many requests. Wait a minute and try again.");
              if (!res.ok) throw new Error("Could not send the request. Check the address and try again.");
              setSent(true);
            } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}
        >
          <p className="mb-6 mt-1 text-sm text-(--color-ink-muted)">Enter your email and we will send you a link to choose a new one.</p>
          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="forgot-email">Email</label>
          <input id="forgot-email" type="email" required autoComplete="username" value={email} className={input + " mb-4"} onChange={(e) => setEmail(e.target.value)} />
          <div className="mb-4"><ErrorText message={error} /></div>
          <button type="submit" disabled={busy} className={primary + " w-full"}>{busy ? "Sending…" : "Send me a link"}</button>
          <button type="button" onClick={onBack} className="mt-4 text-sm underline">Back to sign in</button>
        </form>
      )}
    </div>
  );
}
