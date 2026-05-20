#!/usr/bin/env bash

set -euo pipefail

CHATTY_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHATTY_CLI_HOME="${CHATTY_CLI_HOME:-$HOME/.chatty-cli}"
CHATTY_CLI_SETTINGS_FILE="${CHATTY_CLI_SETTINGS_FILE:-$CHATTY_CLI_HOME/settings.json}"
CHATTY_CLI_CONVERSATIONS_DIR="${CHATTY_CLI_CONVERSATIONS_DIR:-$CHATTY_CLI_HOME/conversations}"
CHATTY_DB_PATH="${CHATTY_DB_PATH:-$CHATTY_CLI_HOME/chatty.db}"
CHATTY_CLI_FILE_ROOT="${CHATTY_CLI_FILE_ROOT:-$PWD}"

read_dotenv_value() {
  local key="$1"
  local file="$CHATTY_REPO/.env"
  if [ ! -f "$file" ]; then
    return 0
  fi
  local raw
  raw="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)"
  if [ -z "$raw" ]; then
    return 0
  fi
  raw="${raw#*=}"
  raw="${raw%$'\r'}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  printf '%s' "$raw"
}

bootstrap_node_runtime() {
  local nvm_dir
  nvm_dir="${NVM_DIR:-$HOME/.nvm}"

  if [[ ! -f "$CHATTY_REPO/.nvmrc" ]]; then
    return 0
  fi

  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    export NVM_DIR="$nvm_dir"
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
  fi
}

if [[ ! -d "$CHATTY_REPO" ]]; then
  echo "Chatty repo not found at $CHATTY_REPO" >&2
  exit 1
fi

bootstrap_node_runtime

if [[ ! -x "$CHATTY_REPO/node_modules/.bin/tsx" ]]; then
  echo "Chatty CLI dependencies are missing. Run npm ci in $CHATTY_REPO." >&2
  exit 1
fi

export CHATTY_CLI_HOME
export CHATTY_CLI_SETTINGS_FILE
export CHATTY_CLI_CONVERSATIONS_DIR
export CHATTY_DB_PATH
export CHATTY_CLI_FILE_ROOT
export VVAULT_SERVICE_TOKEN="${VVAULT_SERVICE_TOKEN:-$(read_dotenv_value VVAULT_SERVICE_TOKEN)}"
export VVAULT_URL="${VVAULT_URL:-$(read_dotenv_value VVAULT_URL)}"
export VVAULT_API_BASE_URL="${VVAULT_API_BASE_URL:-${VVAULT_URL:-$(read_dotenv_value VVAULT_API_BASE_URL)}}"

mkdir -p "$CHATTY_CLI_HOME" "$CHATTY_CLI_CONVERSATIONS_DIR"

cd "$CHATTY_REPO"
exec "$CHATTY_REPO/node_modules/.bin/tsx" src/cli/chatty-cli.ts "$@"
