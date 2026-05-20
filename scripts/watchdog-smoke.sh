#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Lightweight smoke tests for the watchdog. All runs are observe-only and single-shot.
# They simulate failures by pointing health URLs to an invalid port or by tightening thresholds.

NODE=${NODE:-node}
TSX=${TSX:-npx tsx}
WD_CMD="$TSX watchdog/index.ts --once"

LOG_SECTION() { printf "\n== %s ==\n" "$1"; }

# 1) App health failure simulation
LOG_SECTION "HEALTH_GATE fail (port closed)"
CHATTY_HEALTH_URL=http://127.0.0.1:9 \
WATCHDOG_OBSERVE_ONLY=true \
WATCHDOG_INTERVAL_MS=500 \
$WD_CMD || true

# 2) Provider failure simulation
LOG_SECTION "PROVIDER_GATE fail (port closed)"
PROVIDER_HEALTH_URL=http://127.0.0.1:9 \
WATCHDOG_OBSERVE_ONLY=true \
WATCHDOG_INTERVAL_MS=500 \
$WD_CMD || true

# 3) Resource threshold trip (force ratio)
LOG_SECTION "RESOURCE_GATE fail (free ratio threshold)"
WATCHDOG_RESOURCE_MIN_FREE_RATIO=0.99 \
WATCHDOG_OBSERVE_ONLY=true \
WATCHDOG_INTERVAL_MS=500 \
$WD_CMD || true

LOG_SECTION "DB_GATE fail (port closed)"
DB_HEALTH_URL=http://127.0.0.1:9 \
WATCHDOG_OBSERVE_ONLY=true \
WATCHDOG_INTERVAL_MS=500 \
$WD_CMD || true

LOG_SECTION "MEMORY_GATE fail (port closed)"
MEMORY_HEALTH_URL=http://127.0.0.1:9 \
WATCHDOG_OBSERVE_ONLY=true \
WATCHDOG_INTERVAL_MS=500 \
$WD_CMD || true

LOG_SECTION "VVAULT_GATE fail (port closed)"
VVAULT_HEALTH_URL=http://127.0.0.1:9 \
WATCHDOG_OBSERVE_ONLY=true \
WATCHDOG_INTERVAL_MS=500 \
$WD_CMD || true

LOG_SECTION "BUILD_GATE fail (port closed)"
BUILD_HEALTH_URL=http://127.0.0.1:9 \
WATCHDOG_OBSERVE_ONLY=true \
WATCHDOG_INTERVAL_MS=500 \
$WD_CMD || true

LOG_SECTION "Recent watchdog log tail"
LOG_PATH=${WATCHDOG_LOG_DIR:-/var/log/chatty}/watchdog.log
[ -f "$LOG_PATH" ] && tail -n 20 "$LOG_PATH" || echo "(no log file yet)"
