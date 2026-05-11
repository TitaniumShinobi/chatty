#!/usr/bin/env bash
# QC: Avatar endpoint error handling.
# Usage:
#   ./scripts/qa-avatar-endpoints.sh [base_url]
#   TOKEN=<jwt> ./scripts/qa-avatar-endpoints.sh [base_url]
# With TOKEN: expects 404 for missing-avatar IDs (never 500). Without: expects 401.
set -e
BASE="${1:-http://localhost:5050}"
# Construct IDs that typically have no avatar (adjust if your DB differs)
AIS_ID="${AIS_AVATAR_ID:-ai-3555948a-d33e-4eb9-a797-ed0d12da94fc}"
GPT_ID="${GPT_AVATAR_ID:-nova-001}"

echo "=== Avatar API Error Handling QC ==="
echo "Base: $BASE"
echo ""

run() {
  local name="$1"
  local url="$2"
  local auth="$3"
  local expect="$4"
  local code
  if [ -n "$auth" ]; then
    code=$(curl -s -o /tmp/avatar_qc_body.txt -w "%{http_code}" -H "Cookie: sid=$auth" "$url")
  else
    code=$(curl -s -o /tmp/avatar_qc_body.txt -w "%{http_code}" "$url")
  fi
  echo -n "$name: HTTP $code"
  if [ "$code" = "$expect" ]; then
    echo " (PASS)"
  else
    echo " (expected $expect)"
    [ -s /tmp/avatar_qc_body.txt ] && echo "  body: $(head -c 200 /tmp/avatar_qc_body.txt)"
  fi
  if [ "$code" = "500" ]; then
    echo "  >>> 500 detected - check server logs for construct ID and user info"
  fi
  return 0
}

echo "[Unauthenticated]"
run "GET /api/ais/$AIS_ID/avatar" "$BASE/api/ais/$AIS_ID/avatar" "" "401"
run "GET /api/gpts/$GPT_ID/avatar" "$BASE/api/gpts/$GPT_ID/avatar" "" "401"
echo ""

if [ -n "$TOKEN" ]; then
  echo "[Authenticated - expect 404 for missing avatar]"
  run "GET /api/ais/$AIS_ID/avatar" "$BASE/api/ais/$AIS_ID/avatar" "$TOKEN" "404"
  run "GET /api/gpts/$GPT_ID/avatar" "$BASE/api/gpts/$GPT_ID/avatar" "$TOKEN" "404"
  echo "Check server logs for: aiId/constructId/userId (AIS) or gptId/user (GPT) and status 404."
else
  echo "[Authenticated] Skipped (set TOKEN= jwt to run). Expect 404 for missing avatar, never 500."
fi
echo "=== Done ==="
