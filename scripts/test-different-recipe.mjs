#!/usr/bin/env node

// Test script for a different recipe request
import { makeCliAI } from '../dist/cli-core.cjs';

const ai = makeCliAI();

const testRecipes = [
  "How do I make a simple vanilla cake?",
  "Can you give me a bread recipe?",
  "I want to cook some pasta"
];

console.log('🍽️ MULTIPLE RECIPE TEST');
console.log('========================\n');

for (const prompt of testRecipes) {
  console.log(`Input: "${prompt}"`);
  try {
    const result = await ai.process(prompt);
    console.log('Response:');
    result.forEach(packet => {
      if (packet.op === 'answer.v1') {
        console.log(`  ${packet.op}: ${packet.payload.content.substring(0, 200)}...`);
      } else {
        console.log(`  ${packet.op}: ${JSON.stringify(packet.payload, null, 2)}`);
      }
    });
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
  console.log('---\n');
}

console.log('✅ Multiple recipe test completed!');
