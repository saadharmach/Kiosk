# Putting the kiosk platform on its server

Everything runs on one small server: PostgreSQL, the API, the kiosk app, and nginx in front.
Photos live on the server's disk. Nothing is built on the server: your PC builds, the server only runs.

```
customers' kiosks ─┐                         ┌─ /api/…            → kiosk-api  (127.0.0.1:3105) → PostgreSQL
restaurants ───────┼─ https ─ nginx ─────────┼─ /api/media/files/ → files on disk (/var/lib/kiosk/media)
you (admin) ───────┘                         ├─ kiosk.…           → kiosk-web  (127.0.0.1:3102)
                                             └─ backoffice.…, admin.… → plain files (/opt/kiosk/current/…)
```

## What is where on the server

| | |
|---|---|
| `/opt/kiosk/releases/<date>-<commit>/` | each deployed version; `/opt/kiosk/current` points at the live one |
| `/etc/kiosk/kiosk.env` | settings and secrets (readable by root and the `kiosk` user only) |
| `/var/lib/kiosk/media/` | uploaded photos and logos |
| `/var/backups/kiosk/` | nightly database copies (last 14) |
| services | `kiosk-api`, `kiosk-web`, `kiosk-backup.timer` — `systemctl status kiosk-api` |
| logs | `journalctl -u kiosk-api -f`, `journalctl -u kiosk-web -f` |

## First time

All commands run **on your PC**, from the project folder. Each one is safe to run again.

1. **The server exists and your SSH key is on it.** Put its address in `deploy/config.sh`:
   `DEPLOY_HOST="root@<server ip>"`, and your email in `CERT_EMAIL` (for the https certificates). Commit that.
2. **Set it up** (packages, Node 24, PostgreSQL 17, user, folders, swap, services, nginx, backups, keys-only SSH):
   ```bash
   ./deploy/install-server.sh
   ```
3. **Send the settings** from your `.env` (the encryption key for the unTill passwords, and Brevo). Only the
   names are printed:
   ```bash
   ./deploy/push-secrets.sh
   ```
   In Brevo, add the server's IP under **Security → Authorized IPs**, or emails will be refused.
4. **Copy the database** from Supabase, once. Stop the dev services on your PC first (`./dev.sh down`) so
   nothing changes during the copy. Old photo references are cleared, sessions too (everyone signs in again).
   ```bash
   ./deploy/copy-database.sh
   ```
5. **Deploy**:
   ```bash
   ./deploy/deploy.sh
   ```
6. **DNS**: three A records — `kiosk`, `backoffice`, `admin` — pointing to the server's IP. Then **https**:
   ```bash
   ./deploy/enable-https.sh
   ```
7. **Check**: sign in at `https://admin.<domain>` and `https://backoffice.<domain>`, open a kiosk at
   `https://kiosk.<domain>/r/<restaurant>`, upload a photo, place a test order (it goes to unTill — tell the
   restaurant first), and set up the print helper with a code from the back office:
   `node src/cli.mjs setup https://backoffice.<domain> <code>`.

After the move the PC's dev services must not use the server's database, and the server must not use
Supabase's: each has its own, so orders and menu syncs are never done twice.

## Every update afterwards

Commit, then:
```bash
./deploy/deploy.sh
```
It builds the committed code in a clean copy (never your working folder), uploads only what changed, updates
the database, switches over, and checks the new version answers. If it does not, the previous version is put
back by itself (database changes are not undone, so keep migrations additive).

## Alerts by email

The server emails `ALERT_EMAIL` (set in `deploy/config.sh`; by default the same as `CERT_EMAIL`) through Brevo when:

| | checked |
|---|---|
| the API or the kiosk app does not answer, or the database is unreachable | every 5 minutes |
| the API or the kiosk app keeps crashing (3+ restarts between two checks) | every 5 minutes |
| the disk is 85% full or more | every 5 minutes |
| an https certificate ends in less than 14 days (renewal keeps failing) | every 5 minutes |
| no database backup in the last 26 hours | every 5 minutes |
| the nightly backup fails | at once |

A problem is mailed once it has been seen twice in a row (so a restart or a deploy never mails anyone), again every
6 hours while it lasts, and a "Resolved" mail follows when it is gone. Remember to allow the server's IP in Brevo, or
the alerts cannot leave either. To see what the watchdog does: `journalctl -t kiosk-alert` and
`systemctl list-timers kiosk-watch`. To try the mail: `kiosk-alert "Test" "Hello"` on the server.

## Good to know

- The nginx site files (`/etc/nginx/sites-available/kiosk-*.conf`) are written only the first time, because
  certbot adds https to them; running the setup again does not overwrite them. The shared parts
  (`/etc/nginx/snippets/kiosk-*.conf`) are refreshed every time.
- Any other name, or the server's bare IP address, gets no site at all.
- Memory measured in a rehearsal: API ~110 MB, kiosk app ~50 MB, PostgreSQL ~105 MB, nginx ~17 MB.

## When something is wrong

| What you see | Look at |
|---|---|
| A site shows "502 Bad Gateway" | `systemctl status kiosk-api kiosk-web` and `journalctl -u kiosk-api -n 50` |
| Deploy says "rolled back" | the log lines it printed; fix, commit, deploy again |
| Emails do not arrive | Brevo's Authorized IPs; `journalctl -u kiosk-api \| grep -i mail` |
| Menu sync or orders to unTill fail | unTill may only accept known IP addresses: give them the server's IP |
| Restore last night's database | `sudo -u postgres pg_restore --clean --if-exists -d kiosk /var/backups/kiosk/<file>.dump` (stop `kiosk-api` first) |
| Go back to the previous version | `ls -t /opt/kiosk/releases`, then `bash /opt/kiosk/releases/<previous>/deploy/remote/activate.sh /opt/kiosk/releases/<previous>` |
