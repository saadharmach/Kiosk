"use client";

import { useCallback, useEffect, useState } from "react";
import { createUser, invitationNotice, listUsers, resendInvitation, resetPassword, updateUser, type RestaurantUser, type UserRole } from "@/lib/platform";
import { ErrorText, Field, input, primary, secondary, when } from "./ui";

const ROLES: UserRole[] = ["OWNER", "MANAGER", "STAFF"];

export default function UsersTab({ id, canWrite, onChanged }: { id: string; canWrite: boolean; onChanged: () => void }) {
  const [users, setUsers] = useState<RestaurantUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ email: string; fullName: string; role: UserRole }>({ email: "", fullName: "", role: "MANAGER" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { listUsers(id).then(setUsers).catch((e) => setError((e as Error).message)); }, [id]);
  useEffect(load, [load]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setNotice(null);
    try { await fn(); load(); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  if (!users) return <><ErrorText message={error} />{!error ? <p className="text-(--color-ink-muted)">Loading…</p> : null}</>;

  return (
    <div className="flex flex-col gap-5">
      {notice ? <p role="status" className={`rounded-lg p-3 text-sm ${notice.tone === "ok" ? "bg-(--color-surface-2)" : "bg-amber-100 text-amber-950"}`}>{notice.text}</p> : null}
      <ErrorText message={error} />

      <div className="flex items-center gap-3">
        <h2 className="me-auto text-lg font-medium">People who can sign in to this restaurant&apos;s back office</h2>
        {canWrite && !adding ? <button className={primary} onClick={() => setAdding(true)}>Add a user</button> : null}
      </div>

      {adding ? (
        <form
          className="rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act("create", async () => {
              const out = await createUser(id, { email: form.email.trim(), role: form.role, ...(form.fullName.trim() ? { fullName: form.fullName.trim() } : {}) });
              setNotice(invitationNotice(out.user.email, "invitation", out.invitation));
              setForm({ email: "", fullName: "", role: "MANAGER" });
              setAdding(false);
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Email" hint="Use the person's real email address. It is checked, and made-up ones like @example.com or @anything.test are refused."><input required type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Name (optional)"><input className={input} maxLength={120} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label="Role">
              <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
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

      {users.length === 0 ? <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-8 text-center text-(--color-ink-muted)">Nobody can sign in yet. {canWrite ? "Add the owner first." : ""}</p> : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
          <table className="w-full text-sm">
            <thead className="bg-(--color-surface-2) text-(--color-ink-muted)"><tr>{["Person", "Role", "Status", "Last sign-in", ""].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-(--color-line)">
              {users.map((u) => {
                const locked = u.lockedUntil !== null && Date.parse(u.lockedUntil) > Date.now();
                return (
                  <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3"><div className="font-medium">{u.fullName ?? u.email}</div>{u.fullName ? <div className="text-(--color-ink-muted)">{u.email}</div> : null}</td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <select aria-label={`Role of ${u.email}`} className="h-9 rounded-lg border border-(--color-line) bg-(--color-surface) px-2" value={u.role} disabled={busy !== null}
                          onChange={(e) => void act(u.id, async () => { await updateUser(id, u.id, { role: e.target.value as UserRole }); })}>
                          {ROLES.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                        </select>
                      ) : u.role.toLowerCase()}
                    </td>
                    <td className="px-4 py-3">{!u.isActive ? "switched off" : u.invitation === "pending" ? "invited: waiting for them to choose a password" : u.invitation === "expired" ? "invitation expired: send it again" : locked ? "locked (too many wrong passwords)" : "active"}</td>
                    <td className="px-4 py-3 text-(--color-ink-muted)">{when(u.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <div className="flex justify-end gap-2">
                          {u.invitation !== "none" ? (
                            <button className={secondary + " h-9"} disabled={busy !== null} onClick={() => void act(u.id, async () => { const r = await resendInvitation(id, u.id); setNotice(invitationNotice(u.email, "invitation", r.invitation)); })}>Resend invitation</button>
                          ) : (
                            <button className={secondary + " h-9"} disabled={busy !== null} onClick={() => {
                              if (window.confirm(`Send ${u.email} a link to choose a new password? Their current password stops working at once and they are signed out everywhere.`)) {
                                void act(u.id, async () => { const r = await resetPassword(id, u.id); setNotice(invitationNotice(u.email, "reset link", r.invitation)); });
                              }
                            }}>Send reset link</button>
                          )}
                          <button className={secondary + " h-9"} disabled={busy !== null} onClick={() => {
                            const off = u.isActive;
                            if (!off || window.confirm(`Switch off ${u.email}? They are signed out and cannot sign in until you switch them back on.`)) {
                              void act(u.id, async () => { await updateUser(id, u.id, { isActive: !off }); });
                            }
                          }}>{u.isActive ? "Switch off" : "Switch on"}</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
