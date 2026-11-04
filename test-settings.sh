#!/usr/bin/env bash
source ~/Kiosk/.testenv
H=(-H "Authorization: Bearer $RTOKEN" -H "Content-Type: application/json")
U="$API/api/restaurant/$SLUG/settings"

echo "=== 1 GET ==="
curl -s "$U" -H "Authorization: Bearer $RTOKEN" | jq .

echo "=== 2 reject: bad table part ==="
curl -s -X PATCH "$U" "${H[@]}" -d '{"orderTypes":[{"orderType":"EAT_IN","tablePart":"z"}]}' | jq -c .

echo "=== 3 reject: half a range ==="
curl -s -X PATCH "$U" "${H[@]}" -d '{"orderTypes":[{"orderType":"TAKE_AWAY","tableRangeFrom":700,"tableRangeTo":null}]}' | jq -c .

echo "=== 4 reject: invented sales area ==="
curl -s -X PATCH "$U" "${H[@]}" -d '{"orderTypes":[{"orderType":"EAT_IN","salesAreaId":"999999999"}]}' | jq -c .

echo "=== 5 accept: ask-for-table off ==="
curl -s -X PATCH "$U" "${H[@]}" -d '{"settings":{"askTableForEatIn":false}}' | jq '.settings.askTableForEatIn, .warnings'

echo "=== 6 restore: ask-for-table on ==="
curl -s -X PATCH "$U" "${H[@]}" -d '{"settings":{"askTableForEatIn":true}}' | jq '.settings.askTableForEatIn'