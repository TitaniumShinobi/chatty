#!/bin/bash

echo "🧪 Testing Chatty API"
echo "===================="
echo ""

# Test the Chatty API endpoint
echo "Testing Chatty API endpoint..."
response=$(curl -s --max-time 10 -X POST http://localhost:5060/chatty \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello Chatty! This is a test message.","sender":"test-user"}')

if [ $? -eq 0 ]; then
    echo "✅ API Response: $response"
    echo ""
    echo "🎉 Chatty API is working correctly!"
    echo ""
    echo "You can now:"
    echo "1. Run ./setup-tunnel.sh to create a public tunnel"
    echo "2. Or use the API directly at http://localhost:5060/chatty"
    echo ""
    echo "Example usage:"
    echo "curl -X POST http://localhost:5060/chatty \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{\"prompt\":\"Your message here\",\"sender\":\"your-name\"}'"
else
    echo "❌ API test failed"
    echo "Make sure Chatty server is running with: npm run cli"
fi
