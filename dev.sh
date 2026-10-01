#!/usr/bin/env bash
# Kiosk dev orchestrator.  Usage: ./dev.sh up | down | status | logs [api|kiosk|backoffice|admin]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$ROOT/.logs"
API_PORT=3005
KIOSK_PORT=3002
BACKOFFICE_PORT=3003
ADMIN_PORT=3004
mkdir -p "$LOGS"

alive() { curl -s -o /dev/null --max-time 2 "http://localhost:$1$2"; }

# Each service runs in its own session (setsid), so one kill of the group takes down the
# watcher, its wrapper shells and the app it spawned. The pid file holds that group id.
start_service() { # name port path, then the command
  local name="$1"; shift
  local port="$1"; shift
  local path="$1"; shift
  if alive "$port" "$path"; then echo "$name already up"; return; fi
  ( cd "$ROOT" || exit 1; setsid nohup "$@" >"$LOGS/$name.log" 2>&1 & echo $! >"$LOGS/$name.pid" )
}

port_pids() { lsof -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null; }

stop_all() {
  local f pid port
  for f in "$LOGS"/*.pid; do
    [ -f "$f" ] || continue
    pid="$(cat "$f")"
    kill -TERM -- "-$pid" 2>/dev/null
    rm -f "$f"
  done
  # Older runs (or a crashed script) can leave a watcher with no pid file. The API
  # watcher's process title is "nest.js start", not "nest start", which is what the
  # first version of this script looked for and missed.
  pkill -f "$ROOT/apps/api/.*nest(\.js)? start" 2>/dev/null
  pkill -f "$ROOT/apps/api/dist/main"           2>/dev/null
  pkill -f "$ROOT/apps/.*/next dev"             2>/dev/null
  sleep 1
  # Whatever still holds one of our ports is a leftover: stop it for good.
  for port in "$API_PORT" "$KIOSK_PORT" "$BACKOFFICE_PORT" "$ADMIN_PORT"; do
    for pid in $(port_pids "$port"); do kill -KILL "$pid" 2>/dev/null; done
  done
  sleep 1
}

start_api() {
  ( cd "$ROOT" && set -a && . ./.env && set +a && export PORT="$API_PORT" && start_service api "$API_PORT" /api/health pnpm --filter @kiosk/api run dev )
}
start_kiosk()      { start_service kiosk      "$KIOSK_PORT"      /  pnpm --filter @kiosk/kiosk-web run dev; }
start_backoffice() { start_service backoffice "$BACKOFFICE_PORT" /  pnpm --filter @kiosk/backoffice run dev; }
start_admin()      { start_service admin      "$ADMIN_PORT"      /  pnpm --filter @kiosk/admin run dev; }

wait_for() { # port path label
  for _ in $(seq 1 45); do
    if alive "$1" "$2"; then echo "  ready: $3"; return 0; fi
    sleep 1
  done
  echo "  FAILED: $3 — check $LOGS"; return 1
}

case "${1:-up}" in
  up)
    stop_all
    start_api
    start_kiosk
    start_backoffice
    start_admin
    echo "starting..."
    wait_for "$API_PORT"   "/api/health" "API   http://localhost:$API_PORT/api"
    wait_for "$KIOSK_PORT" "/"           "Kiosk http://localhost:$KIOSK_PORT/r/resto-a"
    wait_for "$BACKOFFICE_PORT" "/"      "Back office http://localhost:$BACKOFFICE_PORT"
    wait_for "$ADMIN_PORT" "/"           "Platform admin http://localhost:$ADMIN_PORT"
    ;;
  down)   stop_all; echo "stopped" ;;
  status)
    alive "$API_PORT"   "/api/health" && echo "API   up" || echo "API   down"
    alive "$KIOSK_PORT" "/"           && echo "Kiosk up" || echo "Kiosk down"
    alive "$BACKOFFICE_PORT" "/"      && echo "Back office up" || echo "Back office down"
    alive "$ADMIN_PORT" "/"           && echo "Platform admin up" || echo "Platform admin down"
    ;;
  logs)   tail -f "$LOGS/${2:-api}.log" ;;
  *)      echo "usage: dev.sh up|down|status|logs [api|kiosk|backoffice|admin]" ;;
esac