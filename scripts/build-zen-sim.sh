#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$ROOT_DIR/ollama/zen-sim"

if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama CLI not found in PATH"
  exit 1
fi

echo "Building zen-sim from $MODEL_DIR/Modelfile"
ollama create zen-sim -f "$MODEL_DIR/Modelfile"

echo "zen-sim ready"
