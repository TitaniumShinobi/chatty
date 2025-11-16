#!/bin/bash

# Unified Startup Script for Chatty + VVAULT
# Starts both Chatty and VVAULT together

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Chatty + VVAULT Unified Development Environment${NC}"
echo "============================================================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHATTY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VVAULT_ROOT="$(cd "$CHATTY_ROOT/.." && pwd)/vvault"

echo -e "${CYAN}📁 Chatty Root:${NC} $CHATTY_ROOT"
echo -e "${CYAN}📁 VVAULT Root:${NC} $VVAULT_ROOT"
echo "============================================================"
echo ""

# Check if VVAULT directory exists
if [ ! -d "$VVAULT_ROOT" ]; then
    echo -e "${RED}❌ Error: VVAULT directory not found at: $VVAULT_ROOT${NC}"
    echo -e "${YELLOW}   Expected location: $VVAULT_ROOT${NC}"
    exit 1
fi

# Check if VVAULT has node_modules
if [ ! -d "$VVAULT_ROOT/node_modules" ]; then
    echo -e "${YELLOW}⚠️  VVAULT node_modules not found.${NC}"
    echo -e "${YELLOW}   Run 'npm install' in VVAULT directory first.${NC}"
    echo ""
fi

# Check if concurrently is installed in Chatty
if ! npm list concurrently >/dev/null 2>&1; then
    echo -e "${YELLOW}📦 Installing concurrently in Chatty...${NC}"
    cd "$CHATTY_ROOT"
    npm install concurrently
fi

# Check if concurrently is installed in VVAULT
if ! (cd "$VVAULT_ROOT" && npm list concurrently >/dev/null 2>&1); then
    echo -e "${YELLOW}📦 Installing concurrently in VVAULT...${NC}"
    cd "$VVAULT_ROOT"
    npm install concurrently
fi

echo -e "${GREEN}🌐 Starting Services:${NC}"
echo -e "   ${CYAN}📱 Chatty Frontend:${NC} http://localhost:5173"
echo -e "   ${BLUE}🔌 Chatty Backend:${NC}  http://localhost:5000"
echo -e "   ${MAGENTA}🗄️  VVAULT Backend:${NC}  http://localhost:8000"
echo -e "   ${YELLOW}🎨 VVAULT Frontend:${NC} http://localhost:7784"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Start all services using concurrently
cd "$CHATTY_ROOT"
npx concurrently \
  --names "chatty-frontend,chatty-backend,vvault-backend,vvault-frontend" \
  --prefix-colors "cyan,blue,magenta,yellow" \
  --kill-others \
  "npm run dev" \
  "npm run server" \
  "cd $VVAULT_ROOT && npm run backend" \
  "cd $VVAULT_ROOT && npm run frontend"

