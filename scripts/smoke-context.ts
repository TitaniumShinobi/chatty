#!/usr/bin/env tsx

// Smoke test for conversational context awareness
import { ConversationAI } from '../src/lib/conversationAI';

async function testConversationalContext() {
  console.log('🧪 Testing conversational context awareness...\n');
  
  const conversationAI = new ConversationAI();
  
  // Test 1: Greeting
  console.log('1️⃣ Testing greeting...');
  const greetingResponse = await conversationAI.processMessage('Hello there!');
  console.log('Response:', greetingResponse);
  console.log('Context after greeting:', conversationAI.getContext());
  console.log('');
  
  // Test 2: Technical question
  console.log('2️⃣ Testing technical question...');
  const questionResponse = await conversationAI.processMessage('How does machine learning work?');
  console.log('Response:', questionResponse);
  console.log('Context after question:', conversationAI.getContext());
  console.log('');
  
  // Test 3: Follow-up question
  console.log('3️⃣ Testing follow-up question...');
  const followUpResponse = await conversationAI.processMessage('Can you explain neural networks?');
  console.log('Response:', followUpResponse);
  console.log('Context after follow-up:', conversationAI.getContext());
  console.log('');
  
  // Assertions
  const finalContext = conversationAI.getContext();
  
  console.log('📊 Final Context Analysis:');
  console.log('- Topic:', finalContext.topic);
  console.log('- Mood:', finalContext.mood);
  console.log('- User Role:', finalContext.userRole);
  console.log('- Conversation History Length:', finalContext.conversationHistory.length);
  console.log('- Current Intent:', finalContext.currentIntent);
  console.log('- Previous Intents Length:', finalContext.previousIntents.length);
  console.log('- File Context:', finalContext.fileContext);
  
  // Assertions
  const assertions = [
    {
      name: 'Conversation history has 3 entries',
      passed: finalContext.conversationHistory.length === 3,
      expected: 3,
      actual: finalContext.conversationHistory.length
    },
    {
      name: 'Previous intents has 3 entries',
      passed: finalContext.previousIntents.length === 3,
      expected: 3,
      actual: finalContext.previousIntents.length
    },
    {
      name: 'Last response is a packet with op code',
      passed: followUpResponse && typeof followUpResponse === 'object' && 'op' in followUpResponse,
      expected: 'object with op property',
      actual: typeof followUpResponse
    },
    {
      name: 'Context topic is updated',
      passed: finalContext.topic !== 'general',
      expected: 'not general',
      actual: finalContext.topic
    }
  ];
  
  console.log('\n✅ Assertions:');
  assertions.forEach(assertion => {
    const status = assertion.passed ? '✅' : '❌';
    console.log(`${status} ${assertion.name}: ${assertion.expected} (got ${assertion.actual})`);
  });
  
  const allPassed = assertions.every(a => a.passed);
  console.log(`\n${allPassed ? '🎉 All tests passed!' : '❌ Some tests failed!'}`);
  
  return allPassed;
}

// Run the test
testConversationalContext().catch(console.error);
