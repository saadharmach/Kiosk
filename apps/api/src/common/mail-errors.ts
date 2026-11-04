/** Turns the cryptic errors mail servers give into a sentence a person can act on. Pure, so each case can be tested. */

interface MailError { code?: string; responseCode?: number; message?: string; command?: string }

export function explainMailError(e: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const err = (e ?? {}) as MailError;
  const code = err.code ?? "";
  const msg = err.message ?? String(e);
  const host = env.SMTP_HOST ?? "the mail server";
  const port = env.SMTP_PORT ?? "587";

  if (code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534) {
    return `${host} refused the user name or password (SMTP_USER / SMTP_PASS). With Gmail you need an "App password" (Google account → Security → 2-step verification → App passwords), not your normal password. With Resend the user name is "resend" and the password is your API key.`;
  }
  if (code === "ENOTFOUND" || code === "EDNS") {
    return `The name "${host}" does not exist. Check SMTP_HOST for a typo.`;
  }
  if (code === "ECONNREFUSED") {
    return `${host} is there but refused the connection on port ${port}. Check SMTP_PORT (587 or 465 are the usual ones).`;
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" && /timeout|timed out/i.test(msg) || code === "ECONNECTION" && /timeout|timed out/i.test(msg)) {
    return `No answer from ${host}:${port}. A firewall may block that port (many networks block port 25: use 587 or 465), or the host name is wrong.`;
  }
  if (/wrong version number|ssl routines|tls|certificate/i.test(msg)) {
    return `The secure-connection setting does not match the port. Port 465 needs SMTP_SECURE=true; port 587 needs SMTP_SECURE=false (it upgrades to TLS by itself).`;
  }
  if (err.responseCode === 550 || err.responseCode === 553 || err.responseCode === 554 || code === "EENVELOPE") {
    return `The server refused an address (${msg}). If it is the sender, use a MAIL_FROM on a domain you have verified with your provider; if it is the recipient, check the address.`;
  }
  if (code === "EMESSAGE" || err.responseCode === 552) {
    return `The server rejected the message itself: ${msg}`;
  }
  return `The email could not be sent: ${msg}`;
}
