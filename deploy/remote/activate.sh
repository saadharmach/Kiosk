#!/usr/bin/env bash
# Runs on the server at the end of every deploy (deploy.sh calls it). Usage: activate.sh /opt/kiosk/releases/<name>
#   1. update the database (migrations)   2. switch `current` to the new release   3. restart
#   4. check it answers — and if it does not, switch back to the previous release and restart that.
set -euo pipefail
NEW="$(cd "$1" && pwd)"
# shellcheck source=../config.sh
. "$NEW/deploy/config.sh"
say() { printf '== %s\n' "$*"; }
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE is missing: run install-server.sh first."; exit 1; }
PREV="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"

# Readable by the services and nginx, writable only by root; Next's cache is the app's one writable folder.
chown -R root:root "$NEW" && chmod -R a+rX,go-w "$NEW"
install -d -o kiosk -g kiosk "$NEW/kiosk/apps/kiosk/.next/cache"

say "Database migrations"
PRISMA="$(find "$NEW/api/node_modules/.pnpm" -path '*/node_modules/prisma/build/index.js' -print -quit)"
( set -a; . "$ENV_FILE"; set +a; cd "$NEW/api" && /usr/local/bin/node "$PRISMA" migrate deploy --schema prisma/schema.prisma )

switch_to() { ln -sfn "$1" "$APP_ROOT/current.next" && mv -T "$APP_ROOT/current.next" "$APP_ROOT/current"; }
restart() { systemctl restart kiosk-api kiosk-web; systemctl reload-or-restart nginx; }
healthy() {
  for _ in $(seq 1 45); do
    api=$(curl -s -m 3 "http://127.0.0.1:$API_PORT/api/health" || true)
    web=$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$KIOSK_PORT/" || true)
    if [[ "$api" == *'"status":"ok"'* && "$web" =~ ^[234] ]] && [ -f "$APP_ROOT/current/backoffice/index.html" ] && [ -f "$APP_ROOT/current/admin/index.html" ]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

say "Switching to $(basename "$NEW")"
switch_to "$NEW"
restart
if healthy; then
  say "Live: $(basename "$NEW") ($(cat "$NEW/REVISION"))"
else
  echo "!! The new release did not answer in time. Last API log lines:"
  journalctl -u kiosk-api -n 15 --no-pager || true
  if [ -n "$PREV" ] && [ -d "$PREV" ] && [ "$PREV" != "$NEW" ]; then
    switch_to "$PREV"; restart
    if healthy; then echo "!! Rolled back to $(basename "$PREV"); it answers. (Database migrations are not undone.)"
    else echo "!! Rolled back to $(basename "$PREV"), but it does not answer either: check journalctl -u kiosk-api"; fi
  fi
  exit 1
fi

say "Cleaning up old releases (keeping $KEEP_RELEASES)"
cur="$(readlink -f "$APP_ROOT/current")"
ls -1dt "$APP_ROOT"/releases/*/ | sed 's:/$::' | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  [ "$old" = "$cur" ] || [ "$old" = "$PREV" ] || rm -rf "$old"
done
