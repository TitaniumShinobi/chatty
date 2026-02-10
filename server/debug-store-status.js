#!/usr/bin/env node

// Debug script to check Store and MongoDB status
import { waitForMongooseReady, isMongooseConnected, getConnectionStatus } from "./lib/initMongoose.js";
import mongoose from 'mongoose';

console.log('🔍 Debug: Store and MongoDB Status Check');
console.log('==========================================');

console.log('\n📍 Environment Variables:');
console.log(`MONGODB_AVAILABLE: ${process.env.MONGODB_AVAILABLE}`);
console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? 'SET' : 'NOT SET'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

console.log('\n🔌 Mongoose Connection Status:');
console.log(`readyState: ${mongoose.connection.readyState} (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)`);
console.log(`isConnected: ${isMongooseConnected()}`);

const status = getConnectionStatus();
console.log(`\n📊 Connection Details:`);
console.log(`  Host: ${status.host}`);
console.log(`  Port: ${status.port}`);
console.log(`  Database: ${status.name}`);
console.log(`  Connected: ${status.isConnected}`);

// Try to connect if not connected
if (!isMongooseConnected()) {
  console.log('\n🔄 Attempting to connect...');
  try {
    await waitForMongooseReady();
    console.log('✅ Connection successful!');
    console.log(`MONGODB_AVAILABLE after connect: ${process.env.MONGODB_AVAILABLE}`);
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
  }
}

// Test Store behavior
console.log('\n🏪 Testing Store behavior...');
try {
  const { Store } = await import("./store.js");
  
  console.log(`MONGODB_AVAILABLE before Store methods: ${process.env.MONGODB_AVAILABLE}`);
  
  // Test a simple Store operation
  console.log('\n🧪 Testing Store.findUserByEmail (should show which mode is used)...');
  const result = await Store.findUserByEmail('test@example.com');
  console.log(`Result: ${result ? 'Found user' : 'No user found'}`);
  
} catch (error) {
  console.log('❌ Error testing Store:', error.message);
}

console.log('\n✅ Debug complete');
process.exit(0);