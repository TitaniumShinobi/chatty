#!/usr/bin/env node

// Test script for dynamic story generation
import { makeCliAI } from '../dist/cli-core.cjs';

const ai = makeCliAI();

const testCases = [
  "Tell me a funny story about spiders in the summer rain.",
  "Write a poem about cats in winter",
  "Create a story about dogs and autumn leaves",
  "Tell me a tale about birds in a storm"
];

console.log('📚 DYNAMIC STORY GENERATION TEST');
console.log('=================================\n');

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

console.log('✅ Story generation test completed!');
