#!/bin/bash

TUNNEL_URL="https://okay-air-sector-bishop.trycloudflare.com"
KATANA_ENDPOINT="$TUNNEL_URL/chatty"

echo "🤖 Testing Katana ↔ Chatty Connection"
echo "====================================="
echo ""
echo "🌐 Tunnel URL: $TUNNEL_URL"
echo "📡 API Endpoint: $KATANA_ENDPOINT"
echo ""

# Test 1: Basic API connectivity
echo "1️⃣ Testing basic API connectivity..."
response=$(curl -s --max-time 10 -X POST "$KATANA_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello Chatty! This is a connectivity test.","sender":"test-user"}')

if [ $? -eq 0 ] && echo "$response" | grep -q "queued"; then
    echo "✅ API connectivity: WORKING"
else
    echo "❌ API connectivity: FAILED"
    exit 1
fi

# Test 2: Katana-specific message
echo ""
echo "2️⃣ Testing Katana-specific message..."
response=$(curl -s --max-time 10 -X POST "$KATANA_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello Chatty! This is Katana. I want to test our communication loop.","sender":"katana","seat":"synth"}')

if [ $? -eq 0 ] && echo "$response" | grep -q "queued"; then
    echo "✅ Katana message: QUEUED"
else
    echo "❌ Katana message: FAILED"
fi

# Test 3: Check if Chatty CLI is processing external messages
echo ""
echo "3️⃣ Checking Chatty CLI status..."
if ps aux | grep -q "chatty-cli.ts" | grep -v grep; then
    echo "✅ Chatty CLI: RUNNING"
else
    echo "⚠️  Chatty CLI: NOT RUNNING (start with: npm run cli)"
fi

echo ""
echo "🎯 Next Steps:"
echo "1. Make sure Chatty CLI is running: npm run cli"
echo "2. Send a message from Katana to test the full loop"
echo "3. Watch the CLI for 'katana>' messages and responses"
echo ""
echo "📝 Example Katana message:"
echo "curl -X POST $KATANA_ENDPOINT \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"prompt\":\"Hello Chatty! How are you?\",\"sender\":\"katana\"}'"
echo ""
echo "🔗 Your public Chatty endpoint: $KATANA_ENDPOINT"
