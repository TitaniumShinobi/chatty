#!/usr/bin/env bash
set -euo pipefail

# Bootstrap Ollama + Chatty construct sim models on a Linux VM.
# Default targets: zen-001, aurora-001, monday-001.

CHATTY_ROOT_DEFAULT="/opt/chatty"
INSTANCES_DIR_DEFAULT="/vvault/instances"
BASE_MODEL_DEFAULT="qwen2.5:7b"
CALLSIGNS_DEFAULT="zen-001,aurora-001,monday-001"

CHATTY_ROOT="${CHATTY_ROOT:-$CHATTY_ROOT_DEFAULT}"
INSTANCES_DIR="${INSTANCES_DIR:-$INSTANCES_DIR_DEFAULT}"
BASE_MODEL="${BASE_MODEL:-$BASE_MODEL_DEFAULT}"
CALLSIGNS_CSV="${CALLSIGNS:-$CALLSIGNS_DEFAULT}"
DRY_RUN="false"
INCLUDE_CAPSULE_SUMMARY="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --chatty-root)
      CHATTY_ROOT="$2"
      shift 2
      ;;
    --instances-dir)
      INSTANCES_DIR="$2"
      shift 2
      ;;
    --base-model)
      BASE_MODEL="$2"
      shift 2
      ;;
    --callsigns)
      CALLSIGNS_CSV="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --no-capsule-summary)
      INCLUDE_CAPSULE_SUMMARY="false"
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$CHATTY_ROOT" ]]; then
  echo "chatty root not found: $CHATTY_ROOT" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 2
fi

run_privileged() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

echo "[bootstrap] chatty root: $CHATTY_ROOT"
echo "[bootstrap] instances dir: $INSTANCES_DIR"
echo "[bootstrap] base model: $BASE_MODEL"
echo "[bootstrap] callsigns: $CALLSIGNS_CSV"
echo "[bootstrap] dry run: $DRY_RUN"

if ! command -v ollama >/dev/null 2>&1; then
  echo "[bootstrap] Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

if [[ -f "$CHATTY_ROOT/deploy/ollama.service" ]]; then
  echo "[bootstrap] Installing ollama.service"
  run_privileged cp "$CHATTY_ROOT/deploy/ollama.service" /etc/systemd/system/ollama.service
  run_privileged systemctl daemon-reload
  run_privileged systemctl enable ollama
  run_privileged systemctl restart ollama
fi

echo "[bootstrap] Pulling base model: $BASE_MODEL"
ollama pull "$BASE_MODEL"

BUILD_SCRIPT="$CHATTY_ROOT/scripts/build_sims.py"
if [[ ! -f "$BUILD_SCRIPT" ]]; then
  echo "build script not found: $BUILD_SCRIPT" >&2
  exit 2
fi

IFS=',' read -r -a CALLSIGNS_ARR <<< "$CALLSIGNS_CSV"

for raw in "${CALLSIGNS_ARR[@]}"; do
  callsign="$(echo "$raw" | xargs)"
  [[ -z "$callsign" ]] && continue

  echo "[bootstrap] Building callsign: $callsign"
  cmd=(
    python3 "$BUILD_SCRIPT"
    --instances-dir "$INSTANCES_DIR"
    --base-model "$BASE_MODEL"
    --callsign "$callsign"
  )

  if [[ "$INCLUDE_CAPSULE_SUMMARY" == "true" ]]; then
    cmd+=(--include-capsule-summary)
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    cmd+=(--dry-run)
  fi

  "${cmd[@]}"
done

echo "[bootstrap] Ollama models currently available:"
ollama list || true

echo "[bootstrap] Completed."
