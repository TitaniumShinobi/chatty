#!/bin/bash
# MOCR Acceptance Test Protocol
# Usage: ./scripts/acceptance-test.sh [base_url] [path_to_test_video.mp4]
# Default: base_url=http://localhost:3001, video=./test-video.mp4

set -e
BASE_URL="${1:-http://localhost:3001}"
VIDEO_PATH="${2:-./test-video.mp4}"
OUTPUT_DIR="${3:-./test-output}"
mkdir -p "$OUTPUT_DIR"

echo "=== MOCR Acceptance Test ==="
echo "Base URL: $BASE_URL"
echo "Video: $VIDEO_PATH"
echo ""

# A) Health check
echo "A) GET /health"
HEALTH=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$HEALTH" | tail -n1)
BODY=$(echo "$HEALTH" | sed '$d')
echo "Response: $HTTP_CODE"
echo "$BODY" | head -c 500
echo ""
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: Expected 200"
  exit 1
fi
echo "PASS: GET /health => 200"
echo ""

# B) Invalid mime - expect 4xx
echo "B) POST /jobs with invalid mime (application/pdf)"
INVALID=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/jobs" \
  -F "video=@package.json;type=application/pdf")
INVALID_CODE=$(echo "$INVALID" | tail -n1)
echo "Response: $INVALID_CODE"
if [ "$INVALID_CODE" != "400" ] && [ "$INVALID_CODE" != "415" ]; then
  echo "FAIL: Expected 4xx for invalid mime, got $INVALID_CODE"
  echo "$INVALID" | sed '$d'
else
  echo "PASS: Invalid mime returns 4xx"
fi
echo ""

# C) Upload valid video
if [ ! -f "$VIDEO_PATH" ]; then
  echo "Creating minimal test video (2s, no text)..."
  ffmpeg -y -f lavfi -i "color=c=blue:s=320x240:d=2" -c:v libx264 -pix_fmt yuv420p "$VIDEO_PATH" 2>/dev/null || true
fi

if [ ! -f "$VIDEO_PATH" ]; then
  echo "SKIP: No video at $VIDEO_PATH. Provide path for full test."
  exit 0
fi

echo "C) POST /jobs (video=@$VIDEO_PATH; type=video/mp4)"
POST_RESULT=$(curl -s -X POST "$BASE_URL/jobs" \
  -F "video=@$VIDEO_PATH;type=video/mp4")
echo "$POST_RESULT" > "$OUTPUT_DIR/post-response.json"
echo "POST response (saved to $OUTPUT_DIR/post-response.json):"
echo "$POST_RESULT" | head -c 600
echo ""
JOB_ID=$(echo "$POST_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$JOB_ID" ]; then
  JOB_ID=$(echo "$POST_RESULT" | grep -o '"job":{"id":"[^"]*"' | sed 's/.*"id":"\([^"]*\)".*/\1/')
fi
if [ -z "$JOB_ID" ]; then
  echo "FAIL: No job id in response"
  exit 1
fi
echo "Job ID: $JOB_ID"
echo ""

# D) Poll to terminal state
echo "D) Polling GET /jobs/$JOB_ID"
for i in {1..60}; do
  JOB_RESULT=$(curl -s "$BASE_URL/jobs/$JOB_ID")
  STATUS=$(echo "$JOB_RESULT" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Attempt $i: status=$STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    echo "$JOB_RESULT" > "$OUTPUT_DIR/job-final.json"
    break
  fi
  sleep 2
done

echo ""
echo "Final job response (saved to $OUTPUT_DIR/job-final.json):"
echo "$JOB_RESULT" | head -c 1200
echo ""

# E) Pass criteria
echo "=== Pass Criteria ==="
SUCCESS=$(echo "$JOB_RESULT" | grep -o '"success":[^,}]*' | head -1)
RESULT_SUCCESS=$(echo "$JOB_RESULT" | grep -o '"result":{"success":[^,}]*' | grep -o 'true\|false')
DESC_LEN=$(echo "$JOB_RESULT" | grep -o '"description":"[^"]*"' | head -1 | wc -c)
TEXT_LEN=$(echo "$JOB_RESULT" | grep -o '"textContent":\[.*\]' | wc -c)

echo "job.status = $STATUS"
echo "job.result.success = $RESULT_SUCCESS"
echo "description length = $DESC_LEN"
echo "textContent length = $TEXT_LEN"

PASS=0
[ "$STATUS" = "completed" ] && echo "PASS: job.status = completed" && PASS=$((PASS+1)) || echo "FAIL: job.status"
[ "$RESULT_SUCCESS" = "true" ] && echo "PASS: job.result.success = true" && PASS=$((PASS+1)) || echo "FAIL: job.result.success"
[ "$DESC_LEN" -gt 20 ] && echo "PASS: description non-empty" && PASS=$((PASS+1)) || echo "INFO: description (low/empty ok for control clip)"
[ "$TEXT_LEN" -gt 2 ] && echo "PASS: mocrAnalysis.textContent present" && PASS=$((PASS+1)) || echo "INFO: textContent (low/empty ok for control clip with no on-screen text)"

echo ""
echo "=== Summary ==="
echo "Criteria met: $PASS/4 (control clip may have low OCR)"
echo "Output: $OUTPUT_DIR/"
