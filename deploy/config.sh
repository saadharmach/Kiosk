# Settings shared by the deploy scripts. Nothing secret lives here: secrets are in /etc/kiosk/kiosk.env on the
# server (see push-secrets.sh). Every value can be overridden from the environment, e.g. DEPLOY_HOST=… ./deploy.sh

# The server, as you would type it after `ssh`.
DEPLOY_HOST="${DEPLOY_HOST:-root@NEW_SERVER_IP}"

# The three sites. Each needs a DNS A record pointing to the server.
KIOSK_DOMAIN="${KIOSK_DOMAIN:-kiosk.pos-soft.ma}"
BACKOFFICE_DOMAIN="${BACKOFFICE_DOMAIN:-backoffice.pos-soft.ma}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.pos-soft.ma}"
# Let's Encrypt writes here when a certificate is about to expire and could not renew.
CERT_EMAIL="${CERT_EMAIL:-}"

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
