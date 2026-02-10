# 📧 Email Service Configuration Guide

## 🚀 Quick Setup for Production

### Option 1: Resend (Recommended)
1. Sign up at [resend.com](https://resend.com)
2. Verify your domain (e.g., `chatty.com`)
3. Get your API key from the dashboard
4. Set environment variables:

```bash
EMAIL_SERVICE=resend
RESEND_API_KEY=re_your_api_key_here
FROM_EMAIL=noreply@chatty.com
```

### Option 2: SMTP (Fallback)
```bash
EMAIL_SERVICE=smtp
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

## 🔧 Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority&appName=Chatty

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here

# Frontend
FRONTEND_URL=http://localhost:5173

# Email Service (Choose one)
EMAIL_SERVICE=resend
RESEND_API_KEY=re_your_resend_api_key_here
FROM_EMAIL=noreply@yourdomain.com

# OR for SMTP fallback
# EMAIL_SERVICE=smtp
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASS=your-app-password

# Twilio (for 2FA)
TWILIO_SID=AC_your_twilio_sid_here
TWILIO_TOKEN=your_twilio_token_here
TWILIO_VERIFY_SID=VA_your_verify_service_sid_here

# Server
NODE_ENV=development
PORT=5000
```

## 🎯 Benefits of Resend vs Gmail SMTP

| Feature | Resend | Gmail SMTP |
|---------|--------|------------|
| **Scalability** | ✅ Unlimited | ❌ 100-500/day limit |
| **Branding** | ✅ `noreply@chatty.com` | ❌ `yourname@gmail.com` |
| **Reliability** | ✅ 99.9% uptime | ❌ Personal account limits |
| **Security** | ✅ API keys | ❌ App passwords |
| **Analytics** | ✅ Delivery tracking | ❌ No insights |
| **Cost** | ✅ Free tier available | ❌ Personal account risk |

## 🛠️ Implementation Details

The email service now supports both Resend and SMTP with automatic fallback:

```javascript
// emailService.js automatically detects EMAIL_SERVICE setting
if (EMAIL_SERVICE === 'resend') {
  // Uses Resend API for transactional emails
  await resend.emails.send({
    from: 'noreply@chatty.com',
    to: user.email,
    subject: 'Your Chatty Data Export',
    html: emailTemplate
  });
} else {
  // Falls back to SMTP (Gmail, etc.)
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Your Chatty Data Export',
    html: emailTemplate
  });
}
```

## 🔒 Security Considerations

1. **Domain Verification**: Verify your domain with Resend for better deliverability
2. **SPF/DKIM**: Set up proper DNS records for email authentication
3. **API Keys**: Store securely, never commit API keys to version control
4. **Rate Limiting**: Resend handles rate limiting automatically

## 🚨 Migration from Gmail SMTP

If you're currently using Gmail SMTP:

1. **Immediate**: Set `EMAIL_SERVICE=smtp` to continue using Gmail temporarily
2. **Short-term**: Sign up for Resend and verify your domain
3. **Long-term**: Update `EMAIL_SERVICE=resend` and remove Gmail credentials

## 📊 Monitoring & Analytics

With Resend, you get:
- Email delivery status
- Open rates
- Click tracking
- Bounce handling
- Suppression lists

## 🆘 Troubleshooting

### Common Issues:

1. **"Resend API key not configured"**
   - Check `RESEND_API_KEY` environment variable
   - Verify API key is correct

2. **"Email service failed"**
   - Check domain verification in Resend dashboard
   - Verify `FROM_EMAIL` matches verified domain

3. **"SMTP authentication failed"**
   - Check Gmail app password (not regular password)
   - Enable 2FA on Gmail account
   - Use app-specific password

### Testing Email Service:

```bash
# Test the export endpoint
curl -X POST http://localhost:5000/api/export/request \
  -H "Content-Type: application/json" \
  -c cookies.txt
```

## 🎉 Next Steps

1. **Set up Resend account** and verify your domain
2. **Update environment variables** with Resend credentials
3. **Test email delivery** with the export function
4. **Monitor email analytics** in Resend dashboard
5. **Remove Gmail SMTP** configuration once Resend is working
