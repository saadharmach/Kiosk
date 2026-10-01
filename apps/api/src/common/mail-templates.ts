/** The emails the platform sends. Pure functions, so every wording can be tested. */

export type MailLocale = "fr" | "en";
export interface Rendered { subject: string; text: string; html: string }

export interface InviteArgs {
  locale: MailLocale;
  kind: "INVITE" | "RESET";
  /** Their name if known, otherwise the greeting is plain. */
  name?: string | null;
  /** What they are joining or signing in to: a restaurant's name, or the platform's own admin. */
  service: string;
  link: string;
  hours: number;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const WORDS = {
  en: {
    hello: (n?: string | null) => (n ? `Hello ${n},` : "Hello,"),
    inviteSubject: (s: string) => `You have been invited to ${s}`,
    inviteBody: (s: string) => `An account has been created for you at ${s}. Choose your password to start using it.`,
    resetSubject: (s: string) => `Choose a new password for ${s}`,
    resetBody: (s: string) => `A new password was requested for your ${s} account. Your old password no longer works. Choose a new one to sign in again.`,
    button: "Choose my password",
    expires: (h: number) => `This link works once and expires in ${h} hours.`,
    fallback: "If the button does not work, copy this address into your browser:",
    ignore: "If you were not expecting this email, you can ignore it: nothing happens until the link is opened.",
  },
  fr: {
    hello: (n?: string | null) => (n ? `Bonjour ${n},` : "Bonjour,"),
    inviteSubject: (s: string) => `Vous êtes invité(e) sur ${s}`,
    inviteBody: (s: string) => `Un compte a été créé pour vous sur ${s}. Choisissez votre mot de passe pour commencer.`,
    resetSubject: (s: string) => `Choisissez un nouveau mot de passe pour ${s}`,
    resetBody: (s: string) => `Un nouveau mot de passe a été demandé pour votre compte ${s}. Votre ancien mot de passe ne fonctionne plus. Choisissez-en un nouveau pour vous reconnecter.`,
    button: "Choisir mon mot de passe",
    expires: (h: number) => `Ce lien ne fonctionne qu'une fois et expire dans ${h} heures.`,
    fallback: "Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :",
    ignore: "Si vous n'attendiez pas ce message, vous pouvez l'ignorer : rien ne se passe tant que le lien n'est pas ouvert.",
  },
} as const;

export function inviteEmail(a: InviteArgs): Rendered {
  const w = WORDS[a.locale];
  const subject = a.kind === "INVITE" ? w.inviteSubject(a.service) : w.resetSubject(a.service);
  const body = a.kind === "INVITE" ? w.inviteBody(a.service) : w.resetBody(a.service);

  const text = [w.hello(a.name), "", body, "", a.link, "", w.expires(a.hours), w.ignore].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(w.hello(a.name))}</p>
<p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(a.link)}" style="display:inline-block;padding:12px 20px;background:#0a7d5a;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(w.button)}</a></p>
<p style="font-size:13px;color:#555">${escapeHtml(w.fallback)}<br>${escapeHtml(a.link)}</p>
<p style="font-size:13px;color:#555">${escapeHtml(w.expires(a.hours))} ${escapeHtml(w.ignore)}</p>
</body></html>`;
  return { subject, text, html };
}

/** French or English. Anything else (Arabic included, for now) gets French, the working language of the restaurants here. */
export const mailLocale = (restaurantLocale?: string | null): MailLocale => (restaurantLocale === "fr" ? "fr" : restaurantLocale === "en" ? "en" : "fr");
