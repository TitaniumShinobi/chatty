#!/bin/bash

# Chatty Startup Script
# Similar to frame approach: activate environment and start server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Chatty...${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Make sure you're in the Chatty project root.${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "not installed")
if [[ "$NODE_VERSION" == "not installed" ]]; then
    echo -e "${RED}❌ Error: Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js version: $NODE_VERSION${NC}"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
    npm install
fi

# Install server dependencies if needed
if [ ! -d "server/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing server dependencies...${NC}"
    cd server && npm install && cd ..
fi

# Check if concurrently is installed
if ! npm list concurrently >/dev/null 2>&1; then
    echo -e "${YELLOW}📦 Installing concurrently...${NC}"
    npm install concurrently
fi

# Start both frontend and backend servers
echo -e "${GREEN}🌟 Starting Chatty servers...${NC}"
echo -e "${BLUE}   Frontend: http://localhost:5173${NC}"
echo -e "${BLUE}   Backend:  http://localhost:5050${NC}"
echo -e "${BLUE}   Health:   http://localhost:5050/health${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both servers${NC}"
echo ""

# Start both servers using concurrently
exec npm run dev:full









