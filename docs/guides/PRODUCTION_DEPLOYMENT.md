# Production Deployment Guide

## 🚀 **Production Environment Setup**

### **1. Environment Variables**
Copy `production.env.example` to `.env` and update with your actual values:

```bash
# Copy the production template
cp production.env.example .env

# Edit with your actual values
nano .env
```

### **2. Required Production Values**

#### **Database**
- Update `MONGODB_URI` to your production MongoDB cluster
- Use MongoDB Atlas or your production database

#### **OAuth Configuration**
- Get Google OAuth credentials from Google Cloud Console
- Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Set `GOOGLE_CALLBACK_URL` to your production domain

#### **Security**
- Generate strong, unique JWT secrets
- Use HTTPS in production
- Update all URLs to production domains

### **3. Production Security Features**

#### **Automatic Security Changes**
- Debug endpoints disabled in production
- Debug backup endpoints disabled
- Export routes require authentication
- Cookie security enabled (HTTPS only)
- CORS configured for production domain
- Error handling for uncaught exceptions

#### **Manual Security Checklist**
- [ ] Use strong, unique JWT secrets
- [ ] Enable HTTPS
- [ ] Update all URLs to production domains
- [ ] Configure production database
- [ ] Set up proper logging
- [ ] Configure rate limiting
- [ ] Set up monitoring

### **4. Deployment Steps**

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Set production environment:**
   ```bash
   export NODE_ENV=production
   ```

3. **Start the server:**
   ```bash
   npm run server
   ```

### **5. Production URLs**

Update these in your `.env` file:
- `FRONTEND_URL=https://your-domain.com`
- `GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback`
- `PUBLIC_CALLBACK_BASE=https://your-domain.com`
- `POST_LOGIN_REDIRECT=https://your-domain.com`

### **6. Google OAuth Setup**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `https://your-domain.com/api/auth/google/callback`
6. Copy Client ID and Client Secret to your `.env` file

### **7. Production Checklist**

- [ ] Environment variables configured
- [ ] Database connection working
- [ ] OAuth credentials set up
- [ ] HTTPS enabled
- [ ] CORS configured for production domain
- [ ] Error handling enabled
- [ ] Logging configured
- [ ] Monitoring set up
- [ ] Backup strategy in place

## 🔧 **Development vs Production Differences**

| Feature | Development | Production |
|---------|-------------|------------|
| Debug endpoints | ✅ Enabled | ❌ Disabled |
| Debug backups | ✅ Enabled | ❌ Disabled |
| Export auth | ❌ Bypassed | ✅ Required |
| Cookie security | ❌ HTTP allowed | ✅ HTTPS only |
| CORS | localhost:5173 | Production domain |
| Error handling | Basic | Enhanced |
| Logging | Verbose | Minimal |

## 🚨 **Important Notes**

- **Never commit `.env` files to git**
- **Use strong, unique secrets in production**
- **Enable HTTPS in production**
- **Test OAuth flow in production**
- **Monitor error logs**
- **Set up proper backup strategy**
