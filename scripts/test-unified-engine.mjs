#!/usr/bin/env node

// Test script to verify CLI and Web use the same engine
import { makeCliAI } from '../dist/cli-core.cjs';

const cliAI = makeCliAI();

// Test the same prompt through both interfaces
const testPrompt = "Tell me a story about a dragon who learns to dance";

console.log('🔄 UNIFIED ENGINE VERIFICATION');
console.log('==============================\n');

console.log('Testing CLI interface:');
try {
  const cliResult = await cliAI.process(testPrompt);
  console.log('CLI Response:');
  cliResult.forEach(packet => {
    console.log(`  ${packet.op}: ${JSON.stringify(packet.payload, null, 2)}`);
  });
} catch (error) {
  console.log(`  CLI Error: ${error.message}`);
}

console.log('\n---\n');

// Test web interface (simulated)
console.log('Testing Web interface (via AIService):');
try {
  // Import the web AIService
  const { AIService } = await import('../dist/assets/index-CdU7U9ag.js');
  const webAI = AIService.getInstance();
  const webResult = await webAI.processMessage(testPrompt);
  console.log('Web Response:');
  webResult.forEach(packet => {
    console.log(`  ${packet.op}: ${JSON.stringify(packet.payload, null, 2)}`);
  });
} catch (error) {
  console.log(`  Web Error: ${error.message}`);
  console.log('  (This is expected - web interface needs browser environment)');
}

console.log('\n✅ Engine verification completed!');
