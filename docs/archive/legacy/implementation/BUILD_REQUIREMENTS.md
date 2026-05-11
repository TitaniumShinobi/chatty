# Build Requirements for Zen Delegation

## Overview

Production deployments of Chatty require compiled JavaScript artifacts for OptimizedZenProcessor. The server routes attempt to load from compiled JS first, falling back to TypeScript source only in development (which requires tsx runtime).

## Build Process

### Prerequisites

- Node.js installed
- TypeScript compiler (`tsc`) available
- All dependencies installed (`npm install`)

### Building OptimizedZenProcessor

From the `chatty/server` directory:

```bash
cd server
npm run build
```

This compiles TypeScript files (including `optimizedZen.ts` and `toneModulation.ts`) to JavaScript in the `dist/` directory.

### Build Output

After building, the following file should exist:

```
server/dist/engine/optimizedZen.js
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Run `cd server && npm run build`
- [ ] Verify `server/dist/engine/optimizedZen.js` exists
- [ ] Verify `server/dist/engine/toneModulation.js` exists (if used)
- [ ] Set `NODE_ENV=production` environment variable
- [ ] Test that server starts without errors

## Fallback Behavior

### Development Mode

If compiled JS is not found in development:
- Falls back to TypeScript source import (requires tsx runtime)
- Logs warning but continues operation
- Suitable for local development

### Production Mode

If compiled JS is not found in production:
- **ERROR**: Server will fail to start or throw error when Zen delegation is attempted
- Error message: "OptimizedZenProcessor build artifacts missing in production"
- **Action Required**: Run `cd server && npm run build` before deployment

## Runtime Verification

The `loadOptimizedZenProcessor()` function in `server/routes/conversations.js`:

1. Checks if `dist/engine/optimizedZen.js` exists
2. In production: Throws error if missing
3. In development: Logs warning and falls back to TS source
4. Attempts to import compiled JS first
5. Falls back to TS source if JS import fails

## CI/CD Integration

### Build Step

Add to CI/CD pipeline:

```yaml
- name: Build server TypeScript
  run: |
    cd server
    npm run build
    
- name: Verify build artifacts
  run: |
    if [ ! -f "server/dist/engine/optimizedZen.js" ]; then
      echo "ERROR: Build artifacts missing after build step"
      exit 1
    fi
    echo "✅ Build artifacts verified"

- name: Check build health endpoint (if server running)
  run: |
    # If server is running in CI, check health endpoint
    curl -f http://localhost:5000/api/health/build || echo "Health check skipped (server not running)"
```

### Pre-deployment Check

Add verification step before deployment:

```bash
if [ ! -f "server/dist/engine/optimizedZen.js" ]; then
  echo "ERROR: Build artifacts missing. Run: cd server && npm run build"
  exit 1
fi
```

### CI Build Verification (Required)

**Status**: CI configuration not yet present. When setting up CI, ensure:

1. Build step runs `cd server && npm run build`
2. Verification step checks `server/dist/engine/optimizedZen.js` exists
3. Build fails if artifacts missing
4. Health endpoint check (if server runs in CI)

**Location**: Create `.github/workflows/ci.yml` or equivalent CI configuration file

## Troubleshooting

### Error: "Build artifacts missing in production"

**Cause**: Compiled JS not found, production mode detected

**Solution**: 
1. Run `cd server && npm run build`
2. Verify `server/dist/engine/optimizedZen.js` exists
3. Redeploy

### Warning: "Using TS source in production"

**Cause**: Compiled JS import failed, falling back to TS source

**Solution**:
1. Check build output for errors
2. Verify TypeScript compilation succeeded
3. Check file permissions on `dist/` directory
4. Rebuild: `cd server && npm run build`

### Import fails for both JS and TS

**Cause**: Both compiled JS and TS source imports failing

**Solution**:
1. Check file paths are correct
2. Verify TypeScript source files exist
3. Check module resolution configuration
4. Verify all dependencies are installed

## Related Documentation

- [Zen Delegation Testing](./ZEN_DELEGATION_TESTING.md)
- [Production Hardening Plan](../.cursor/plans/production_hardening_for_zen_delegation_1ba3b442.plan.md)

## Last Updated

2024-12-19 - Initial documentation created

