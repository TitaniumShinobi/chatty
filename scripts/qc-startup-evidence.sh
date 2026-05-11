#!/usr/bin/env bash
# QC Gate: Collect startup reliability evidence for Chatty (frontend 5173, backend 5050).
# Run from repo root. Uses: npm run dev:full, curl, lsof, ps. Evidence written to ./qc-evidence/

set -e
RUN_ID="${1:-1}"
EVIDENCE_DIR="./qc-evidence/run-${RUN_ID}"
mkdir -p "$EVIDENCE_DIR"

echo "[QC] Run $RUN_ID — evidence to $EVIDENCE_DIR"

# 1) Port snapshot BEFORE
echo "[QC] Snapshot listeners BEFORE startup"
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | rg ':5173|:5050' || true > "$EVIDENCE_DIR/ports_before.txt" 2>/dev/null || true
echo "BEFORE (run $RUN_ID): $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$EVIDENCE_DIR/ports_before.txt"

# 2) Start dev:full and capture logs (standard command)
# Concurrently mixes output; we capture raw combined log. No editing.
LOG_RAW="$EVIDENCE_DIR/combined_raw.log"
touch "$LOG_RAW"
t0=$(python3 -c 'import time; print(time.time())')
echo "[QC] t0=$t0 — starting npm run dev:full"
npm run dev:full > "$LOG_RAW" 2>&1 &
NPID=$!
echo $NPID > "$EVIDENCE_DIR/npm_pid.txt"

# 3) Poll for backend health and frontend readiness; record timing
backend_ready=""
frontend_ready=""
t3=""
t4=""
for i in $(seq 1 120); do
  sleep 0.25
  if [ -z "$t3" ]; then
    out=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --connect-timeout 1 http://127.0.0.1:5050/api/health 2>/dev/null || true)
    code=$(echo "$out" | awk '{print $1}')
    tt=$(echo "$out" | awk '{print $2}')
    if [ "$code" = "200" ] && [ -n "$tt" ]; then
      t3=$(python3 -c "import time; print(time.time())")
      echo "$t0 $t3 $tt $code" > "$EVIDENCE_DIR/health_timing.txt"
      backend_ready=1
    fi
  fi
  if [ -z "$t4" ]; then
    if curl -s -o /dev/null -w '%{http_code}' --connect-timeout 1 http://127.0.0.1:5173/ >/dev/null 2>&1; then
      t4=$(python3 -c "import time; print(time.time())")
      echo "$t4" >> "$EVIDENCE_DIR/health_timing.txt"
      frontend_ready=1
    fi
  fi
  [ -n "$backend_ready" ] && [ -n "$frontend_ready" ] && break
done

# 4) Port snapshot AFTER (listeners with PID and command)
sleep 0.5
echo "[QC] Snapshot listeners AFTER startup"
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | rg ':5173|:5050' || true > "$EVIDENCE_DIR/ports_after.txt"
echo "AFTER (run $RUN_ID): $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$EVIDENCE_DIR/ports_after.txt"

# 5) Process survival at +30s, +90s, +180s from t0
now=$(python3 -c 'import time; print(int(time.time()))')
t0_int=${t0%.*}
for sec in 30 90 180; do
  target=$((t0_int + sec))
  sleep_time=$((target - now))
  [ "$sleep_time" -lt 0 ] && sleep_time=0
  sleep "$sleep_time"
  now=$(python3 -c 'import time; print(int(time.time()))')
  ps -eo pid,ppid,etime,command 2>/dev/null | rg 'vite|tsx|node|chatty|concurrently' || true > "$EVIDENCE_DIR/ps_at_${sec}s.txt"
done

# 6) Regression: /api/me
curl -s -i http://127.0.0.1:5050/api/me > "$EVIDENCE_DIR/regression_api_me.txt" 2>&1 || true

# 7) Health timing line for table (code, time_total)
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' http://127.0.0.1:5050/api/health >> "$EVIDENCE_DIR/health_final.txt" 2>/dev/null || true

echo "[QC] Evidence collected. Stop the app manually (e.g. kill $NPID) or use runtime:down."
