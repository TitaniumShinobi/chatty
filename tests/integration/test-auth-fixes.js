#!/usr/bin/env node

// Test script to verify authentication fixes
const BASE_URL = 'http://localhost:5000';

async function testAuthenticationFixes() {
  console.log('🧪 Testing Chatty Authentication Fixes\n');
  
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'testpassword123';
  const testName = 'Test User';
  
  try {
    // Test 1: User Registration
    console.log('📝 Test 1: User Registration');
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: testName
      })
    });
    
    if (registerResponse.ok) {
      const registerData = await registerResponse.json();
      console.log('✅ Registration successful');
      console.log(`   User ID: ${registerData.user?.id}`);
      console.log(`   Email: ${registerData.user?.email}`);
    } else {
      const error = await registerResponse.text();
      console.log('❌ Registration failed:', error);
      return;
    }
    
    // Test 2: Duplicate Registration (Should Fail)
    console.log('\n📝 Test 2: Duplicate Registration (Should Fail)');
    const duplicateResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'differentpassword',
        name: 'Different User'
      })
    });
    
    if (!duplicateResponse.ok) {
      console.log('✅ Duplicate registration correctly rejected');
    } else {
      console.log('❌ Duplicate registration should have failed');
    }
    
    // Test 3: Login with Correct Password
    console.log('\n📝 Test 3: Login with Correct Password');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('✅ Login successful');
      console.log(`   User ID: ${loginData.user?.id}`);
      console.log(`   Email: ${loginData.user?.email}`);
    } else {
      console.log('❌ Login failed when it should have succeeded');
    }
    
    // Test 4: Login with Wrong Password (Should Fail)
    console.log('\n📝 Test 4: Login with Wrong Password (Should Fail)');
    const wrongPasswordResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'wrongpassword'
      })
    });
    
    if (!wrongPasswordResponse.ok) {
      console.log('✅ Wrong password correctly rejected');
    } else {
      console.log('❌ Wrong password should have failed');
    }
    
    console.log('\n🎉 Authentication tests completed!');
    console.log('\n📋 What to check in your server logs:');
    console.log('   - User registration events with email and ID');
    console.log('   - Login success/failure events');
    console.log('   - User session validation messages');
    
  } catch (error) {
    console.error('❌ Test script error:', error.message);
    console.log('\n💡 Make sure your server is running on port 5000');
  }
}

// Check if we can import fetch (Node 18+) or need to install node-fetch
if (typeof fetch === 'undefined') {
  console.log('❌ This script requires Node.js 18+ or install node-fetch');
  console.log('   Try: npm install node-fetch');
  console.log('   Or: Add "type": "module" to package.json');
  process.exit(1);
}

testAuthenticationFixes();