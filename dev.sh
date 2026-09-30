#!/usr/bin/env bash
# Kiosk dev orchestrator.  Usage: ./dev.sh up | down | status | logs [api|kiosk|backoffice]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$ROOT/.logs"
API_PORT=3005
KIOSK_PORT=3002
BACKOFFICE_PORT=3003
mkdir -p "$LOGS"

alive() { curl -s -o /dev/null --max-time 2 "http://localhost:$1$2"; }

stop_all() {
  pkill -f "nest start"          2>/dev/null
  pkill -f "apps/api/dist/main"  2>/dev/null
  pkill -f "next dev"            2>/dev/null
  sleep 1
}

start_api() {
  if alive "$API_PORT" "/api/health"; then echo "API already up"; return; fi
  ( cd "$ROOT" && set -a && . ./.env && set +a && PORT="$API_PORT" nohup pnpm --filter @kiosk/api run dev >"$LOGS/api.log" 2>&1 & )
}

start_kiosk() {
  if alive "$KIOSK_PORT" "/"; then echo "Kiosk already up"; return; fi
  ( cd "$ROOT" && nohup pnpm --filter @kiosk/kiosk-web run dev >"$LOGS/kiosk.log" 2>&1 & )
}

start_backoffice() {
  if alive "$BACKOFFICE_PORT" "/"; then echo "Back office already up"; return; fi
  ( cd "$ROOT" && nohup pnpm --filter @kiosk/backoffice run dev >"$LOGS/backoffice.log" 2>&1 & )
}

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
    echo "starting..."
    wait_for "$API_PORT"   "/api/health" "API   http://localhost:$API_PORT/api"
    wait_for "$KIOSK_PORT" "/"           "Kiosk http://localhost:$KIOSK_PORT/r/resto-a"
    wait_for "$BACKOFFICE_PORT" "/"      "Back office http://localhost:$BACKOFFICE_PORT"
    ;;
  down)   stop_all; echo "stopped" ;;
  status)
    alive "$API_PORT"   "/api/health" && echo "API   up" || echo "API   down"
    alive "$KIOSK_PORT" "/"           && echo "Kiosk up" || echo "Kiosk down"
    alive "$BACKOFFICE_PORT" "/"      && echo "Back office up" || echo "Back office down"
    ;;
  logs)   tail -f "$LOGS/${2:-api}.log" ;;
  *)      echo "usage: dev.sh up|down|status|logs [api|kiosk|backoffice]" ;;
esac