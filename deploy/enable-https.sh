#!/usr/bin/env bash
# Gets free Let's Encrypt certificates for the three sites and switches them to https (with http redirecting).
# Run on your PC once the three DNS records point at the server:   ./deploy/enable-https.sh
# Certificates renew by themselves (certbot's timer on the server).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/config.sh"
[ -n "$CERT_EMAIL" ] || { echo "Set CERT_EMAIL in deploy/config.sh (Let's Encrypt writes there if renewal ever fails)."; exit 1; }
ip="$(ssh "$DEPLOY_HOST" 'curl -4 -s -m 10 https://api.ipify.org')"
for d in "$KIOSK_DOMAIN" "$BACKOFFICE_DOMAIN" "$ADMIN_DOMAIN"; do
  got="$(getent ahostsv4 "$d" | awk '{print $1}' | sort -u | tr '\n' ' ')"
  [[ " $got" == *" $ip "* ]] || { echo "$d points to '${got:-nothing}', not to the server ($ip). Fix the DNS record and wait a few minutes."; exit 1; }
done
ssh "$DEPLOY_HOST" "certbot --nginx --non-interactive --agree-tos --redirect -m '$CERT_EMAIL' \
  -d '$KIOSK_DOMAIN' -d '$BACKOFFICE_DOMAIN' -d '$ADMIN_DOMAIN' && nginx -t && systemctl reload nginx"
for d in "$KIOSK_DOMAIN" "$BACKOFFICE_DOMAIN" "$ADMIN_DOMAIN"; do
  echo "https://$d -> $(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$d/")"
done
