#!/usr/bin/env node

// Test script to check the live server's Store behavior
console.log('🔍 Testing Live Server Store Behavior');
console.log('=====================================');

// Make a request to the server to trigger Store usage
async function testLiveStore() {
  try {
    const response = await fetch('http://localhost:5000/api/debug-store-status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Server response:', data);
    } else {
      console.log('❌ Server responded with error:', response.status, response.statusText);
      
      // If endpoint doesn't exist, test a simple health check
      const healthResponse = await fetch('http://localhost:5000/health');
      if (healthResponse.ok) {
        console.log('✅ Server is running (health check passed)');
        console.log('💡 Adding Store debugging endpoint might be needed');
      }
    }
  } catch (error) {
    console.log('❌ Error connecting to server:', error.message);
    console.log('💡 Server might not be running on port 5000');
  }
}

await testLiveStore();