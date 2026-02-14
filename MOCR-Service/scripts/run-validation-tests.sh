#!/bin/bash
# MOCR Validation Tests - Phase 0
set -e
BASE="${1:-http://localhost:3001}"
OUT="$2"
[ -z "$OUT" ] && OUT="test-output"
mkdir -p "$OUT"

echo "=== A. Text-heavy clip ==="
POST_A=$(curl -s -X POST "$BASE/jobs" -F "video=@test-assets/text-heavy.mp4;type=video/mp4" -F 'config={"frameInterval":2,"maxFrames":20}')
echo "$POST_A" > "$OUT/A-post.json"
JID_A=$(echo "$POST_A" | grep -o '"id":"mocr_[^"]*"' | cut -d'"' -f4)
[ -z "$JID_A" ] && { echo "No job id"; exit 1; }
for i in $(seq 1 90); do
  GET=$(curl -s "$BASE/jobs/$JID_A")
  echo "$GET" | grep -q '"status":"completed"' && echo "$GET" > "$OUT/A-get.json" && break
  echo "$GET" | grep -q '"status":"failed"' && echo "$GET" > "$OUT/A-get.json" && break
  sleep 5
done

echo "=== B. No-text clip ==="
POST_B=$(curl -s -X POST "$BASE/jobs" -F "video=@test-assets/no-text.mp4;type=video/mp4")
echo "$POST_B" > "$OUT/B-post.json"
JID_B=$(echo "$POST_B" | grep -o '"id":"mocr_[^"]*"' | cut -d'"' -f4)
for i in $(seq 1 60); do
  GET=$(curl -s "$BASE/jobs/$JID_B")
  echo "$GET" | grep -qE '"status":"(completed|failed)"' && echo "$GET" > "$OUT/B-get.json" && break
  sleep 3
done

echo "=== C. Invalid MIME ==="
INVALID=$(curl -s -w "\n%{http_code}" -X POST "$BASE/jobs" -F "video=@test-assets/invalid.txt;type=text/plain")
echo "$INVALID" > "$OUT/C-invalid.txt"

echo "=== D. Corrupted video ==="
POST_D=$(curl -s -X POST "$BASE/jobs" -F "video=@test-assets/corrupted.mp4;type=video/mp4")
JID_D=$(echo "$POST_D" | grep -o '"id":"mocr_[^"]*"' | cut -d'"' -f4)
for i in $(seq 1 30); do
  GET=$(curl -s "$BASE/jobs/$JID_D")
  echo "$GET" | grep -qE '"status":"(completed|failed)"' && echo "$GET" > "$OUT/D-get.json" && break
  sleep 2
done

echo "=== E. Concurrency ==="
curl -s -X POST "$BASE/jobs" -F "video=@test-assets/no-text.mp4;type=video/mp4" > "$OUT/E1-post.json" &
curl -s -X POST "$BASE/jobs" -F "video=@test-assets/text-heavy.mp4;type=video/mp4" -F 'config={"maxFrames":5}' > "$OUT/E2-post.json" &
wait
JID_E1=$(grep -o '"id":"mocr_[^"]*"' "$OUT/E1-post.json" | cut -d'"' -f4)
JID_E2=$(grep -o '"id":"mocr_[^"]*"' "$OUT/E2-post.json" | cut -d'"' -f4)
for i in $(seq 1 120); do
  S1=$(curl -s "$BASE/jobs/$JID_E1" | grep -o '"status":"[^"]*"' | head -1)
  S2=$(curl -s "$BASE/jobs/$JID_E2" | grep -o '"status":"[^"]*"' | head -1)
  echo "E poll $i: E1=$S1 E2=$S2"
  [[ "$S1" =~ completed|failed ]] && [[ "$S2" =~ completed|failed ]] && break
  sleep 3
done
curl -s "$BASE/jobs/$JID_E1" > "$OUT/E1-get.json"
curl -s "$BASE/jobs/$JID_E2" > "$OUT/E2-get.json"

echo "Done. Output in $OUT/"
