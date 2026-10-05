#!/usr/bin/env bash
# ONE-TIME, at launch: copies the Supabase database into the server's PostgreSQL. Run on your PC:
#   ./deploy/copy-database.sh
#
# Restaurants, users, menus, orders and unTill connections come across as they are. Old photo references are
# cleared (those files stay in Supabase; real photos are uploaded after launch), and everyone signs in again.
# It REPLACES the server's database, so it asks first. Supabase itself is only read, never changed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/config.sh"
ENV_LOCAL="${ENV_LOCAL:-$HERE/../.env}"
[[ "$DEPLOY_HOST" != *NEW_SERVER_IP* ]] || { echo "Set DEPLOY_HOST in deploy/config.sh first."; exit 1; }
# The session pooler (port 5432): pg_dump cannot work through the transaction pooler.
SRC="$(grep -E '^DIRECT_URL=' "$ENV_LOCAL" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[ -n "$SRC" ] || { echo "No DIRECT_URL in $ENV_LOCAL"; exit 1; }

read -r -p "This REPLACES the database on $DEPLOY_HOST with a copy of Supabase. Type 'copy' to go on: " answer
[ "$answer" = copy ] || { echo "Nothing done."; exit 1; }

# What runs on the server. It is sent as the command; the Supabase address travels separately on stdin, so it
# never appears in a command line or a log (sending both on stdin would let the script swallow the address).
read -r -d '' REMOTE <<'SCRIPT' || true
set -euo pipefail
read -r SRC
set -a; . "$ENV_FILE"; set +a
bin=/usr/lib/postgresql/$PG_VERSION/bin
dump=$(mktemp /tmp/supabase-XXXXXX.dump); trap 'rm -f "$dump"' EXIT

echo "== Reading Supabase (public schema only: Supabase's own schemas stay behind)"
"$bin/pg_dump" "$SRC" --schema=public --no-owner --no-privileges --format=custom --file="$dump"

if sudo -u postgres psql -tAc "select count(*) from pg_tables where schemaname='public'" kiosk | grep -qv '^0$'; then
  keep="$BACKUP_DIR/before-copy-$(date +%Y%m%d-%H%M%S).dump"
  sudo -u postgres "$bin/pg_dump" -Fc kiosk > "$keep"
  echo "== The server's database was not empty: saved first to $keep"
fi

echo "== Replacing the server's database"
systemctl stop kiosk-api 2>/dev/null || true
sudo -u postgres dropdb --if-exists kiosk
sudo -u postgres createdb -O kiosk kiosk
# The copy creates the public schema itself, so the empty one a new database comes with goes first.
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d kiosk -c 'drop schema public'
# As the kiosk user, so everything restored belongs to it. Any error stops the copy.
"$bin/pg_restore" --no-owner --no-privileges --exit-on-error --dbname="$DATABASE_URL" "$dump"

echo "== Clearing old photo references and sessions"
psql -q -v ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
update restaurants set "logoPath" = null, "welcomeImagePaths" = '{}';
update product_presentations set "imagePath" = null where "imagePath" is not null;
update category_presentations set "imagePath" = null where "imagePath" is not null;
delete from restaurant_sessions;
delete from platform_sessions;
SQL

echo "== What arrived"
psql -At -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "select 'restaurants: ' || count(*) from restaurants union all select 'restaurant users: ' || count(*) from restaurant_users union all select 'platform admins: ' || count(*) from platform_users union all select 'orders: ' || count(*) from orders union all select 'migrations applied: ' || count(*) from _prisma_migrations where finished_at is not null"

if [ -e "$APP_ROOT/current" ]; then systemctl start kiosk-api && echo "== kiosk-api started"; else echo "== kiosk-api starts with the first deploy"; fi
SCRIPT
printf '%s\n' "$SRC" | ssh "$DEPLOY_HOST" "PG_VERSION=$PG_VERSION ENV_FILE=$ENV_FILE BACKUP_DIR=$BACKUP_DIR APP_ROOT=$APP_ROOT bash -c $(printf '%q' "$REMOTE")"
