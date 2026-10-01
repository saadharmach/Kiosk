"use client";

import { useState, type ReactNode } from "react";
import { posState, type PosHealth, type PosState, type Status } from "@/lib/platform";

export const input = "h-10 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 disabled:opacity-60";
export const primary = "h-10 rounded-lg bg-(--color-brand) px-5 text-sm font-medium text-(--color-brand-ink) disabled:opacity-50";
export const secondary = "h-10 rounded-lg border border-(--color-line) px-4 text-sm disabled:opacity-50";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-(--color-ink-muted)">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-(--color-ink-muted)">{hint}</span> : null}
    </label>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  ACTIVE: "bg-(--color-brand) text-(--color-brand-ink)",
  SUSPENDED: "bg-amber-200 text-amber-950",
  ARCHIVED: "bg-(--color-surface-2) text-(--color-ink-muted)",
};
export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{status.toLowerCase()}</span>
);

const POS_LABEL: Record<PosState, [string, string]> = {
  CONNECTED: ["Connected", "text-(--color-brand)"],
  FAILING: ["Failing", "text-(--color-danger)"],
  UNTESTED: ["Not tested", "text-(--color-ink-muted)"],
  DISABLED: ["Disabled", "text-(--color-ink-muted)"],
  NOT_SET_UP: ["Not set up", "text-(--color-ink-muted)"],
};
export function PosBadge({ health }: { health: PosHealth | null }) {
  const [label, tone] = POS_LABEL[posState(health)];
  return <span className={`text-sm font-medium ${tone}`}>● {label}</span>;
}

/** A password the platform shows once. It is not stored anywhere we can read it back from. */
export function ShownOnce({ title, secret, onDone }: { title: string; secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="alert" className="rounded-(--radius-card) border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">Copy it now and pass it on. It is shown only this once and cannot be looked up again.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="rounded bg-white px-3 py-2 font-mono text-lg tracking-wider select-all">{secret}</code>
        <button className={secondary + " bg-white"} onClick={async () => {
          try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { /* the code can be selected by hand */ }
        }}>{copied ? "Copied" : "Copy"}</button>
        <button className={secondary + " bg-white"} onClick={onDone}>I have copied it</button>
      </div>
    </div>
  );
}

export const ErrorText = ({ message }: { message: string | null }) =>
  message ? <p role="alert" className="text-sm text-(--color-danger)">{message}</p> : null;

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
