#!/usr/bin/env bash
# QA script for VVAULT_CANONICAL: hit endpoints with flag ON and OFF.
# Usage: ./scripts/qa-vvault-canonical.sh [base_url]
# Default base_url: http://localhost:5050
# Start server separately, e.g.:
#   VVAULT_CANONICAL=true npm run server   (then run this script)
#   VVAULT_CANONICAL=false npm run server (then run again)

set -e
BASE="${1:-http://localhost:5050}"
GPT_ID="${2:-test-001}"

echo "=== VVAULT_CANONICAL QA ==="
echo "Base URL: $BASE"
echo ""

# (2) restore-from-supabase: with canonical ON -> 501; OFF -> 401/404/403
echo "[2] POST /api/gpts/$GPT_ID/restore-from-supabase"
STATUS=$(curl -s -o /tmp/qa_restore.json -w "%{http_code}" -X POST "$BASE/api/gpts/$GPT_ID/restore-from-supabase" -H "Content-Type: application/json")
echo "    Status: $STATUS"
if [ "$STATUS" = "501" ]; then
  echo "    PASS (501 in canonical mode)"
  grep -q "canonical" /tmp/qa_restore.json && echo "    Body mentions canonical: OK"
else
  echo "    (Expected 501 when VVAULT_CANONICAL=true; 401/404 when false)"
fi
echo ""

# (3) Stubs: GET actions -> 200 + actions:[]; GET context -> 200 + context:null (no auth on these in code - but route may require auth)
echo "[3a] GET /api/gpts/$GPT_ID/actions"
STATUS=$(curl -s -o /tmp/qa_actions.json -w "%{http_code}" "$BASE/api/gpts/$GPT_ID/actions")
echo "    Status: $STATUS"
if [ "$STATUS" = "200" ]; then
  echo "    PASS (stub)"
  grep -q '"actions"' /tmp/qa_actions.json && echo "    Has actions key: OK"
elif [ "$STATUS" = "401" ]; then
  echo "    (401 - auth required; stub runs after auth in canonical mode)"
fi
echo ""

echo "[3b] GET /api/gpts/$GPT_ID/context"
STATUS=$(curl -s -o /tmp/qa_context.json -w "%{http_code}" "$BASE/api/gpts/$GPT_ID/context")
echo "    Status: $STATUS"
if [ "$STATUS" = "200" ]; then
  echo "    PASS (stub)"
  grep -q '"context"' /tmp/qa_context.json && echo "    Has context key: OK"
elif [ "$STATUS" = "401" ]; then
  echo "    (401 - auth required)"
fi
echo ""

# POST actions / avatar / PUT context: 501 before auth in canonical
echo "[3c] POST /api/gpts/$GPT_ID/actions"
STATUS=$(curl -s -o /tmp/qa_post_actions.json -w "%{http_code}" -X POST "$BASE/api/gpts/$GPT_ID/actions" -H "Content-Type: application/json" -d '{}')
echo "    Status: $STATUS"
[ "$STATUS" = "501" ] && echo "    PASS (501 in canonical)" || echo "    (Expected 501 when canonical)"
echo ""

echo "[3d] POST /api/gpts/$GPT_ID/avatar"
STATUS=$(curl -s -o /tmp/qa_avatar.json -w "%{http_code}" -X POST "$BASE/api/gpts/$GPT_ID/avatar" -H "Content-Type: application/json" -d '{}')
echo "    Status: $STATUS"
[ "$STATUS" = "501" ] && echo "    PASS (501 in canonical)" || echo "    (Expected 501 when canonical)"
echo ""

echo "[3e] PUT /api/gpts/$GPT_ID/context"
STATUS=$(curl -s -o /tmp/qa_put_context.json -w "%{http_code}" -X PUT "$BASE/api/gpts/$GPT_ID/context" -H "Content-Type: application/json" -d '{"context":""}')
echo "    Status: $STATUS"
[ "$STATUS" = "501" ] && echo "    PASS (501 in canonical)" || echo "    (Expected 501 when canonical)"
echo ""

echo "=== QA script done. Run with VVAULT_CANONICAL=true then false and compare. ==="
