#!/usr/bin/env node

import { runAllTests } from './testAuth.js';

console.log('🧪 Chatty Backend Memory Testing Suite');
console.log('=====================================\n');

// Check if server is running
const checkServer = async () => {
  try {
    const response = await fetch('http://localhost:5000/health');
    if (response.ok) {
      console.log('✅ Server is running on port 5000');
      return true;
    }
  } catch (error) {
    console.log('❌ Server is not running on port 5000');
    console.log('Please start the server first: npm run dev');
    return false;
  }
};

// Main test execution
const main = async () => {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    process.exit(1);
  }
  
  console.log('\n🚀 Starting tests...\n');
  
  try {
    await runAllTests();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
};

main();
