#!/usr/bin/env node

// Test script to check if POST route is registered
import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Import the vvault routes
try {
  const vvaultRoutes = require('./server/routes/vvault.js');
  
  // Create a test app
  const app = express();
  
  // Mount the routes
  app.use('/api/vvault', vvaultRoutes);
  
  // Get the routes stack
  const router = app._router;
  const routes = [];
  
  if (router && router.stack) {
    router.stack.forEach((middleware) => {
      if (middleware.route) {
        // Routes registered directly on the app
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        // Routes from router middleware
        if (middleware.handle && middleware.handle.stack) {
          middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
              routes.push({
                path: handler.route.path,
                methods: Object.keys(handler.route.methods)
              });
            }
          });
        }
      }
    });
  }
  
  console.log('=== VVAULT Routes Found ===');
  routes.forEach(route => {
    console.log(`${route.methods.join(', ')} ${route.path}`);
  });
  
  // Check for our specific route
  const targetRoute = routes.find(r => 
    r.path.includes('conversations') && 
    r.path.includes('messages') && 
    r.methods.includes('post')
  );
  
  if (targetRoute) {
    console.log('\n✅ POST /conversations/:sessionId/messages route is REGISTERED!');
  } else {
    console.log('\n❌ POST /conversations/:sessionId/messages route is MISSING!');
    console.log('Looking for routes with "conversations" and "messages":');
    const messageRoutes = routes.filter(r => 
      r.path.includes('conversations') || r.path.includes('messages')
    );
    messageRoutes.forEach(route => {
      console.log(`  ${route.methods.join(', ')} ${route.path}`);
    });
  }
  
} catch (error) {
  console.error('Error loading vvault routes:', error);
  console.error('Stack:', error.stack);
}