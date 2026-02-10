#!/bin/bash

# Microsoft OAuth Setup Script for Chatty (Fixed Version)
# This script sets up Microsoft OAuth credentials using Azure CLI

set -e  # Exit on any error

echo "🚀 Setting up Microsoft OAuth for Chatty..."

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI not found. Installing..."
    if ! brew install azure-cli; then
        echo "❌ Failed to install Azure CLI. Please install manually:"
        echo "   brew install azure-cli"
        echo "   Or visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
    fi
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq not found. Installing..."
    if ! brew install jq; then
        echo "❌ Failed to install jq. Please install manually:"
        echo "   brew install jq"
        exit 1
    fi
fi

# Login to Azure
echo "🔐 Logging into Azure..."
if ! az login --allow-no-subscriptions; then
    echo "❌ Failed to login to Azure."
    echo ""
    echo "💡 Alternative options:"
    echo "1. Use Azure Portal (web interface):"
    echo "   https://portal.azure.com/"
    echo "2. Use Google OAuth instead (easier setup)"
    echo "3. Get an Azure subscription"
    echo ""
    echo "For now, let's set up Google OAuth instead:"
    echo "Go to: https://console.cloud.google.com/"
    echo "Create OAuth 2.0 credentials"
    echo "Add redirect URI: http://localhost:5173/api/auth/google/callback"
    exit 1
fi

# Check if we can create app registrations
echo "🔍 Checking Azure permissions..."
if ! az ad app list --query "[].{displayName:displayName}" --output table > /dev/null 2>&1; then
    echo "❌ Insufficient permissions to create app registrations"
    echo "💡 You need an Azure subscription or admin permissions"
    echo ""
    echo "Alternative: Use Azure Portal (web interface)"
    echo "1. Go to: https://portal.azure.com/"
    echo "2. Search for 'App registrations'"
    echo "3. Click 'New registration'"
    echo "4. Fill out the form with your redirect URI"
    exit 1
fi

# Create app registration
echo "📱 Creating app registration..."
APP_RESPONSE=$(az ad app create --display-name "Chatty OAuth" --sign-in-audience AzureADandPersonalMicrosoftAccount)
if [ $? -ne 0 ]; then
    echo "❌ Failed to create app registration"
    echo "💡 Try using Azure Portal instead: https://portal.azure.com/"
    exit 1
fi

APP_ID=$(echo $APP_RESPONSE | jq -r '.appId')
if [ "$APP_ID" = "null" ] || [ -z "$APP_ID" ]; then
    echo "❌ Failed to get app ID from response"
    echo "Response: $APP_RESPONSE"
    exit 1
fi

echo "✅ App created with ID: $APP_ID"

# Create client secret
echo "🔑 Creating client secret..."
SECRET_RESPONSE=$(az ad app credential reset --id $APP_ID --display-name "Chatty Secret")
if [ $? -ne 0 ]; then
    echo "❌ Failed to create client secret"
    exit 1
fi

CLIENT_SECRET=$(echo $SECRET_RESPONSE | jq -r '.password')
if [ "$CLIENT_SECRET" = "null" ] || [ -z "$CLIENT_SECRET" ]; then
    echo "❌ Failed to get client secret from response"
    echo "Response: $SECRET_RESPONSE"
    exit 1
fi

echo "✅ Client secret created"

# Set redirect URI
echo "🔗 Setting redirect URI..."
if ! az ad app update --id $APP_ID --web-redirect-uris "http://localhost:5173/api/auth/microsoft/callback"; then
    echo "❌ Failed to set redirect URI"
    exit 1
fi

echo "✅ Redirect URI set"

# Verify the app exists
echo "🔍 Verifying app registration..."
if ! az ad app show --id $APP_ID > /dev/null 2>&1; then
    echo "❌ Failed to verify app registration"
    exit 1
fi

# Display credentials
echo ""
echo "🎉 Microsoft OAuth setup complete!"
echo ""
echo "Add these to your .env file:"
echo "MICROSOFT_CLIENT_ID=$APP_ID"
echo "MICROSOFT_CLIENT_SECRET=$CLIENT_SECRET"
echo ""
echo "⚠️  Save the client secret - you won't be able to see it again!"
echo ""
echo "✅ Setup verified successfully!"

