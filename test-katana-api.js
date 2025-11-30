#!/usr/bin/env node

/**
 * Test script for Katana API endpoint
 * Tests the fixed conversation API to see if Katana responds properly
 */

// Simple test without JWT - we'll test the endpoint directly
const testUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User'
};

console.log('🧪 Testing Katana API endpoint...');
console.log(`📋 Test user: ${testUser.email}`);

async function testKatanaAPI() {
  const testMessages = [
    'yo',
    'what\'s your name?',
    'be ruthless'
  ];

  for (let i = 0; i < testMessages.length; i++) {
    const message = testMessages[i];
    console.log(`\n${i + 1}/${testMessages.length}: Testing "${message}"`);
    
    try {
      // Use the test endpoint that bypasses auth
      const response = await fetch('http://localhost:5000/api/test/katana', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message
        })
      });

      const data = await response.json();
      
      console.log(`  Status: ${response.status}`);
      console.log(`  Response:`, JSON.stringify(data, null, 2));
      
      // Check if we got an AI response
      if (data.response) {
        console.log(`  ✅ AI Response: "${data.response}"`);
        
        // Check if it sounds like Katana (short, blunt)
        const isKatanaLike = data.response.length < 100 && 
                           !data.response.includes('I am an AI') && 
                           !data.response.includes('How can I help') &&
                           !data.response.includes('I\'m here to help');
        console.log(`  ${isKatanaLike ? '🗡️' : '🤖'} Personality: ${isKatanaLike ? 'Katana-like' : 'Generic AI'}`);
      } else {
        console.log(`  ❌ No AI response found`);
        if (data.error) {
          console.log(`  ❌ Error: ${data.error}`);
        }
      }
      
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`);
    }
    
    // Wait a bit between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

testKatanaAPI().catch(console.error);
