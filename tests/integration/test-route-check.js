import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const routes = require('./server/routes/vvault.js');
const express = require('express');
const app = express();
app.use('/api/vvault', routes);

// Check routes
const router = app._router;
let found = false;
if (router && router.stack) {
  router.stack.forEach((middleware) => {
    if (middleware.route) {
      if (middleware.route.path.includes('conversations') && middleware.route.path.includes('messages') && middleware.route.methods.post) {
        console.log('✅ POST /conversations/:sessionId/messages route is REGISTERED!');
        found = true;
      }
    } else if (middleware.name === 'router' && middleware.handle && middleware.handle.stack) {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route && handler.route.path.includes('conversations') && handler.route.path.includes('messages') && handler.route.methods.post) {
          console.log('✅ POST /conversations/:sessionId/messages route is REGISTERED!');
          found = true;
        }
      });
    }
  });
}

if (!found) {
  console.log('❌ POST /conversations/:sessionId/messages route is MISSING');
  console.log('Available routes with conversations or messages:');
  if (router && router.stack) {
    router.stack.forEach((middleware) => {
      if (middleware.route && (middleware.route.path.includes('conversations') || middleware.route.path.includes('messages'))) {
        console.log(`  ${Object.keys(middleware.route.methods).join(', ')} ${middleware.route.path}`);
      }
    });
  }
}