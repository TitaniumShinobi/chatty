# Google Auth 500 Error Resolution Rubric

## Problem Statement
**Issue**: `GET http://localhost:5173/api/auth/google net::ERR_HTTP_RESPONSE_CODE_FAILURE 500 (Internal Server Error)`

**Context**: User experiencing recurring Google authentication failures with generic 500 errors and no clear diagnostic information.

## Diagnostic Methodology

### Phase 1: Initial Assessment
1. **Identify the exact endpoint failing**
   - Confirmed `/api/auth/google` endpoint returning 500
   - Distinguished from callback endpoint `/api/auth/google/callback`

2. **Locate the server-side implementation**
   - Found OAuth logic in `chatty/server/server.js` lines 78-103
   - Identified existing basic error handling but insufficient logging

3. **Avoid assumptions about root cause**
   - Did NOT assume environment variables were missing
   - Did NOT assume Google Cloud Console misconfiguration
   - Focused on gathering actual diagnostic data first

### Phase 2: Systematic Enhancement Strategy

#### Step 1: Enhanced Error Logging
**File**: `chatty/server/server.js`
**Changes**:
```javascript
app.get("/api/auth/google", authLimiter, (req, res) => {
  console.log('🔍 [OAuth] /api/auth/google endpoint hit');
  try {
    console.log('🔍 [OAuth] Environment check:', {
      has_client_id: !!process.env.GOOGLE_CLIENT_ID,
      has_client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      oauth_object: {
        client_id: !!OAUTH.client_id,
        client_secret: !!OAUTH.client_secret,
        redirect_uri: OAUTH.redirect_uri
      }
    });
    // ... enhanced error logging throughout
  } catch (error) {
    console.error('❌ [OAuth] Unexpected error:', error);
    console.error('❌ [OAuth] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});
```

**Rationale**: Without detailed logging, 500 errors are black boxes. Enhanced logging reveals exactly where failures occur.

#### Step 2: Startup Validation
**Implementation**:
```javascript
function validateOAuthConfig() {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ [OAuth] Missing required environment variables:', missing);
    return false;
  }
  
  console.log('✅ [OAuth] All required environment variables are set');
  return true;
}

const oauthValid = validateOAuthConfig();
```

**Rationale**: Catch configuration issues at server startup rather than during user authentication attempts.

#### Step 3: Health Check Endpoint
**Implementation**:
```javascript
app.get("/api/auth/google/health", (req, res) => {
  res.json({
    oauth_configured: !!OAUTH.client_id && !!OAUTH.client_secret,
    redirect_uri: OAUTH.redirect_uri,
    environment: process.env.NODE_ENV || 'development',
    client_id_present: !!OAUTH.client_id,
    client_secret_present: !!OAUTH.client_secret,
    validation_passed: oauthValid
  });
});
```

**Rationale**: Provides programmatic way to check OAuth configuration without triggering authentication flow.

#### Step 4: Frontend Error Handling
**Implementation**:
```typescript
export function loginWithGoogle() {
  fetch("/api/auth/google/health")
    .then(r => r.json())
    .then(health => {
      if (!health.oauth_configured) {
        console.error('❌ [Auth] OAuth not properly configured:', health);
        alert('Google authentication is not properly configured. Please contact support.');
        return;
      }
      window.location.href = "/api/auth/google";
    })
    .catch(error => {
      console.error('❌ [Auth] Failed to check OAuth health:', error);
      window.location.href = "/api/auth/google";
    });
}
```

**Rationale**: Provide immediate feedback to users when OAuth is misconfigured, rather than silent failures.

## Resolution Framework

### 1. **Never Guess - Always Diagnose**
- Implement comprehensive logging before attempting fixes
- Capture environment state, configuration values, and error contexts
- Use structured logging with consistent prefixes (`🔍 [OAuth]`, `❌ [OAuth]`, `✅ [OAuth]`)

### 2. **Fail Fast and Fail Clearly**
- Validate configuration at startup
- Provide specific error messages instead of generic 500s
- Log both successful and failed states for comparison

### 3. **Create Diagnostic Tools**
- Health check endpoints for programmatic testing
- Startup validation functions
- Frontend error handling with user-friendly messages

### 4. **Incremental Enhancement Strategy**
1. **Logging first** - See what's actually happening
2. **Validation second** - Catch issues early
3. **Health checks third** - Enable external diagnosis
4. **User experience last** - Improve error messaging

## Common OAuth 500 Error Causes

### Environment Variable Issues
- Missing `GOOGLE_CLIENT_ID`
- Missing `GOOGLE_CLIENT_SECRET`
- Incorrect `PUBLIC_CALLBACK_BASE` or `CALLBACK_PATH`

### Configuration Mismatches
- Google Cloud Console redirect URI doesn't match server configuration
- Client ID/Secret from wrong Google Cloud project
- Authorized JavaScript origins not configured

### Server Issues
- Server not running on expected port
- Missing dependencies (`randomBytes`, `dotenv`)
- Rate limiting blocking requests
- CORS configuration issues

### Network Issues
- Proxy configuration blocking OAuth requests
- Firewall blocking Google OAuth endpoints
- DNS resolution issues

## Testing Protocol

### 1. Health Check Test
```bash
curl http://localhost:5000/api/auth/google/health
```
Expected response should show `oauth_configured: true`

### 2. Direct Endpoint Test
```bash
curl -v http://localhost:5000/api/auth/google
```
Should redirect to Google OAuth URL or return specific error

### 3. Server Log Analysis
- Check for startup validation messages
- Look for detailed OAuth endpoint logs
- Verify environment variable status

### 4. Frontend Integration Test
- Test Google login button
- Verify health check integration
- Confirm error message display

## Prevention Strategies

### 1. Environment Variable Management
- Use `.env.example` file with required variables
- Add startup validation for all OAuth providers
- Document environment variable requirements

### 2. Configuration Documentation
- Maintain Google Cloud Console setup guide
- Document redirect URI requirements
- Keep client ID/secret rotation procedures

### 3. Monitoring and Alerting
- Log OAuth configuration status on startup
- Monitor OAuth endpoint success rates
- Alert on repeated authentication failures

### 4. Development Workflow
- Test OAuth configuration in development
- Validate environment variables in CI/CD
- Include OAuth health checks in deployment verification

## Success Metrics

### Immediate Resolution
- Server logs show specific error cause
- Health endpoint returns configuration status
- User receives clear error messages instead of generic 500s

### Long-term Prevention
- OAuth configuration issues caught at startup
- Developers can quickly diagnose authentication problems
- Users get helpful error messages for misconfiguration

## Files Modified
- `chatty/server/server.js` - Enhanced OAuth endpoint logging and validation
- `chatty/src/lib/auth.ts` - Improved frontend error handling

## Key Takeaways

1. **Generic 500 errors are useless** - Always implement detailed logging first
2. **Configuration validation should happen at startup** - Don't wait for user authentication attempts
3. **Health check endpoints are invaluable** - Enable programmatic diagnosis
4. **User experience matters** - Provide clear error messages, not technical jargon
5. **Systematic approach beats guesswork** - Follow diagnostic methodology consistently

---

*This rubric documents the resolution of Google Auth 500 errors on November 26, 2024. Use this methodology for similar authentication issues.*
