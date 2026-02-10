#!/bin/bash

# Chatty Regression Investigation Script
# Identifies recently modified files that might cause blank white screen

echo "🔍 Chatty Regression Investigation"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Find recently modified files (last 24 hours)
echo -e "${BLUE}1. Recently Modified Files (Last 24 Hours)${NC}"
echo "----------------------------------------"
find . -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" -o -name "*.html" -o -name "*.json" \) \
  -mtime -1 -exec ls -la {} \; | head -20
echo ""

# 2. Find files modified in last 2 hours
echo -e "${BLUE}2. Very Recent Changes (Last 2 Hours)${NC}"
echo "----------------------------------------"
find . -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" -o -name "*.html" -o -name "*.json" \) \
  -mmin -120 -exec ls -la {} \;
echo ""

# 3. Check git status for uncommitted changes
echo -e "${BLUE}3. Uncommitted Changes${NC}"
echo "----------------------"
git status --porcelain
echo ""

# 4. Check git log for recent commits
echo -e "${BLUE}4. Recent Commits (Last 10)${NC}"
echo "---------------------------"
git log --oneline -10
echo ""

# 5. Check critical frontend files
echo -e "${BLUE}5. Critical Frontend Files Status${NC}"
echo "--------------------------------"
critical_files=(
  "src/main.tsx"
  "src/App.tsx"
  "src/index.css"
  "index.html"
  "vite.config.ts"
  "tailwind.config.js"
  "package.json"
)

for file in "${critical_files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file exists"
    # Check if file has been modified recently
    if [ $(find "$file" -mmin -60) ]; then
      echo -e "  ${YELLOW}⚠️  Modified in last hour${NC}"
    fi
  else
    echo -e "${RED}✗${NC} $file missing"
  fi
done
echo ""

# 6. Check for syntax errors in critical files
echo -e "${BLUE}6. Syntax Check for Critical Files${NC}"
echo "-----------------------------------"
for file in "${critical_files[@]}"; do
  if [ -f "$file" ]; then
    if [[ "$file" == *.tsx ]] || [[ "$file" == *.ts ]]; then
      echo "Checking $file..."
      npx tsc --noEmit "$file" 2>&1 | head -3
    fi
  fi
done
echo ""

# 7. Check for missing dependencies
echo -e "${BLUE}7. Dependency Check${NC}"
echo "-------------------"
if [ -f "package.json" ]; then
  echo "Checking for missing dependencies..."
  npm ls --depth=0 2>&1 | grep -E "(missing|UNMET)" || echo "All dependencies satisfied"
fi
echo ""

# 8. Check browser console errors (if possible)
echo -e "${BLUE}8. Build Status Check${NC}"
echo "---------------------"
if command -v npm &> /dev/null; then
  echo "Checking if build would succeed..."
  npm run build --dry-run 2>&1 | head -10 || echo "Build check not available"
fi
echo ""

# 9. Check for common white screen causes
echo -e "${BLUE}9. Common White Screen Causes${NC}"
echo "-------------------------------"

# Check if main.tsx has proper root element
if [ -f "src/main.tsx" ]; then
  if grep -q "getElementById('root')" src/main.tsx; then
    echo -e "${GREEN}✓${NC} main.tsx has root element reference"
  else
    echo -e "${RED}✗${NC} main.tsx missing root element reference"
  fi
fi

# Check if index.html has root div
if [ -f "index.html" ]; then
  if grep -q 'id="root"' index.html; then
    echo -e "${GREEN}✓${NC} index.html has root div"
  else
    echo -e "${RED}✗${NC} index.html missing root div"
  fi
fi

# Check for React import issues
if [ -f "src/App.tsx" ]; then
  if grep -q "import React" src/App.tsx; then
    echo -e "${GREEN}✓${NC} App.tsx has React import"
  else
    echo -e "${YELLOW}⚠️${NC} App.tsx might be missing React import"
  fi
fi

# Check for CSS import issues
if [ -f "src/main.tsx" ]; then
  if grep -q "import.*css" src/main.tsx; then
    echo -e "${GREEN}✓${NC} CSS is imported in main.tsx"
  else
    echo -e "${YELLOW}⚠️${NC} CSS might not be imported"
  fi
fi

echo ""
echo -e "${BLUE}10. Quick Fix Suggestions${NC}"
echo "-------------------------"
echo "1. Try: npm run dev (frontend only)"
echo "2. Check browser console for errors (F12)"
echo "3. Try: rm -rf node_modules && npm install"
echo "4. Check: http://localhost:5173 in incognito mode"
echo "5. Verify: No JavaScript errors in browser console"
echo ""

echo -e "${GREEN}Investigation complete!${NC}"
echo "Look for files marked with ⚠️ or ✗ as potential causes."
