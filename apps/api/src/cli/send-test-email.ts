/** Usage: pnpm --filter @kiosk/api mail:test <your email address>
 *  Sends one test message with the mail settings in .env, and says in plain words what happened. */
import { explainMailError } from "../common/mail-errors.js";
import { MailerService } from "../common/mailer.service.js";

const to = process.argv[2];
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error("Usage: pnpm --filter @kiosk/api mail:test you@example.com");
  process.exit(1);
}

const mailer = new MailerService();
console.log(`Mail mode: ${mailer.mode}${mailer.mode === "smtp" ? `  (server ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}, from ${mailer.from})` : ""}`);

if (mailer.mode === "log") {
  console.log("\nSMTP_HOST is not set, so nothing is really sent: the message would only be written to the API log.");
  console.log("Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env (see docs/email-setup.md), then run this again.");
  process.exit(2);
}
if (mailer.mode === "unconfigured") {
  console.error("\nThis is a production environment with no SMTP_HOST: see docs/email-setup.md.");
  process.exit(2);
}

try {
  await mailer.send({
    to,
    subject: "Test email from your Kiosk platform",
    text: "If you can read this, your Kiosk platform can send email.\n\nInvitations and password resets will reach people the same way.",
    html: "<p>If you can read this, your Kiosk platform can send email.</p><p>Invitations and password resets will reach people the same way.</p>",
  });
  console.log(`\n✅ Sent to ${to}. Check the inbox (and the spam folder if it is not there within a minute).`);
} catch (e) {
  console.error(`\n❌ ${explainMailError(e)}`);
  process.exit(1);
}
