"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createTeamMember, invitationNotice, listTeam, resendTeamInvitation, resetTeamPassword, teamActivity, updateTeamMember,
  type TeamMember, type TeamRole,
} from "@/lib/platform";
import { ErrorText, Field, input, primary, secondary, when } from "./ui";

const ROLE_LABEL: Record<TeamRole, string> = { SUPER_ADMIN: "Super admin", SUPPORT: "Support (read-only)" };
const readable = (a: string) => a.replace("platform_user.", "").replace(/_/g, " ");

export default function TeamPage({ myId }: { myId: string }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof teamActivity>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ email: string; fullName: string; role: TeamRole }>({ email: "", fullName: "", role: "SUPPORT" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listTeam().then(setTeam).catch((e) => setError((e as Error).message));
    teamActivity().then(setActivity).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setNotice(null);
    try { await fn(); load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  if (!team) return <><ErrorText message={error} />{!error ? <p className="text-(--color-ink-muted)">Loading…</p> : null}</>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="me-auto text-2xl font-semibold">Team</h1>
        {!adding ? <button className={primary} onClick={() => setAdding(true)}>Add a team member</button> : null}
      </div>
      <p className="-mt-3 text-sm text-(--color-ink-muted)">The people who can sign in to this admin. A super admin can change everything; support can look and run a menu sync or re-check an order.</p>

      {notice ? <p role="status" className={`rounded-lg p-3 text-sm ${notice.tone === "ok" ? "bg-(--color-surface-2)" : "bg-amber-100 text-amber-950"}`}>{notice.text}</p> : null}
      <ErrorText message={error} />

      {adding ? (
        <form className="rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act("create", async () => {
              const out = await createTeamMember({ email: form.email.trim(), role: form.role, ...(form.fullName.trim() ? { fullName: form.fullName.trim() } : {}) });
              setNotice(invitationNotice(out.user.email, "invitation", out.invitation));
              setForm({ email: "", fullName: "", role: "SUPPORT" });
              setAdding(false);
            });
          }}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Email" hint="Use the person's real email address. It is checked, and made-up ones like @example.com or @anything.test are refused."><input required type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Name (optional)"><input className={input} maxLength={120} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label="Role">
              <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as TeamRole })}>
                <option value="SUPPORT">{ROLE_LABEL.SUPPORT}</option><option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>
              </select>
            </Field>
          </div>
          <p className="mt-3 text-sm text-(--color-ink-muted)">They get an email with a link to choose their own password. Opening that link also proves the address is theirs. Nobody, including you, ever sees a password.</p>
          <div className="mt-3 flex gap-3">
            <button type="submit" disabled={busy !== null} className={primary}>{busy === "create" ? "Sending…" : "Send invitation"}</button>
            <button type="button" className={secondary} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
        <table className="w-full text-sm">
          <thead className="bg-(--color-surface-2) text-(--color-ink-muted)"><tr>{["Person", "Role", "Status", "Last sign-in", ""].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-(--color-line)">
            {team.map((m) => {
              const me = m.id === myId;
              const locked = m.lockedUntil !== null && Date.parse(m.lockedUntil) > Date.now();
              return (
                <tr key={m.id} className={m.isActive ? "" : "opacity-60"}>
                  <td className="px-4 py-3"><div className="font-medium">{m.fullName ?? m.email}{me ? <span className="ms-2 rounded-full bg-(--color-surface-2) px-2 py-0.5 text-xs font-normal">you</span> : null}</div>{m.fullName ? <div className="text-(--color-ink-muted)">{m.email}</div> : null}</td>
                  <td className="px-4 py-3">
                    <select aria-label={`Role of ${m.email}`} className="h-9 rounded-lg border border-(--color-line) bg-(--color-surface) px-2 disabled:opacity-60" value={m.role} disabled={me || busy !== null}
                      title={me ? "Ask another super admin to change your own role" : undefined}
                      onChange={(e) => void act(m.id, async () => { await updateTeamMember(m.id, { role: e.target.value as TeamRole }); })}>
                      <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option><option value="SUPPORT">{ROLE_LABEL.SUPPORT}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">{!m.isActive ? "switched off" : m.invitation === "pending" ? "invited: waiting for them to choose a password" : m.invitation === "expired" ? "invitation expired: send it again" : locked ? "locked (too many wrong passwords)" : m.mustChangePassword ? "has not chosen a password yet" : "active"}</td>
                  <td className="px-4 py-3 text-(--color-ink-muted)">{when(m.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {!me ? (
                        m.invitation !== "none" ? (
                          <button className={secondary + " h-9"} disabled={busy !== null} onClick={() => void act(m.id, async () => { const r = await resendTeamInvitation(m.id); setNotice(invitationNotice(m.email, "invitation", r.invitation)); })}>Resend invitation</button>
                        ) : (
                          <button className={secondary + " h-9"} disabled={busy !== null} onClick={() => {
                            if (window.confirm(`Send ${m.email} a link to choose a new password? Their current password stops working at once and they are signed out everywhere.`)) {
                              void act(m.id, async () => { const r = await resetTeamPassword(m.id); setNotice(invitationNotice(m.email, "reset link", r.invitation)); });
                            }
                          }}>Send reset link</button>
                        )
                      ) : null}
                      {!me ? (
                        <button className={secondary + " h-9"} disabled={busy !== null} onClick={() => {
                          if (!m.isActive || window.confirm(`Switch off ${m.email}? They are signed out within seconds and cannot sign in until you switch them back on.`)) {
                            void act(m.id, async () => { await updateTeamMember(m.id, { isActive: !m.isActive }); });
                          }
                        }}>{m.isActive ? "Switch off" : "Switch on"}</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-label="Recent changes">
        <h2 className="mb-2 text-lg font-medium">Recent changes to the team</h2>
        {activity.length === 0 ? <p className="text-sm text-(--color-ink-muted)">Nothing recorded yet.</p> : (
          <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line) text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-4 px-4 py-2"><span className="w-44 shrink-0 text-(--color-ink-muted)">{when(a.at)}</span><span>{a.actor} · {readable(a.action)}{a.target ? ` · ${a.target}` : ""}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
