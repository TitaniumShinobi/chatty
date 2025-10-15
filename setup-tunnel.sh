#!/bin/bash

echo "🚀 Chatty Tunnel Setup Script"
echo "=============================="
echo ""

# Check if Chatty server is running
if ! curl -s --max-time 2 http://localhost:5060/chatty -X POST -H "Content-Type: application/json" -d '{"prompt":"test","sender":"test"}' > /dev/null 2>&1; then
    echo "❌ Chatty server is not running on port 5060"
    echo "Please start the Chatty server first with: npm run cli"
    exit 1
fi

echo "✅ Chatty server is running on port 5060"
echo ""

# Check available tunnel options
echo "Available tunnel options:"
echo "1. ngrok (Recommended - most reliable)"
echo "2. Cloudflare Tunnel (Free but sometimes unstable)"
echo "3. Local network access only"
echo ""

read -p "Choose option (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🔧 Setting up ngrok..."
        
        # Check if ngrok is installed
        if ! command -v ngrok &> /dev/null; then
            echo "❌ ngrok is not installed"
            echo "Please install it with: brew install ngrok/ngrok/ngrok"
            exit 1
        fi
        
        echo "✅ ngrok is installed"
        echo ""
        echo "📝 To get a public URL, you need to:"
        echo "1. Go to https://ngrok.com/ and create a free account"
        echo "2. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken"
        echo "3. Run: ngrok config add-authtoken YOUR_AUTHTOKEN"
        echo "4. Then run: ngrok http 5060"
        echo ""
        echo "🚀 Starting ngrok (you'll see the public URL in the output):"
        echo ""
        ngrok http 5060
        ;;
    2)
        echo ""
        echo "🔧 Setting up Cloudflare Tunnel..."
        echo "⚠️  Note: Cloudflare's free service has been experiencing issues"
        echo ""
        cloudflared tunnel --url http://localhost:5060
        ;;
    3)
        echo ""
        echo "🏠 Local network access only"
        echo ""
        echo "Your Chatty server is accessible at:"
        echo "• http://localhost:5060 (local only)"
        echo ""
        echo "To access from other devices on your network:"
        echo "• Find your local IP: ifconfig | grep 'inet ' | grep -v 127.0.0.1"
        echo "• Use: http://YOUR_LOCAL_IP:5060"
        echo ""
        echo "Example API test:"
        echo "curl -X POST http://localhost:5060/chatty \\"
        echo "  -H 'Content-Type: application/json' \\"
        echo "  -d '{\"prompt\":\"Hello Chatty!\",\"sender\":\"test\"}'"
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac
