#!/bin/bash

# Quick Frontend Test Script
echo "🧪 Testing Chatty Frontend"
echo "========================="

# Test 1: Check if servers are running
echo "1. Server Status:"
curl -s -o /dev/null -w "Frontend (5173): %{http_code}\n" http://localhost:5173
curl -s -o /dev/null -w "Backend (5000): %{http_code}\n" http://localhost:5000/api/me

# Test 2: Check for JavaScript errors in HTML
echo -e "\n2. HTML Structure Check:"
if curl -s http://localhost:5173 | grep -q 'id="root"'; then
    echo "✅ Root div found"
else
    echo "❌ Root div missing"
fi

if curl -s http://localhost:5173 | grep -q 'main.tsx'; then
    echo "✅ main.tsx script found"
else
    echo "❌ main.tsx script missing"
fi

# Test 3: Check for React imports
echo -e "\n3. React Import Check:"
if grep -q "import React" src/App.tsx; then
    echo "✅ React import found in App.tsx"
else
    echo "❌ React import missing in App.tsx"
fi

if grep -q "import React" src/main.tsx; then
    echo "✅ React import found in main.tsx"
else
    echo "❌ React import missing in main.tsx"
fi

# Test 4: Check for CSS imports
echo -e "\n4. CSS Import Check:"
if grep -q "import.*css" src/main.tsx; then
    echo "✅ CSS import found"
else
    echo "❌ CSS import missing"
fi

# Test 5: Check for orange theme
echo -e "\n5. Orange Theme Check:"
if grep -q "app-orange" src/index.css; then
    echo "✅ Orange theme found in CSS"
else
    echo "❌ Orange theme missing in CSS"
fi

echo -e "\n🎯 Frontend Test Complete!"
echo "If all checks pass, the white screen issue should be resolved."
echo "Open http://localhost:5173 in your browser to verify."
