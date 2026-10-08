# Settings shared by the deploy scripts. Nothing secret lives here: secrets are in /etc/kiosk/kiosk.env on the
# server (see push-secrets.sh). Every value can be overridden from the environment on your PC, e.g.
# DEPLOY_HOST=… ./deploy/deploy.sh — the values in effect are sent along to the server (config.resolved.sh).

# The server, as you would type it after `ssh`.
DEPLOY_HOST="${DEPLOY_HOST:-root@84.247.188.58}"

# The three sites. Each needs a DNS A record pointing to the server.
KIOSK_DOMAIN="${KIOSK_DOMAIN:-nexborn.amsatech.ma}"
BACKOFFICE_DOMAIN="${BACKOFFICE_DOMAIN:-backoffice.amsatech.ma}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.amsatech.ma}"
# Let's Encrypt writes here when a certificate is about to expire and could not renew.
CERT_EMAIL="${CERT_EMAIL:-saadhmk13@gmail.com}"
# Who gets the server's alert emails (a service down, disk nearly full, backup missing...). Default: CERT_EMAIL.
ALERT_EMAIL="${ALERT_EMAIL:-$CERT_EMAIL}"

# Internal ports: only nginx talks to these (they listen on 127.0.0.1).
API_PORT="${API_PORT:-3105}"
KIOSK_PORT="${KIOSK_PORT:-3102}"

# On the server.
APP_ROOT=/opt/kiosk          # releases/<stamp>, and `current` pointing at the live one
ENV_FILE=/etc/kiosk/kiosk.env
MEDIA_DIR=/var/lib/kiosk/media
BACKUP_DIR=/var/backups/kiosk
KEEP_RELEASES=5
PG_VERSION=17                # same major version as Supabase, so the one-off copy needs no conversion

# install-server.sh and deploy.sh write the values above, as they were on your PC, next to the copy they upload:
# the server cannot see your PC's environment, so this is how an override reaches it.
_resolved="$(dirname "${BASH_SOURCE[0]}")/config.resolved.sh"
[ -f "$_resolved" ] && . "$_resolved"
unset _resolved
