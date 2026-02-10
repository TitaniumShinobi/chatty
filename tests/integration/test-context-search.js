#!/usr/bin/env node

/**
 * Test Context Search Improvements
 * 
 * Tests the improved transcript context search to see if it can find relevant
 * information for specific questions about past conversations
 */

import { getGPTRuntimeBridge } from './server/lib/gptRuntimeBridge.js';

console.log('🔍 Testing Improved Context Search...\n');

async function testContextSearch() {
  const bridge = getGPTRuntimeBridge();
  
  // Test questions that should find context
  const contextQuestions = [
    'what did you say about Nova and copyright?',
    'tell me about exclusivity and control',
    'what did you say about work being play?',
    'do you remember talking about precision and execution?',
    'what was your response about sugar?'
  ];
  
  console.log('📋 Testing Context-Aware Questions:\n');
  
  for (let i = 0; i < contextQuestions.length; i++) {
    const question = contextQuestions[i];
    console.log(`${i+1}/5: "${question}"`);
    console.log('─'.repeat(60));
    
    try {
      console.time('⏱️  Response time');
      const response = await bridge.processMessage(
        'katana-001',
        question,
        'devon_woodson_1762969514958',
        `context_test_${Date.now()}`
      );
      console.timeEnd('⏱️  Response time');
      
      console.log(`💬 Response: "${response.content}"`);
      
      // Check if response shows actual context awareness (not generic)
      const isGeneric = response.content === 'What specifically would you like to know?' ||
                       response.content === 'I can assist with that. What do you need?' ||
                       response.content === 'Be specific.' ||
                       response.content.length < 15;
      
      console.log(`🎯 Context Used: ${isGeneric ? '❌ Generic' : '✅ Specific'}`);
      
      if (!isGeneric) {
        console.log(`📊 Content Length: ${response.content.length} chars`);
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
    
    console.log(''); // Empty line
    
    // Brief pause between questions
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function runContextTest() {
  console.log('🚀 Starting Context Search Test\n');
  
  console.log('🎯 Goal: Verify improved context search finds relevant transcript data');
  console.log('📋 Testing: Enhanced entity/topic matching with conversation examples');
  console.log('🔍 Expected: Specific responses from actual conversation history\n');
  
  await testContextSearch();
  
  console.log('\n✅ Context Search Test Completed!');
  console.log('\n📊 Summary:');
  console.log('   - Improved word-based matching for topics and entities');
  console.log('   - Enhanced conversation index search');
  console.log('   - Better example extraction from transcript data');
  console.log('\n🎯 Expected: Responses should now reference actual conversation content');
}

runContextTest().catch(console.error);
