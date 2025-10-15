#!/usr/bin/env node

// Test script to demonstrate the new reasoning engine
import { makeCliAI } from '../dist/cli-core.cjs';

const ai = makeCliAI();

const testCases = [
  "Tell me a funny story about a cat",
  "Explain how photosynthesis works",
  "Plan a road trip to California",
  "I'm feeling overwhelmed with work",
  "Write a poem about rain",
  "How do I debug JavaScript errors?"
];

console.log('🧠 REASONING ENGINE TEST');
console.log('========================\n');

for (const input of testCases) {
  console.log(`Input: "${input}"`);
  try {
    const result = await ai.process(input);
    console.log('Response:');
    result.forEach(packet => {
      console.log(`  ${packet.op}: ${JSON.stringify(packet.payload, null, 2)}`);
    });
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
  console.log('---\n');
}

console.log('✅ Reasoning engine test completed!');
