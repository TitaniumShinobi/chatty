// Test parity using built files
import { makeCliAI } from '../dist/cli-core.cjs';

async function testParity() {
  console.log('Testing CLI vs Web parity...');
  
  // Test CLI
  const cliAI = makeCliAI();
  const cliResults = [];
  
  const testInputs = ["hello", "you don't have memory?", "monday, confirm tether"];
  
  for (const input of testInputs) {
    const result = await cliAI.process(input);
    cliResults.push({ input, result });
  }
  
  console.log('CLI Results:');
  console.log(JSON.stringify(cliResults, null, 2));
  
  // Test that we get consistent results
  const cliAI2 = makeCliAI();
  const cliResults2 = [];
  
  for (const input of testInputs) {
    const result = await cliAI2.process(input);
    cliResults2.push({ input, result });
  }
  
  const equal = JSON.stringify(cliResults) === JSON.stringify(cliResults2);
  console.log('\nCLI Consistency Test:', equal ? 'PASS' : 'FAIL');
  
  if (!equal) {
    console.log('CLI Results 1:', JSON.stringify(cliResults, null, 2));
    console.log('CLI Results 2:', JSON.stringify(cliResults2, null, 2));
  }
}

testParity().catch(console.error);
