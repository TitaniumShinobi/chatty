#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-"http://localhost:5173"}
MISSING_ID=${MISSING_ID:-"gpt-katana-001-seed"}
AUTH_TOKEN=${AUTH_TOKEN:-""}

echo "== Avatar endpoint QC =="

echo "1) Unauthenticated request should be 401"
unauth_code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/ais/${MISSING_ID}/avatar" || true)
if [[ "$unauth_code" != "401" ]]; then
  echo "❌ Expected 401 unauthenticated, got ${unauth_code}" >&2
  exit 1
fi
echo "✅ 401 unauthenticated"

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "(skipped) Authenticated missing-avatar check: set AUTH_TOKEN to run" >&2
  exit 0
fi

echo "2) Authenticated missing avatar should be 404"
auth_code=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  "${BASE_URL}/api/ais/${MISSING_ID}/avatar" || true)
if [[ "$auth_code" != "404" ]]; then
  echo "❌ Expected 404 for missing avatar, got ${auth_code}" >&2
  exit 1
fi
echo "✅ 404 missing avatar (authenticated)"

echo "Done."
