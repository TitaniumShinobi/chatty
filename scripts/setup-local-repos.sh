#!/usr/bin/env bash
# ============================================
# One-time setup: Quick repo access (chatty, vvault, fxshinobi)
# Run from anywhere: bash ~/Documents/GitHub/chatty/scripts/setup-local-repos.sh
# ============================================

set -e
GITHUB_ROOT="${GITHUB_ROOT:-$HOME/Documents/GitHub}"
FXS="$GITHUB_ROOT/fxshinobi"
ZSHRC="${ZSHRC:-$HOME/.zshrc}"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS/com.fxshinobi.watchdog.plist"

# 1. Ensure FXShinobi logs dir exists
mkdir -p "$FXS/logs"
echo "✅ Created/verified $FXS/logs"

# 2. Append to ~/.zshrc only if not already present
if grep -q "Quick Repo Access (Chatty, VVAULT, FXShinobi)" "$ZSHRC" 2>/dev/null; then
  echo "⏭️  Quick-repo block already in $ZSHRC (skipping)"
else
  cat >> "$ZSHRC" << 'ENDOFZSH'

# ============================================
# Quick Repo Access (Chatty, VVAULT, FXShinobi)
# ============================================

export GITHUB_ROOT="$HOME/Documents/GitHub"
export VVAULT_ROOT="$GITHUB_ROOT/vvault"
export VVAULT_PATH="$GITHUB_ROOT/vvault"

# Chatty: jump and start dev server in background
chatty() {
  cd "$GITHUB_ROOT/chatty" || return
  echo "🚀 Starting Chatty (frontend :5173, backend :5050)..."
  npm run dev:full &
}

# VVAULT: jump and start dev server (frontend :7784, backend :8000)
vvault() {
  cd "$GITHUB_ROOT/vvault" || return
  echo "🚀 Starting VVAULT (frontend :7784, backend :8000)..."
  npm run dev:full &
}

# FXShinobi: jump and check watchdog
fxshinobi() {
  cd "$GITHUB_ROOT/fxshinobi" || return
  echo "📊 FXShinobi: $(pwd)"
  if pgrep -f "python.*api.py" > /dev/null; then
    echo "✅ Watchdog running (PID: $(pgrep -f 'python.*api.py'))"
    echo "📈 Logs: tail -f logs/fxshinobi.log"
  else
    echo "⚠️  Watchdog NOT running"
    echo "💡 Start: python3 api.py &"
  fi
}

alias fxs='fxshinobi'

# Git shortcuts
alias gp='git push'
alias gs='git status'
alias gc='git commit -am'
alias gl='git log --oneline -10'

# Push all repos (push only - commit first in each repo you changed)
pushall() {
  echo "🔄 Pushing all repos..."
  (cd "$GITHUB_ROOT/chatty" && git push && echo "✅ Chatty") || echo "❌ Chatty"
  (cd "$GITHUB_ROOT/vvault" && git push && echo "✅ VVAULT") || echo "❌ VVAULT"
  (cd "$GITHUB_ROOT/fxshinobi" && git push && echo "✅ FXShinobi") || echo "❌ FXShinobi"
}

# Pull all repos
pullall() {
  echo "🔄 Pulling all repos..."
  (cd "$GITHUB_ROOT/chatty" && git pull && echo "✅ Chatty")
  (cd "$GITHUB_ROOT/vvault" && git pull && echo "✅ VVAULT")
  (cd "$GITHUB_ROOT/fxshinobi" && git pull && echo "✅ FXShinobi")
}

# Status of all repos
statusall() {
  echo "=== CHATTY ==="; cd "$GITHUB_ROOT/chatty" && git status -s
  echo "=== VVAULT ==="; cd "$GITHUB_ROOT/vvault" && git status -s
  echo "=== FXSHINOBI ==="; cd "$GITHUB_ROOT/fxshinobi" && git status -s
}

ENDOFZSH
  echo "✅ Appended quick-repo block to $ZSHRC"
fi

# 3. Create launchd plist (venv Python)
mkdir -p "$LAUNCH_AGENTS"
PYTHON="$FXS/.venv/bin/python3"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="/usr/bin/python3"
  echo "⚠️  No .venv at $FXS/.venv — using $PYTHON (edit plist if you add a venv later)"
fi

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.fxshinobi.watchdog</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON</string>
        <string>$FXS/api.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$FXS</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$FXS/logs/watchdog.log</string>
    <key>StandardErrorPath</key>
    <string>$FXS/logs/watchdog.error.log</string>
</dict>
</plist>
EOF
echo "✅ Created $PLIST (Python: $PYTHON)"

echo ""
echo "Next steps:"
echo "  1. Reload shell:  source $ZSHRC"
echo "  2. Load watchdog: launchctl load $PLIST"
echo "  3. Start watchdog: launchctl start com.fxshinobi.watchdog"
echo "  4. Check:         launchctl list | grep fxshinobi"
echo ""
echo "Then from any directory: chatty | fxs | vvault | pushall | pullall | statusall"
