#!/usr/bin/env node

// Test script for the /chatty-sync API endpoint
const https = require('http');

const testData = {
  prompt: "Hello, this is a test message",
  seat: "zen", 
  history: [],
  userId: "test-user",
  attachments: [],
  uiContext: {}
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/chatty-sync-test',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Testing /chatty-sync-test endpoint...');
console.log('Request data:', testData);

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    try {
      const parsed = JSON.parse(data);
      console.log('Parsed response:', parsed);
    } catch (e) {
      console.log('Failed to parse JSON response');
    }
  });
});

req.on('error', (e) => {
  console.error(`Request failed: ${e.message}`);
});

req.write(postData);
req.end();