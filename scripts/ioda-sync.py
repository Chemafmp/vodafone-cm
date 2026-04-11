#!/usr/bin/env python3
"""
IODA sync — fetches CAIDA IODA data from Mac (unblocked IP) and pushes to droplet.
Run every 5 min via cron:
  */5 * * * * /usr/bin/python3 /Users/josemafernandez/vodafone-cm/scripts/ioda-sync.py >> /tmp/ioda-sync.log 2>&1
"""

import json, os, sys, time, urllib.request, urllib.error
from datetime import datetime

DROPLET  = "https://api.chemafmp.dev"
API_KEY  = os.environ.get("AUTOMATION_API_KEY", "")
IODA_BASE = "https://api.ioda.caida.org/v2"
TIMEOUT  = 15
TAG      = f"[ioda-sync {datetime.now().strftime('%H:%M:%S')}]"

MARKETS = [
    ("es",  12430), ("uk",   5378), ("de",  3209), ("it", 30722),
    ("pt", 12353),  ("nl",  33915), ("ie", 15502), ("gr",  3329),
    ("tr", 15924),  ("int",  1273),
]

now  = int(time.time())
frm  = now - 6 * 3600   # 6h look-back
payload = []

for market_id, asn in MARKETS:
    url = (f"{IODA_BASE}/signals/events"
           f"?entityType=asn&entityCode=AS{asn}&from={frm}&until={now}&limit=50")
    try:
        req  = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data   = json.loads(resp.read())
            raw    = data.get("data", [])
            alerts = raw if isinstance(raw, list) else raw.get("alerts", [])
            payload.append({"id": market_id, "asn": asn, "alerts": alerts})
            print(f"{TAG} OK: {market_id} AS{asn} → {len(alerts)} events")
    except Exception as e:
        print(f"{TAG} WARN: {market_id} AS{asn} → {e}", file=sys.stderr)
        payload.append({"id": market_id, "asn": asn, "alerts": []})

    time.sleep(1)   # respect IODA rate limit

# Push to droplet
body = json.dumps(payload).encode()
req  = urllib.request.Request(
    f"{DROPLET}/api/ioda-push",
    data=body,
    headers={"Content-Type": "application/json", "x-api-key": API_KEY},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read())
        print(f"{TAG} pushed → {result}")
except Exception as e:
    print(f"{TAG} ERROR pushing: {e}", file=sys.stderr)
