# Setting up email

The platform sends two kinds of email: **invitations** (a new account) and **password reset links**. Until you set up a mail
account, a development machine only writes those emails to the API log, and a production server refuses to send them.

Any provider that offers **SMTP** works. You need five values in `.env`:

```
SMTP_HOST=...        # the provider's SMTP server
SMTP_PORT=587        # 587 normally; 465 if your provider says "SSL/TLS"
SMTP_SECURE=false    # true only with port 465
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Kiosk Platform <no-reply@yourdomain.com>"
ADMIN_APP_URL=https://admin.yourdomain.com        # where the links in the emails lead
BACKOFFICE_APP_URL=https://office.yourdomain.com
```

Then check it works. This sends one real message and tells you, in plain words, what went wrong if it fails:

```
pnpm --filter @kiosk/api mail:test you@example.com
```

## Quick option for trying it today: Gmail
1. Google account → Security → turn on 2-step verification.
2. Security → App passwords → create one called "Kiosk". Copy the 16 characters.
3. `.env`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=your@gmail.com`, `SMTP_PASS=<the app password>`,
   `MAIL_FROM="Kiosk Platform <your@gmail.com>"`.
Gmail is fine for testing, not for real use: it limits how many messages you can send, and mail comes "from" your own address.

## For real use: a transactional provider
Resend, Postmark, Brevo (and others) are built for this. You verify your own domain with them (a few DNS records), which makes
the mail arrive in inboxes instead of spam. They all give you SMTP details:
- **Resend**: host `smtp.resend.com`, port 465 (`SMTP_SECURE=true`), user `resend`, password = your API key.
- **Postmark**: host `smtp.postmarkapp.com`, port 587, user and password = your server token.
- **Brevo**: host `smtp-relay.brevo.com`, port 587, user = your login, password = an SMTP key.
`MAIL_FROM` must be an address on the domain you verified.

## Good to know
- The links in the emails are single-use and expire (72 hours for an invitation, 24 for a reset).
- If an email cannot be sent, the account is still created: the admin screen says so and offers "Resend invitation".
- Restart the API after changing `.env`.
