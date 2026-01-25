#!/usr/bin/env node
/**
 * Quick VVAULT Storage Test
 * 
 * This script tests if VVAULT integration is working
 * by simulating Chatty message flow.
 */

import { VVAULTConnector } from './vvaultConnector/index.js';
import { autoStoreMessage, initializeVVAULTAutoIntegration } from './vvaultConnector/auto-integration.js';

async function testVVAULTStorage() {
  console.log('🧪 Testing VVAULT Storage...\n');

  try {
    // Initialize VVAULT auto-integration
    await initializeVVAULTAutoIntegration();
    console.log('✅ VVAULT auto-integration initialized');

    // Simulate Chatty message flow
    const testMessages = [
      {
        owner: 'test_user_123',
        conversation: 'test_conversation_456',
        role: 'user',
        content: 'Hello! This is a test message to verify VVAULT integration is working.',
        tokens: 15,
        meta: { emotionScores: { joy: 0.8, anticipation: 0.2 } },
        createdAt: new Date()
      },
      {
        owner: 'test_user_123',
        conversation: 'test_conversation_456',
        role: 'assistant',
        content: 'Hello! I received your test message. VVAULT integration is working correctly! This conversation is now stored in VVAULT.',
        tokens: 25,
        meta: { emotionScores: { joy: 0.9, trust: 0.8 } },
        createdAt: new Date()
      },
      {
        owner: 'anonymous_user_789',
        conversation: 'anonymous_session_101',
        role: 'user',
        content: 'This is an anonymous test message to verify universal storage works for all users.',
        tokens: 18,
        meta: { emotionScores: { curiosity: 0.7 } },
        createdAt: new Date()
      }
    ];

    console.log('📝 Storing test messages...\n');

    // Store each message using auto-integration
    for (const message of testMessages) {
      try {
        await autoStoreMessage(message);
        console.log(`✅ Stored ${message.role} message for ${message.owner}`);
      } catch (error) {
        console.error(`❌ Failed to store ${message.role} message:`, error.message);
      }
    }

    // Verify storage
    console.log('\n🔍 Verifying storage...');
    
    const connector = new VVAULTConnector();
    await connector.initialize();

    // Check health
    const health = await connector.healthCheck();
    console.log(`🏥 VVAULT Health: ${health.status}`);
    console.log(`📊 Long-term memories: ${health.long_term_memories}`);
    console.log(`📊 Short-term memories: ${health.short_term_memories}`);

    // Read memories
    const memories = await connector.readMemories('test_user_123', { limit: 5 });
    console.log(`\n📚 Retrieved ${memories.length} memories for test_user_123:`);
    
    memories.forEach((memory, index) => {
      console.log(`  ${index + 1}. [${memory.role}] ${memory.timestamp}`);
      console.log(`     ${memory.content.substring(0, 60)}...`);
    });

    console.log('\n✅ VVAULT Storage Test Complete!');
    console.log('\n🎯 To test with actual Chatty:');
    console.log('  1. Add this line to your Chatty server startup:');
    console.log('     require("./vvaultConnector/auto-enable");');
    console.log('  2. Start Chatty server');
    console.log('  3. Send messages in Chatty');
    console.log('  4. Check VVAULT directory for stored conversations');

  } catch (error) {
    console.error('❌ VVAULT Storage Test Failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testVVAULTStorage();
