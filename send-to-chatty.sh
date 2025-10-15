#!/bin/bash

# Chatty Message Sender
# Usage: ./send-to-chatty.sh "Your message here" [sender_name]

TUNNEL_URL="https://okay-air-sector-bishop.trycloudflare.com"
KATANA_ENDPOINT="$TUNNEL_URL/chatty"

if [ $# -eq 0 ]; then
    echo "Usage: $0 \"Your message here\" [sender_name]"
    echo ""
    echo "Examples:"
    echo "  $0 \"Hello Chatty!\""
    echo "  $0 \"Hello Chatty!\" katana"
    echo "  $0 \"How are you doing?\" test-user"
    exit 1
fi

MESSAGE="$1"
SENDER="${2:-external-user}"

echo "📤 Sending message to Chatty..."
echo "Message: $MESSAGE"
echo "Sender: $SENDER"
echo ""

response=$(curl -s --max-time 15 -X POST "$KATANA_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"$MESSAGE\",\"sender\":\"$SENDER\",\"seat\":\"synth\"}")

if [ $? -eq 0 ]; then
    echo "✅ Response: $response"
    echo ""
    echo "💡 Check your Chatty CLI to see the message and response!"
else
    echo "❌ Failed to send message"
    exit 1
fi
