"use client";

import { useState } from "react";
import { changePassword } from "@/lib/api";
import { passwordProblem } from "@/lib/platform";
import { ErrorText, Field, input, primary } from "./ui";

/** Used both on the "choose your own password" screen and on the account page. */
export default function ChangePasswordForm({ onDone, submitLabel = "Change password" }: { onDone: () => void; submitLabel?: string }) {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const problem = passwordProblem(f.next, f.again, f.current);
        if (problem) return setError(problem);
        setBusy(true); setError(null);
        try {
          await changePassword(f.current, f.next);
          setDone(true);
          setF({ current: "", next: "", again: "" });
          onDone();
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}
      className="flex max-w-sm flex-col gap-4"
    >
      <Field label="Current password"><input className={input} type="password" autoComplete="current-password" required value={f.current} onChange={(e) => { setF({ ...f, current: e.target.value }); setDone(false); }} /></Field>
      <Field label="New password" hint="At least 12 characters."><input className={input} type="password" autoComplete="new-password" required minLength={12} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      <Field label="New password, again"><input className={input} type="password" autoComplete="new-password" required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></Field>
      <ErrorText message={error} />
      {done ? <p role="status" className="text-sm">Password changed. You were signed out of all your other sessions.</p> : null}
      <button type="submit" disabled={busy} className={primary + " self-start"}>{busy ? "Changing…" : submitLabel}</button>
    </form>
  );
}
