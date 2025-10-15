#!/usr/bin/env node

// Test script for my own creative prompt
import { makeCliAI } from '../dist/cli-core.cjs';

const ai = makeCliAI();

const myPrompt = "Write a whimsical story about a robot who discovers emotions for the first time during a thunderstorm";

console.log('🤖 MY CREATIVE PROMPT TEST');
console.log('==========================\n');

console.log(`Input: "${myPrompt}"`);
try {
  const result = await ai.process(myPrompt);
  console.log('Response:');
  result.forEach(packet => {
    console.log(`  ${packet.op}: ${JSON.stringify(packet.payload, null, 2)}`);
  });
} catch (error) {
  console.log(`  Error: ${error.message}`);
}

console.log('\n✅ My prompt test completed!');
