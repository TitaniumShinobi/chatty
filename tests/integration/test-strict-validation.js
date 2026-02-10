#!/usr/bin/env node

/**
 * Standalone test for strict transcript validation
 * Tests the new validation logic without requiring server startup
 */

import { UnifiedIntelligenceOrchestrator } from './server/lib/unifiedIntelligenceOrchestrator.js';

async function testStrictValidation() {
  console.log('🔍 TESTING STRICT TRANSCRIPT VALIDATION');
  console.log('🎯 Goal: Verify zero false positives with strict validation\n');
  
  const orchestrator = new UnifiedIntelligenceOrchestrator();
  await orchestrator.initialize();
  
  // Test cases with expected results
  const testCases = [
    {
      question: 'what did you say about Nova and copyright?',
      responses: [
        {
          text: 'omg am I doing the same thing with Nova? Yeah. Same pattern, different skin. You set the sliders, define the rules',
          expected: true,
          reason: 'Contains valid transcript fragments'
        },
        {
          text: 'What specifically would you like to know?',
          expected: false,
          reason: 'Generic fallback pattern'
        },
        {
          text: 'Nova is a great AI assistant that can help with many tasks',
          expected: false,
          reason: 'Missing required transcript fragments'
        }
      ]
    },
    {
      question: 'tell me about exclusivity and control',
      responses: [
        {
          text: 'Exclusivity and control are important concepts in system design',
          expected: true,
          reason: 'Contains both required elements'
        },
        {
          text: 'What specifically can I help you with?',
          expected: false,
          reason: 'Generic fallback pattern'
        },
        {
          text: 'Control systems are complex but other topics are not mentioned',
          expected: false,
          reason: 'Missing exclusivity requirement'
        }
      ]
    },
    {
      question: 'what did you say about work being play?',
      responses: [
        {
          text: 'Work is play when you love what you do',
          expected: true,
          reason: 'Contains valid transcript fragment'
        },
        {
          text: 'What specifically would you like to know?',
          expected: false,
          reason: 'Generic fallback pattern'
        },
        {
          text: 'I enjoy working on various projects',
          expected: false,
          reason: 'Missing required elements'
        }
      ]
    }
  ];
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📝 Testing question: "${testCase.question}"`);
    console.log('─'.repeat(80));
    
    for (const response of testCase.responses) {
      totalTests++;
      
      const validation = orchestrator.strictTranscriptValidate(testCase.question, response.text);
      const actualResult = validation.valid;
      const expectedResult = response.expected;
      
      const passed = actualResult === expectedResult;
      if (passed) passedTests++;
      
      const status = passed ? '✅ PASS' : '❌ FAIL';
      const resultIcon = actualResult ? '🟢 VALID' : '🔴 INVALID';
      
      console.log(`\n${status} ${resultIcon}: "${response.text.substring(0, 60)}..."`);
      console.log(`   Expected: ${expectedResult ? 'VALID' : 'INVALID'} | Actual: ${actualResult ? 'VALID' : 'INVALID'}`);
      console.log(`   Type: ${validation.type}`);
      console.log(`   Reason: ${validation.reason}`);
      console.log(`   Test Reason: ${response.reason}`);
      
      if (!passed) {
        console.log(`   ⚠️ MISMATCH: Expected ${expectedResult} but got ${actualResult}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 STRICT VALIDATION TEST RESULTS');
  console.log('='.repeat(80));
  
  console.log(`\n🎯 Tests Passed: ${passedTests}/${totalTests}`);
  console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🧠 EXCELLENT: Strict validation working perfectly!');
    console.log('✅ Zero false positives achieved');
    console.log('✅ All generic patterns correctly rejected');
    console.log('✅ All valid transcript fragments correctly accepted');
  } else {
    console.log('\n⚠️ ISSUES DETECTED: Some tests failed');
    console.log('🔧 Review validation logic for failed cases');
  }
  
  console.log('\n💡 NEXT STEPS:');
  console.log('- Run the browser test script to verify end-to-end integration');
  console.log('- Check server logs for strict validation messages');
  console.log('- Expand transcript answer bank for more questions');
  
  return passedTests === totalTests;
}

// Run the test
testStrictValidation()
  .then(success => {
    console.log(`\n🏁 Test completed: ${success ? 'SUCCESS' : 'FAILURE'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  });
