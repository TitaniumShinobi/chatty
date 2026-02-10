#!/usr/bin/env node

// Test script to demonstrate enhanced Chatty capabilities
import { makeCliAI } from '../dist/cli-core.cjs';

const ai = makeCliAI();

const testCases = [
  "I'm feeling really overwhelmed with work",
  "Can you help me debug this JavaScript function?",
  "I want to learn about machine learning",
  "I'm struggling with anxiety about the future",
  "Let's write a creative story together",
  "I need to organize my project timeline"
];

console.log('🎯 ENHANCED CHATTY CAPABILITIES TEST');
console.log('=====================================\n');

for (const input of testCases) {
  console.log(`Input: "${input}"`);
  try {
    const result = await ai.process(input);
    console.log('Response:');
    result.forEach(packet => {
      console.log(`  ${packet.op}: ${packet.payload.content}`);
    });
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
  console.log('---\n');
}

console.log('✅ Enhanced system test completed!');
