#!/usr/bin/env bash
if curl -s -o /dev/null --max-time 2 http://localhost:3005/api/health; then
  echo "API already running on 3005 — nothing to do."
  exit 0
fi
cd ~/Kiosk && set -a && source .env && set +a && PORT=3005 exec pnpm --filter @kiosk/api run dev
