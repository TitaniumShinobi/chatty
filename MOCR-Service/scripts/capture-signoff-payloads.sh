#!/bin/bash
# Capture POST and final GET payloads for production sign-off.
# Usage: ./scripts/capture-signoff-payloads.sh <base_url> <video_path>
# Outputs JSON blocks suitable for paste into production-readiness review.

BASE_URL="${1:-http://localhost:3001}"
VIDEO="${2:?Usage: $0 <base_url> <video_path>}"

echo "=== POST /jobs response (paste below line) ==="
POST=$(curl -s -X POST "$BASE_URL/jobs" -F "video=@$VIDEO;type=video/mp4")
echo "$POST" | jq '.' 2>/dev/null || echo "$POST"
JOB_ID=$(echo "$POST" | jq -r '.job.id // empty')
[ -z "$JOB_ID" ] && JOB_ID=$(echo "$POST" | grep -o '"id":"mocr_[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
  echo "No job id; POST may have failed."
  exit 1
fi

echo ""
echo "=== Polling GET /jobs/$JOB_ID (waiting for terminal state) ==="
for i in {1..90}; do
  GET=$(curl -s "$BASE_URL/jobs/$JOB_ID")
  STATUS=$(echo "$GET" | jq -r '.job.status // empty')
  echo "  [$i] status=$STATUS"
  [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && break
  sleep 2
done

echo ""
echo "=== GET /jobs/:id final response (paste below line) ==="
echo "$GET" | jq '.' 2>/dev/null || echo "$GET"
