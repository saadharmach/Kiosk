#!/usr/bin/env bash
# Sends the settings the server needs from your .env to the server's /etc/kiosk/kiosk.env, over SSH.
# Run on your PC:   ./deploy/push-secrets.sh        Values are never printed, only the names of the settings.
#
#   ENCRYPTION_KEY   must be the same as today: the unTill passwords in the copied database are locked with it.
#   SMTP_*, MAIL_FROM   Brevo. (Remember to allow the new server's IP in Brevo > Security > Authorized IPs.)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/config.sh"
ENV_LOCAL="${ENV_LOCAL:-$HERE/../.env}"
KEYS=(ENCRYPTION_KEY SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS MAIL_FROM)
[[ "$DEPLOY_HOST" != *NEW_SERVER_IP* ]] || { echo "Set DEPLOY_HOST in deploy/config.sh first."; exit 1; }
[ -f "$ENV_LOCAL" ] || { echo "No $ENV_LOCAL"; exit 1; }

lines=(); sent=(); missing=()
for k in "${KEYS[@]}"; do
  line="$(grep -E "^$k=" "$ENV_LOCAL" | tail -n 1 || true)"
  if [ -n "$line" ]; then lines+=("$line"); sent+=("$k"); else missing+=("$k"); fi
done
[ ${#missing[@]} -eq 0 ] || echo "Not in your .env (skipped): ${missing[*]}"
grep -q '^ENCRYPTION_KEY=' <<<"$(printf '%s\n' "${lines[@]}")" || { echo "ENCRYPTION_KEY is required."; exit 1; }

# Each line replaces the same setting on the server (or is added). Read from stdin, so nothing lands in a log.
printf '%s\n' "${lines[@]}" | ssh "$DEPLOY_HOST" "set -euo pipefail; f=$ENV_FILE; test -f \$f || { echo 'Run install-server.sh first.'; exit 1; }
  while IFS= read -r line; do k=\${line%%=*}; tmp=\$(mktemp); grep -v \"^\$k=\" \$f > \$tmp || true; printf '%s\n' \"\$line\" >> \$tmp; cat \$tmp > \$f; rm -f \$tmp; done
  if systemctl is-active -q kiosk-api; then systemctl restart kiosk-api; echo 'kiosk-api restarted with the new settings.'; fi"
echo "Sent: ${sent[*]}"
