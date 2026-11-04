"use client";

import type { ReactNode } from "react";
import { posState, type PosHealth, type PosState, type Status } from "@/lib/platform";

// The shared look (globals.css): one place to change a field or a button for every page.
export const input = "field";
export const primary = "btn btn-primary";
export const secondary = "btn btn-secondary";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  ACTIVE: "badge-ok",
  SUSPENDED: "badge-warn",
  ARCHIVED: "badge-muted",
};
export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`badge ${STATUS_STYLE[status]}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>
);

const POS_LABEL: Record<PosState, [string, string]> = {
  CONNECTED: ["Connected", "badge-ok"],
  FAILING: ["Failing", "badge-err"],
  UNTESTED: ["Not tested", "badge-muted"],
  DISABLED: ["Disabled", "badge-muted"],
  NOT_SET_UP: ["Not set up", "badge-muted"],
};
export function PosBadge({ health }: { health: PosHealth | null }) {
  const [label, tone] = POS_LABEL[posState(health)];
  return <span className={`badge ${tone}`}>unTill: {label}</span>;
}

export const ErrorText = ({ message }: { message: string | null }) =>
  message ? <p role="alert" className="note note-err">{message}</p> : null;

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
