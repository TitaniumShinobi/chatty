#!/usr/bin/env node

/**
 * Test script for mongoose initialization
 * Run this to verify the connection works before starting the server
 */

import { waitForMongooseReady, isMongooseConnected, mongooseHealthCheck } from './lib/initMongoose.js';

async function testMongooseConnection() {
  console.log('🧪 Testing mongoose initialization...');
  
  try {
    // Test connection
    await waitForMongooseReady();
    
    console.log('✅ Mongoose connection test passed!');
    console.log(`🔗 Connected: ${isMongooseConnected()}`);
    
    // Test health check
    const health = await mongooseHealthCheck();
    console.log('🏥 Health check:', health);
    
    // Test user creation
    const mongoose = await import('mongoose');
    const User = (await import('./models/User.js')).default;
    
    // Clean up any existing test user first
    await User.deleteOne({ email: 'test@example.com' });
    
    const testUser = await User.create({
      id: 'test_' + Date.now(),
      email: 'test@example.com',
      name: 'Test User',
      constructId: 'HUMAN-TEST-001',
      vvaultPath: '/vvault/users/test_001/',
      status: 'active',
      uid: 'test_uid_' + Date.now() // Ensure unique uid
    });
    
    console.log('✅ Test user created:', testUser.email);
    console.log('   Construct ID:', testUser.constructId);
    console.log('   VVAULT Path:', testUser.vvaultPath);
    
    // Clean up
    await User.deleteOne({ _id: testUser._id });
    console.log('✅ Test user cleaned up');
    
    console.log('🎉 All tests passed! Mongoose is ready for production.');
    
  } catch (error) {
    console.error('❌ Mongoose connection test failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📊 Connection closed');
  }
}

// Run test
testMongooseConnection().catch(console.error);
