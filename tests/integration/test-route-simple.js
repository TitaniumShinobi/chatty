#!/usr/bin/env node

// Test just the route definition in isolation
import express from 'express';

const router = express.Router();

console.log('Starting route definition test...');

try {
  // This should work if there are no syntax errors
  router.post("/conversations/:sessionId/messages", async (req, res) => {
    console.log("🎯 POST route HIT!");
    res.json({ ok: true });
  });
  
  console.log('✅ Route defined successfully!');
  
  // Test if we can access the route
  const routes = router.stack || [];
  console.log('Router stack length:', routes.length);
  
  routes.forEach((layer, index) => {
    if (layer.route && layer.route.path && layer.route.path.includes('messages')) {
      console.log(`✅ Found route at index ${index}:`, {
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      });
    }
  });
  
} catch (error) {
  console.error('❌ Error defining route:', error);
  console.error('Stack:', error.stack);
}