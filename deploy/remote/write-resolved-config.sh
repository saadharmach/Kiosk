#!/usr/bin/env bash
# Writes the deploy settings in effect on this PC (after any environment override) as a file the server reads.
#   remote/write-resolved-config.sh <file>      (called by install-server.sh and deploy.sh)
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config.sh"
{
  echo "# Written by write-resolved-config.sh on $(date '+%Y-%m-%d %H:%M'): the settings in effect on the PC that sent this."
  for v in KIOSK_DOMAIN BACKOFFICE_DOMAIN ADMIN_DOMAIN CERT_EMAIL ALERT_EMAIL API_PORT KIOSK_PORT; do
    printf '%s=%q\n' "$v" "${!v}"
  done
} > "$1"
