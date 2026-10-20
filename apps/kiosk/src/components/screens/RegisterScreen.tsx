"use client";

import { useCallback, useEffect, useState } from "react";
import { STRINGS, type Locale } from "@/i18n";
import { ApiError, registerScreen } from "@/lib/api";
import { saveScreenSecret } from "@/lib/borne";
import { Icon } from "../icons";

/** The characters a code can have (no 0/O, 1/I/L): the same alphabet the back office's codes use. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".split("");
const LENGTH = 8;

/**
 * "Register this screen": staff type the one-time code from the back office (Bornes › Register a screen) with the keys
 * on the screen (or a keyboard). The screen then keeps its secret and is that borne from now on.
 */
export default function RegisterScreen({ slug, locale, onRegistered }: {
  slug: string;
  locale: Locale;
  onRegistered: (secret: string, borneCode: string) => void;
}) {
  const t = STRINGS[locale];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = useCallback((c: string) => setCode((v) => (v.length < LENGTH ? v + c : v)), []);
  const erase = useCallback(() => setCode((v) => v.slice(0, -1)), []);

  const submit = useCallback(async () => {
    if (code.length !== LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await registerScreen(slug, code);
      if (!saveScreenSecret(slug, r.secret, r.borne.code)) { setError(t.registerNotKept); return; }
      onRegistered(r.secret, r.borne.code);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  }, [code, busy, slug, t, onRegistered]);

  // A keyboard plugged in for the setup works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (ALPHABET.includes(k)) type(k);
      else if (e.key === "Backspace") erase();
      else if (e.key === "Enter") void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [type, erase, submit]);

  const shown = code.padEnd(LENGTH, "·");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-12 text-center">
      <span className="flex size-40 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-deep)">
        <Icon name="info" className="size-20" strokeWidth={1.6} />
      </span>
      <h1 className="font-display text-6xl font-bold">{t.registerTitle}</h1>
      <p className="max-w-3xl text-3xl leading-snug text-(--color-ink-muted)">{t.registerText}</p>
      <p dir="ltr" aria-live="polite" className="font-mono text-7xl font-bold tracking-[0.3em]">{shown.slice(0, 4)}-{shown.slice(4)}</p>
      {error ? <p role="alert" className="max-w-3xl text-2xl font-semibold text-(--color-danger)">{error}</p> : null}
      <div dir="ltr" className="grid w-full max-w-4xl grid-cols-8 gap-3">
        {ALPHABET.map((c) => (
          <button key={c} onClick={() => type(c)} disabled={busy}
            className="h-20 rounded-2xl border-2 border-(--color-line) bg-(--color-surface) font-display text-4xl font-bold disabled:opacity-40">{c}</button>
        ))}
        <button onClick={erase} disabled={busy} aria-label="⌫"
          className="flex h-20 items-center justify-center rounded-2xl bg-(--color-line) disabled:opacity-40">
          <Icon name="backspace" className="size-10" />
        </button>
      </div>
      <button onClick={() => void submit()} disabled={busy || code.length !== LENGTH}
        className="min-h-28 w-full max-w-2xl rounded-full bg-(--color-brand) font-display text-4xl font-bold text-(--color-brand-ink) disabled:opacity-40">
        {t.registerButton}
      </button>
    </main>
  );
}
