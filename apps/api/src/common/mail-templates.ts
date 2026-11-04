/** The emails the platform sends. Pure functions, so every wording can be tested. */

export type MailLocale = "fr" | "en";
export interface Rendered { subject: string; text: string; html: string }

export interface InviteArgs {
  locale: MailLocale;
  /** INVITE: a new account. RESET: the platform reset it. FORGOT: the person asked for a reset themselves. */
  kind: "INVITE" | "RESET" | "FORGOT";
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
    forgotSubject: (s: string) => `Reset your password for ${s}`,
    forgotBody: (s: string) => `A password reset was requested for your account on ${s}. Your current password keeps working until you choose a new one.`,
    forgotIgnore: "If you did not ask for this, ignore this email: your password does not change unless the link is used.",
    resetBody: (s: string) => `A new password was requested for your account on ${s}. Your old password no longer works. Choose a new one to sign in again.`,
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
    forgotSubject: (s: string) => `Réinitialisez votre mot de passe pour ${s}`,
    forgotBody: (s: string) => `Une réinitialisation du mot de passe a été demandée pour votre compte ${s}. Votre mot de passe actuel continue de fonctionner tant que vous n'en avez pas choisi un nouveau.`,
    forgotIgnore: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe ne change que si le lien est utilisé.",
    resetBody: (s: string) => `Un nouveau mot de passe a été demandé pour votre compte ${s}. Votre ancien mot de passe ne fonctionne plus. Choisissez-en un nouveau pour vous reconnecter.`,
    button: "Choisir mon mot de passe",
    expires: (h: number) => `Ce lien ne fonctionne qu'une fois et expire dans ${h} heures.`,
    fallback: "Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :",
    ignore: "Si vous n'attendiez pas ce message, vous pouvez l'ignorer : rien ne se passe tant que le lien n'est pas ouvert.",
  },
} as const;

export function inviteEmail(a: InviteArgs): Rendered {
  const w = WORDS[a.locale];
  const subject = a.kind === "INVITE" ? w.inviteSubject(a.service) : a.kind === "FORGOT" ? w.forgotSubject(a.service) : w.resetSubject(a.service);
  const body = a.kind === "INVITE" ? w.inviteBody(a.service) : a.kind === "FORGOT" ? w.forgotBody(a.service) : w.resetBody(a.service);
  const ignore = a.kind === "FORGOT" ? w.forgotIgnore : w.ignore;

  const text = [w.hello(a.name), "", body, "", a.link, "", w.expires(a.hours), ignore].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(w.hello(a.name))}</p>
<p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(a.link)}" style="display:inline-block;padding:12px 20px;background:#0a7d5a;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(w.button)}</a></p>
<p style="font-size:13px;color:#555">${escapeHtml(w.fallback)}<br>${escapeHtml(a.link)}</p>
<p style="font-size:13px;color:#555">${escapeHtml(w.expires(a.hours))} ${escapeHtml(ignore)}</p>
</body></html>`;
  return { subject, text, html };
}

/** French or English. Anything else (Arabic included, for now) gets French, the working language of the restaurants here. */
export const mailLocale = (restaurantLocale?: string | null): MailLocale => (restaurantLocale === "fr" ? "fr" : restaurantLocale === "en" ? "en" : "fr");
