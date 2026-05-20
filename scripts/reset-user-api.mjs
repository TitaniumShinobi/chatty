#!/usr/bin/env node

/**
 * Simple User Reset Script
 * Uses the existing server's database connection
 */

// Since the server is running, let's try a different approach
// We'll create a simple HTTP request to reset the user

const TARGET_EMAIL = process.env.TARGET_EMAIL || process.env.CHATTY_TEST_EMAIL || '';

async function resetUserViaAPI() {
  try {
    console.log('🔄 Attempting to reset user via API...');
    
    // First, let's try to find the user with a different approach
    // Since we know the user exists (duplicate key error), let's try to reset it
    
    const response = await fetch(`http://localhost:5000/api/reset-user/${TARGET_EMAIL}`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ User reset successfully!');
      console.log('📊 Reset result:', data);
    } else {
      console.log('❌ Reset failed:', data.error);
      
      // If the API method doesn't work, let's try a different approach
      console.log('🔄 Trying alternative approach...');
      
      // We know the user exists because of the duplicate key error
      // Let's try to create a simple reset by attempting to sign up again
      // but first we need to understand why findUserByEmail isn't working
      
      console.log('💡 The user exists in the database (duplicate key error)');
      console.log('💡 But findUserByEmail is not finding it');
      console.log('💡 This suggests the user might have a different status or structure');
      
      // Let's try to get more info about the user
      const debugResponse = await fetch(`http://localhost:5000/api/debug-user/${TARGET_EMAIL}`);
      const debugData = await debugResponse.json();
      
      console.log('🔍 Debug info:', debugData);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the reset
console.log('🚀 Starting user reset process...');
console.log(`🎯 Target email: ${TARGET_EMAIL}`);
console.log('');

resetUserViaAPI().then(() => {
  console.log('');
  console.log('🎉 Reset process completed!');
}).catch(error => {
  console.error('💥 Reset failed:', error);
});


