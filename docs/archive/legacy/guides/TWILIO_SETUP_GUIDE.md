# Twilio 2FA Setup Guide for Chatty

## 🎯 Overview
This guide will help you set up real Twilio SMS verification for Chatty's 2FA system, replacing the mock mode with actual SMS functionality.

## 📋 Prerequisites
- Twilio account (sign up at https://www.twilio.com)
- Phone number for testing
- Credit card for Twilio verification (they require it but won't charge for trial)

## 🚀 Step-by-Step Setup

### 1. Create Twilio Account
1. Go to https://www.twilio.com
2. Sign up for a free account
3. Verify your phone number
4. Complete account verification

### 2. Get Your Credentials
1. **Account SID**: Found on your Twilio Console dashboard
2. **Auth Token**: Found on your Twilio Console dashboard (click "Show" to reveal)
3. **Phone Number**: You'll get a free trial phone number

### 3. Set Up Verify Service
1. Go to **Verify** → **Services** in your Twilio Console
2. Click **Create new Service**
3. Give it a name: "Chatty 2FA"
4. Choose **SMS** as the channel
5. Copy the **Service SID** (starts with `VA...`)

### 4. Configure Environment Variables
Update your `/chatty/server/.env` file with your real credentials:

```bash
# Twilio Configuration (for 2FA)
TWILIO_SID=AC1234567890abcdef1234567890abcdef  # Your Account SID
TWILIO_TOKEN=your_auth_token_here             # Your Auth Token
TWILIO_VERIFY_SID=VA1234567890abcdef1234567890abcdef  # Your Verify Service SID
```

### 5. Test the Setup
1. Start your Chatty server: `npm run dev:full`
2. Try the phone verification flow
3. Check Twilio Console for SMS logs

## 🔧 Troubleshooting

### Common Issues:
- **"Invalid phone number"**: Use E.164 format (+1234567890)
- **"Service not found"**: Check your Verify Service SID
- **"Authentication failed"**: Verify Account SID and Auth Token

### Testing Phone Numbers:
- **US**: +15551234567 (Twilio test number)
- **International**: Use your real phone number for testing

## 💰 Cost Considerations
- **Trial Account**: $15 credit included
- **SMS Cost**: ~$0.0075 per SMS in US
- **Verify Service**: Free to use, pay per verification

## 🔒 Security Best Practices
1. **Never commit credentials** to version control
2. **Use environment variables** for all sensitive data
3. **Rate limit** verification attempts
4. **Log all verification attempts** for monitoring

## 📱 Phone Number Format
Always use E.164 format:
- ✅ `+1234567890` (US)
- ✅ `+44123456789` (UK)
- ❌ `123-456-7890`
- ❌ `(123) 456-7890`

## 🎉 Next Steps
Once Twilio is configured:
1. Test SMS verification
2. Implement rate limiting
3. Add phone number validation
4. Set up monitoring and logging

## 📞 Support
- Twilio Documentation: https://www.twilio.com/docs/verify
- Twilio Support: https://support.twilio.com
- Chatty Issues: Check server logs for detailed error messages
