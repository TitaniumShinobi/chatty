#!/usr/bin/env node

/**
 * Direct Lin Conversation Test - Bypass Server
 * Tests the actual Lin conversation system directly
 */

console.log('🔍 DIRECT LIN CONVERSATION TEST');
console.log('Testing Lin conversation system directly (no server)...');

async function testLinConversationDirect() {
  try {
    // Import the Lin conversation system directly
    const { sendMessageToLin } = await import('./src/lib/linConversation.ts');
    
    console.log('\n📋 Testing the 3 failing cases from yesterday:');
    
    // Test 1: Identity confusion
    console.log('\n1. IDENTITY TEST:');
    console.log('Question: do you know your name per chance?');
    
    try {
      const response1 = await sendMessageToLin({
        message: 'do you know your name per chance?',
        gptConfig: {
          name: 'Katana',
          constructCallsign: 'katana-001'
        },
        conversationHistory: []
      });
      
      console.log('Response:', response1.response);
      console.log('Expected: Should say "Katana" clearly, not "Lin with Katana persona"');
      console.log('Metadata:', {
        memoryCount: response1.metadata.memoryCount,
        hasCapsule: response1.metadata.hasCapsule,
        hasBlueprint: response1.metadata.hasBlueprint
      });
    } catch (error) {
      console.log('❌ Identity test failed:', error.message);
    }
    
    // Test 2: Transcript understanding
    console.log('\n2. TRANSCRIPT UNDERSTANDING TEST:');
    console.log('Question: do you see the uploaded transcripts?');
    
    try {
      const response2 = await sendMessageToLin({
        message: 'do you see the uploaded transcripts?',
        gptConfig: {
          name: 'Katana',
          constructCallsign: 'katana-001'
        },
        conversationHistory: []
      });
      
      console.log('Response:', response2.response);
      console.log('Expected: Should explain what transcripts are, not generic response');
    } catch (error) {
      console.log('❌ Transcript test failed:', error.message);
    }
    
    // Test 3: Date extraction
    console.log('\n3. DATE EXTRACTION TEST:');
    console.log('Question: tell me what dates you have found within them');
    
    try {
      const response3 = await sendMessageToLin({
        message: 'tell me what dates you have found within them',
        gptConfig: {
          name: 'Katana',
          constructCallsign: 'katana-001'
        },
        conversationHistory: [
          { role: 'user', content: 'do you see the uploaded transcripts?' },
          { role: 'assistant', content: 'Yes, I can see the uploaded transcripts.' }
        ]
      });
      
      console.log('Response:', response3.response);
      console.log('Expected: Should extract actual dates, not placeholder "[insert dates here]"');
    } catch (error) {
      console.log('❌ Date extraction test failed:', error.message);
    }
    
  } catch (error) {
    console.log('❌ Direct Lin test setup failed:', error.message);
    console.log('Stack:', error.stack);
  }
}

// Run the test
testLinConversationDirect();
