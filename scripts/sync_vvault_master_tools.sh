#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VVAULT_ROOT="${VVAULT_ROOT:-$ROOT/../vvault}"

SRC_DIR="$VVAULT_ROOT/scripts/master"
DST_DIR="$ROOT/vvault_scripts/master"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "[sync] ERROR: vvault master dir not found: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DST_DIR"

ALLOWLIST=(
  "aviator.py"
  "navigator.py"
  "nautilus.py"
  "orbit.py"
  "time.py"
  "needle.py"
)

echo "[sync] Source: $SRC_DIR"
echo "[sync] Dest:   $DST_DIR"

for f in "${ALLOWLIST[@]}"; do
  if [[ ! -f "$SRC_DIR/$f" ]]; then
    echo "[sync] WARN: missing in vvault: $f (skipping)"
    continue
  fi
  rsync -a "$SRC_DIR/$f" "$DST_DIR/$f"
done

echo "[sync] Verifying diffs..."
for f in "${ALLOWLIST[@]}"; do
  if [[ -f "$SRC_DIR/$f" && -f "$DST_DIR/$f" ]]; then
    diff -u "$SRC_DIR/$f" "$DST_DIR/$f" >/dev/null
  fi
done

echo "[sync] OK"

