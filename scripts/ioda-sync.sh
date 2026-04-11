#!/bin/bash
# ─── IODA sync script ─────────────────────────────────────────────────────────
# Fetches CAIDA IODA data from your Mac (not blocked) and pushes to the droplet.
# Run every 5 min via cron:
#   */5 * * * * /Users/josemafernandez/vodafone-cm/scripts/ioda-sync.sh >> /tmp/ioda-sync.log 2>&1

DROPLET="https://api.chemafmp.dev"
API_KEY="${AUTOMATION_API_KEY:-}"   # set in env or hardcode below
IODA_BASE="https://api.ioda.caida.org/v2"
TIMEOUT=15
LOG_PREFIX="[ioda-sync $(date '+%H:%M:%S')]"

# Market ID → ASN mapping (matches RIPE_MARKETS in server)
declare -A MARKETS=(
  [es]=12430  [uk]=5378   [de]=3209  [it]=30722 [pt]=12353
  [nl]=33915  [ie]=15502  [gr]=3329  [tr]=15924 [int]=1273
)

NOW=$(date +%s)
FROM=$((NOW - 21600))   # 6h look-back

PAYLOAD="["
first=true

for ID in "${!MARKETS[@]}"; do
  ASN="${MARKETS[$ID]}"
  URL="${IODA_BASE}/signals/events?entityType=asn&entityCode=AS${ASN}&from=${FROM}&until=${NOW}&limit=50"

  DATA=$(curl -s --max-time $TIMEOUT "$URL" 2>/dev/null)

  if [ -z "$DATA" ]; then
    echo "$LOG_PREFIX WARN: no response for $ID (AS$ASN)" >&2
    sleep 1
    continue
  fi

  # Extract alerts array from response
  ALERTS=$(echo "$DATA" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    raw = d.get('data', [])
    alerts = raw if isinstance(raw, list) else raw.get('alerts', [])
    print(json.dumps(alerts))
except Exception as e:
    print('[]')
" 2>/dev/null)

  if [ "$first" = false ]; then PAYLOAD+=","; fi
  PAYLOAD+="{\"id\":\"${ID}\",\"asn\":${ASN},\"alerts\":${ALERTS}}"
  first=false

  echo "$LOG_PREFIX OK: $ID AS$ASN → $(echo "$ALERTS" | python3 -c "import sys,json; a=json.load(sys.stdin); print(len(a),' events')" 2>/dev/null)"
  sleep 1   # respect IODA rate limit (1 req/s)
done

PAYLOAD+="]"

# Push to droplet
RESPONSE=$(curl -s --max-time 10 -X POST "${DROPLET}/api/ioda-push" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "$PAYLOAD")

echo "$LOG_PREFIX pushed → $RESPONSE"
