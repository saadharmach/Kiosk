#!/usr/bin/env bash
# Puts the committed code live. Run on your PC:   ./deploy/deploy.sh
#
# Builds a clean copy of HEAD (never your working folder), uploads only what changed since the last release,
# then the server migrates the database, switches over, checks it answers, and rolls back by itself if not.
set -euo pipefail
ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
# shellcheck source=config.sh
. "$ROOT/deploy/config.sh"
die() { echo "!! $*" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }

[[ "$DEPLOY_HOST" != *NEW_SERVER_IP* ]] || die "Set DEPLOY_HOST in deploy/config.sh (root@<server ip>) first."
git -C "$ROOT" diff --quiet && git -C "$ROOT" diff --cached --quiet || die "Commit your changes first: only committed code is deployed."
REV="$(git -C "$ROOT" rev-parse --short HEAD)"
NAME="$(date +%Y%m%d-%H%M%S)-$REV"
WORK="$(mktemp -d)"
cleanup() { git -C "$ROOT" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

say "Building $REV in a clean copy"
git -C "$ROOT" worktree add --quiet --detach "$WORK/src" HEAD
cd "$WORK/src"
pnpm install --frozen-lockfile --prefer-offline --silent
(cd packages/db && pnpm exec prisma generate >/dev/null && pnpm --silent build)
(cd packages/tpapi && pnpm --silent build)
(cd apps/api && pnpm --silent build)
(cd apps/kiosk && NEXT_OUTPUT=standalone API_ORIGIN="http://127.0.0.1:$API_PORT" pnpm --silent build)
(cd apps/backoffice && NEXT_OUTPUT=export pnpm --silent build)
(cd apps/admin && NEXT_OUTPUT=export pnpm --silent build)

say "Packing the release"
OUT="$WORK/release/$NAME"
mkdir -p "$OUT"
# The API with only its production packages, the database schema and migrations, and a generated client.
pnpm --filter @kiosk/api deploy --prod --legacy "$OUT/api" >/dev/null
rm -rf "$OUT/api/src" "$OUT/api/test" "$OUT"/api/tsconfig*.json "$OUT/api/nest-cli.json"
mkdir -p "$OUT/api/prisma" && cp -r packages/db/prisma/schema.prisma packages/db/prisma/migrations "$OUT/api/prisma/"
PRISMA="$(find "$OUT/api/node_modules/.pnpm" -path '*/node_modules/prisma/build/index.js' -print -quit)"
[ -n "$PRISMA" ] || die "The prisma tool is missing from the API bundle."
node "$PRISMA" generate --schema "$OUT/api/prisma/schema.prisma" >/dev/null
# The kiosk as a self-contained server, plus its static files.
cp -r apps/kiosk/.next/standalone "$OUT/kiosk"
mkdir -p "$OUT/kiosk/apps/kiosk/.next" && cp -r apps/kiosk/.next/static "$OUT/kiosk/apps/kiosk/.next/"
[ -d apps/kiosk/public ] && cp -r apps/kiosk/public "$OUT/kiosk/apps/kiosk/"
# Back office and admin: plain files.
cp -r apps/backoffice/out "$OUT/backoffice"
cp -r apps/admin/out "$OUT/admin"
mkdir -p "$OUT/deploy" && cp -r deploy/config.sh deploy/remote deploy/systemd deploy/nginx "$OUT/deploy/"
echo "$REV $(git log -1 --format=%s | cut -c1-80)" > "$OUT/REVISION"
du -sh "$OUT" | awk '{print "Release size: " $1}'

say "Uploading to $DEPLOY_HOST"
ssh "$DEPLOY_HOST" "test -d $APP_ROOT/releases" || die "The server is not set up yet: run deploy/install-server.sh first."
# Files that did not change are hard-linked to the live release instead of being sent again. Every build gives
# files new dates, so they are compared by content (--checksum, dates not kept), and they arrive with the owner
# and permissions the server gives them anyway: otherwise no file would ever count as unchanged.
rsync -rlpogDz --checksum --delete --chown=root:root --chmod=a+rX,go-w --stats \
  --link-dest="$APP_ROOT/current/" "$OUT/" "$DEPLOY_HOST:$APP_ROOT/releases/$NAME/" \
  | awk '/^Total transferred file size|^Number of regular files transferred/'


say "Switching over on the server"
ssh "$DEPLOY_HOST" "bash $APP_ROOT/releases/$NAME/deploy/remote/activate.sh $APP_ROOT/releases/$NAME"
say "Done: https://$KIOSK_DOMAIN  https://$BACKOFFICE_DOMAIN  https://$ADMIN_DOMAIN"
