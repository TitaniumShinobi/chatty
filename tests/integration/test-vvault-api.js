#!/usr/bin/env node
/**
 * Test script to diagnose VVAULT API 500 errors
 * Run: node test-vvault-api.js
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { readConversations } = require('./vvaultConnector/readConversations.js');
const { VVAULT_ROOT } = require('./vvaultConnector/config.js');

async function testReadConversations() {
  console.log('🧪 Testing VVAULT readConversations...');
  console.log(`📁 VVAULT_ROOT: ${VVAULT_ROOT}`);
  console.log(`📧 Test email: dwoodson92@gmail.com\n`);
  
  try {
    console.log('1️⃣ Testing with email lookup...');
    const conversations = await readConversations('dwoodson92@gmail.com');
    console.log(`✅ Success! Found ${conversations.length} conversations`);
    if (conversations.length > 0) {
      console.log(`   First conversation: ${conversations[0].title} (${conversations[0].messages.length} messages)`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    if (error.originalError) {
      console.error('❌ Original error:', error.originalError.message);
    }
    if (error.fallbackError) {
      console.error('❌ Fallback error:', error.fallbackError.message);
    }
    process.exit(1);
  }
  
  try {
    console.log('\n2️⃣ Testing with null (search all users)...');
    const allConversations = await readConversations(null);
    console.log(`✅ Success! Found ${allConversations.length} conversations`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    process.exit(1);
  }
  
  console.log('\n✅ All tests passed!');
}

testReadConversations();

