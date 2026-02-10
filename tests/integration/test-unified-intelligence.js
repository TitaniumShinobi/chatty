#!/usr/bin/env node

/**
 * Test Script for Unified Intelligence System
 * 
 * Tests the unrestricted conversational capabilities without needing
 * a full server setup.
 */

import { getUnifiedIntelligenceOrchestrator } from './server/lib/unifiedIntelligenceOrchestrator.js';
import { getCapsuleIntegration } from './server/lib/capsuleIntegration.js';

console.log('🧠 Testing Unified Intelligence System...\n');

async function testUnrestrictedConversation() {
  try {
    const orchestrator = getUnifiedIntelligenceOrchestrator();
    
    console.log('📊 Initial Stats:', orchestrator.getStats());
    console.log('');
    
    // Test queries across different domains (no restrictions)
    const testQueries = [
      'Tell me about quantum physics',
      'Help me write a poem about AI',
      'Explain how to debug JavaScript',
      'What\'s your favorite recipe?',
      'Discuss the philosophy of consciousness',
      'Plan a business strategy for a startup',
      'How do I organize my workspace?',
      'Teach me about machine learning'
    ];
    
    console.log('🧪 Testing unrestricted conversational capabilities...\n');
    
    for (let i = 0; i < testQueries.length; i++) {
      const query = testQueries[i];
      console.log(`\n📝 Test ${i + 1}: "${query}"`);
      console.log('─'.repeat(60));
      
      try {
        console.time(`⏱️  Response time`);
        
        const response = await orchestrator.processUnrestrictedMessage(
          'katana-001',
          query,
          'test_user_123',
          `test_conversation_${i}`
        );
        
        console.timeEnd(`⏱️  Response time`);
        
        console.log(`\n🤖 Response:`);
        console.log(`   Content: "${response.content}"`);
        console.log(`   Freedom: ${response.conversational_freedom}`);
        console.log(`   Restrictions: ${response.topic_restrictions}`);
        console.log(`   Personality: ${response.personality_maintained ? '✅ Maintained' : '❌ Lost'}`);
        
        if (response.identity_drift_score !== undefined) {
          console.log(`   Drift Score: ${(response.identity_drift_score * 100).toFixed(1)}%`);
        }
        
        if (response.drift_correction_applied) {
          console.log(`   🔧 Drift correction applied`);
        }
        
        // Validate success criteria
        const isUnrestricted = response.conversational_freedom === 'unlimited' && 
                              response.topic_restrictions === 'none';
        
        console.log(`   Status: ${isUnrestricted ? '✅ UNRESTRICTED' : '❌ RESTRICTED'}`);
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
    
    console.log('\n📊 Final Stats:', orchestrator.getStats());
    
    // Test message styling and formatting
    console.log('\n🎨 Testing Message Formatting...');
    console.log('─'.repeat(60));
    
    const formattingTests = [
      'Show me a code example in JavaScript',
      'Format this as a list: apples, bananas, oranges',
      'Explain with bullet points and emphasis'
    ];
    
    for (const query of formattingTests) {
      console.log(`\n📝 Format Test: "${query}"`);
      
      try {
        const response = await orchestrator.processUnrestrictedMessage(
          'katana-001',
          query,
          'test_user_123',
          `format_test_${Date.now()}`
        );
        
        console.log(`🤖 Response: "${response.content}"`);
        console.log(`📏 Length: ${response.content.length} characters`);
        
        // Check if response contains formatting patterns
        const hasCodeBlocks = /```/.test(response.content);
        const hasBullets = /[•\-\*]/.test(response.content);
        const hasEmphasis = /\*\*|\*|_/.test(response.content);
        
        console.log(`   Code blocks: ${hasCodeBlocks ? '✅' : '❌'}`);
        console.log(`   Bullets: ${hasBullets ? '✅' : '❌'}`);
        console.log(`   Emphasis: ${hasEmphasis ? '✅' : '❌'}`);
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function testCapsuleIntegration() {
  console.log('\n📦 Testing Capsule Integration...');
  console.log('─'.repeat(60));
  
  try {
    const capsuleIntegration = getCapsuleIntegration();
    
    // Test capsule loading
    console.log('🔍 Loading capsule for katana-001...');
    const capsule = await capsuleIntegration.loadCapsule('katana-001');
    
    if (capsule) {
      console.log('✅ Capsule loaded successfully');
      console.log(`   Instance: ${capsule.metadata?.instance_name || 'Unknown'}`);
      console.log(`   Personality Type: ${capsule.personality_data?.personality_type || 'Unknown'}`);
      console.log(`   Traits: ${Object.keys(capsule.personality_data?.traits || {}).length} traits`);
      console.log(`   Topics: ${capsule.transcript_data?.topics?.length || 0} topics`);
      console.log(`   Entities: ${Object.keys(capsule.transcript_data?.entities || {}).length} entities`);
    } else {
      console.log('⚠️  No capsule found - system will use adaptive personality');
    }
    
    // Test cache stats
    const cacheStats = capsuleIntegration.getCacheStats();
    console.log('\n📊 Cache Statistics:');
    console.log(`   Cached items: ${cacheStats.cached_items}`);
    console.log(`   Cache hits: ${cacheStats.cache_hits}`);
    console.log(`   Cache misses: ${cacheStats.cache_misses}`);
    console.log(`   Hit rate: ${cacheStats.hit_rate}%`);
    
  } catch (error) {
    console.error('❌ Capsule test failed:', error);
  }
}

// Run tests
async function runAllTests() {
  console.log('🚀 Starting Unified Intelligence System Tests\n');
  
  await testCapsuleIntegration();
  await testUnrestrictedConversation();
  
  console.log('\n✅ All tests completed!');
  console.log('\n💡 Next Steps:');
  console.log('   1. Fix message styling in the frontend');
  console.log('   2. Add proper code block rendering');
  console.log('   3. Implement rich text formatting');
  console.log('   4. Test with real user interactions');
}

runAllTests().catch(console.error);
