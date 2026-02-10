#!/usr/bin/env node

/**
 * Test script for Chatty signup API endpoint
 * Run with: node test-signup-api.js
 */

const API_BASE = 'http://localhost:5000'; // Adjust if your server runs on different port

async function testSignupAPI() {
  console.log('🧪 Testing Chatty Signup API\n');

  const testUser = {
    email: 'test@example.com',
    password: 'testpassword123',
    name: 'Test User'
  };

  try {
    console.log('📤 Sending signup request...');
    console.log(`   Email: ${testUser.email}`);
    console.log(`   Name: ${testUser.name}`);
    
    const response = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser)
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Signup successful!');
      console.log(`   Message: ${data.message}`);
      console.log(`   User ID: ${data.userId}`);
      console.log('\n📧 Check your email for verification link');
    } else {
      console.log('❌ Signup failed:');
      console.log(`   Error: ${data.error}`);
      console.log(`   Status: ${response.status}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Make sure your server is running on port 5000');
    console.log('   Start server with: npm run dev (or your start command)');
  }
}

// Run the test
testSignupAPI();
