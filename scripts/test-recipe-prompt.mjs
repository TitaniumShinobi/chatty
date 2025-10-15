#!/usr/bin/env node

// Test script for a recipe request
import { makeCliAI } from '../dist/cli-core.cjs';

const ai = makeCliAI();

const recipePrompt = "Can you give me a simple recipe for chocolate chip cookies?";

console.log('🍪 RECIPE REQUEST TEST');
console.log('======================\n');

console.log(`Input: "${recipePrompt}"`);
try {
  const result = await ai.process(recipePrompt);
  console.log('Response:');
  result.forEach(packet => {
    console.log(`  ${packet.op}: ${JSON.stringify(packet.payload, null, 2)}`);
  });
} catch (error) {
  console.log(`  Error: ${error.message}`);
}

console.log('\n✅ Recipe test completed!');
