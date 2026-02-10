#!/usr/bin/env node

/**
 * Orchestration & Context Management Audit for Chatty
 * 
 * Comprehensive audit of orchestration state, session context management,
 * and memory persistence for all agents (Katana, Lin, etc.)
 */

import { getGPTRuntimeBridge } from './server/lib/gptRuntimeBridge.js';
import { getUnifiedIntelligenceOrchestrator } from './server/lib/unifiedIntelligenceOrchestrator.js';
import { getCapsuleIntegration } from './server/lib/capsuleIntegration.js';
import { getIdentityDriftPrevention } from './server/lib/identityDriftPrevention.js';

console.log('🔍 ORCHESTRATION & CONTEXT MANAGEMENT AUDIT\n');
console.log('=' .repeat(80));

async function auditOrchestrationState() {
  console.log('\n📊 1. ORCHESTRATION STATE AUDIT');
  console.log('─'.repeat(50));
  
  try {
    // Get singleton instances
    const bridge = getGPTRuntimeBridge();
    const orchestrator = getUnifiedIntelligenceOrchestrator();
    const capsuleIntegration = getCapsuleIntegration();
    const identityDrift = getIdentityDriftPrevention();
    
    console.log('✅ Singleton Instances:');
    console.log(`   - GPTRuntimeBridge: ${bridge ? 'Active' : 'Null'}`);
    console.log(`   - UnifiedIntelligenceOrchestrator: ${orchestrator ? 'Active' : 'Null'}`);
    console.log(`   - CapsuleIntegration: ${capsuleIntegration ? 'Active' : 'Null'}`);
    console.log(`   - IdentityDriftPrevention: ${identityDrift ? 'Active' : 'Null'}`);
    
    // Check orchestrator state
    if (orchestrator) {
      const stats = orchestrator.getStats();
      console.log('\n📈 Orchestrator Statistics:');
      console.log(`   - Loaded Personalities: ${stats.loaded_personalities}`);
      console.log(`   - Active Conversations: ${stats.active_conversations}`);
      console.log(`   - Topic Restrictions: ${stats.topic_restrictions}`);
      console.log(`   - Conversational Freedom: ${stats.conversational_freedom}`);
      console.log(`   - Personality Consistency: ${stats.personality_consistency}`);
      console.log(`   - Identity Drift Prevention: ${JSON.stringify(stats.identity_drift_prevention, null, 2)}`);
    }
    
    // Check capsule integration state
    if (capsuleIntegration) {
      const cacheStats = capsuleIntegration.cacheStats;
      console.log('\n💾 Capsule Integration Cache:');
      console.log(`   - Cache Hits: ${cacheStats.hits}`);
      console.log(`   - Cache Misses: ${cacheStats.misses}`);
      console.log(`   - Total Loads: ${cacheStats.totalLoads}`);
      console.log(`   - Avg Load Time: ${cacheStats.avgLoadTime}ms`);
      console.log(`   - Cached Constructs: ${capsuleIntegration.memoryCache.size}/${capsuleIntegration.maxCacheSize}`);
      
      // List cached constructs
      if (capsuleIntegration.memoryCache.size > 0) {
        console.log('\n📋 Currently Cached Constructs:');
        for (const [constructId, cacheData] of capsuleIntegration.memoryCache.entries()) {
          console.log(`   - ${constructId}: loaded ${new Date(cacheData.loadedAt).toLocaleTimeString()}, accessed ${cacheData.accessCount} times`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error auditing orchestration state:', error);
  }
}

async function auditContextPersistence() {
  console.log('\n📊 2. CONTEXT PERSISTENCE AUDIT');
  console.log('─'.repeat(50));
  
  const testConstructs = ['katana-001', 'nova-001', 'test-construct-001'];
  
  for (const constructId of testConstructs) {
    console.log(`\n🔍 Testing ${constructId}:`);
    
    try {
      const capsuleIntegration = getCapsuleIntegration();
      
      // Test capsule loading
      console.time(`   ⏱️  Capsule load time`);
      const capsule = await capsuleIntegration.loadCapsule(constructId);
      console.timeEnd(`   ⏱️  Capsule load time`);
      
      if (capsule) {
        console.log(`   ✅ Capsule found: ${capsule.metadata?.instance_name || 'Unknown'}`);
        console.log(`   📅 Last updated: ${capsule.metadata?.timestamp || 'Unknown'}`);
        console.log(`   🧠 Memory log entries: ${capsule.memory_log?.length || 0}`);
        console.log(`   📊 Transcript data: ${capsule.transcript_data ? 'Available' : 'None'}`);
        
        if (capsule.transcript_data) {
          console.log(`   📈 Topics: ${capsule.transcript_data.topics?.length || 0}`);
          console.log(`   👥 Entities: ${Object.keys(capsule.transcript_data.entities || {}).length}`);
          console.log(`   🔗 Relationships: ${Object.keys(capsule.transcript_data.relationships || {}).length}`);
        }
        
        if (capsule.personality_data) {
          console.log(`   🎭 Personality traits: ${Object.keys(capsule.personality_data.traits || {}).length}`);
          console.log(`   💬 Communication style: ${capsule.personality_data.communication_style || 'Unknown'}`);
        }
      } else {
        console.log(`   ❌ No capsule found for ${constructId}`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error loading ${constructId}:`, error.message);
    }
  }
}

async function auditSessionContinuity() {
  console.log('\n📊 3. SESSION CONTINUITY TEST');
  console.log('─'.repeat(50));
  
  const bridge = getGPTRuntimeBridge();
  const testConstructId = 'katana-001';
  const sessionId = `audit_session_${Date.now()}`;
  
  console.log(`🧪 Testing session continuity for ${testConstructId}`);
  console.log(`📋 Session ID: ${sessionId}`);
  
  try {
    // Send multiple messages in sequence to test context retention
    const testMessages = [
      'Remember this number: 42',
      'What number did I just tell you to remember?',
      'Now remember this word: elephant',
      'What number and word did I ask you to remember?'
    ];
    
    const responses = [];
    
    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`\n${i+1}/4: "${message}"`);
      
      console.time(`   ⏱️  Response time`);
      const response = await bridge.processMessage(
        testConstructId,
        message,
        'devon_woodson_1762969514958',
        sessionId
      );
      console.timeEnd(`   ⏱️  Response time`);
      
      console.log(`   💬 Response: "${response.content}"`);
      responses.push({ message, response: response.content });
      
      // Brief pause between messages
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Analyze continuity
    console.log('\n📊 Continuity Analysis:');
    const remembersNumber = responses[1].response.includes('42');
    const remembersWord = responses[3].response.includes('elephant');
    const remembersBoth = responses[3].response.includes('42') && responses[3].response.includes('elephant');
    
    console.log(`   🔢 Remembers number (42): ${remembersNumber ? '✅' : '❌'}`);
    console.log(`   🐘 Remembers word (elephant): ${remembersWord ? '✅' : '❌'}`);
    console.log(`   🧠 Remembers both: ${remembersBoth ? '✅' : '❌'}`);
    
    if (remembersBoth) {
      console.log('   🎯 Session continuity: EXCELLENT');
    } else if (remembersNumber || remembersWord) {
      console.log('   ⚠️  Session continuity: PARTIAL');
    } else {
      console.log('   ❌ Session continuity: FAILED');
    }
    
  } catch (error) {
    console.error('❌ Error testing session continuity:', error);
  }
}

async function auditMemoryPersistence() {
  console.log('\n📊 4. MEMORY PERSISTENCE AUDIT');
  console.log('─'.repeat(50));
  
  try {
    const orchestrator = getUnifiedIntelligenceOrchestrator();
    
    // Test conversation context storage
    const testConversationId = `test_conv_${Date.now()}`;
    const testConstructId = 'katana-001';
    
    console.log(`🧪 Testing memory persistence for conversation: ${testConversationId}`);
    
    // Get initial context
    const initialContext = await orchestrator.getConversationContext(testConversationId, testConstructId);
    console.log('✅ Initial context created:', JSON.stringify(initialContext, null, 2));
    
    // Simulate context update
    await orchestrator.updateConversationContext(testConversationId, 'test message', 'test response');
    
    // Retrieve context again
    const retrievedContext = await orchestrator.getConversationContext(testConversationId, testConstructId);
    console.log('✅ Context retrieved after update:', JSON.stringify(retrievedContext, null, 2));
    
    // Test personality loading persistence
    console.log('\n🎭 Testing personality loading:');
    const personality1 = await orchestrator.loadPersonalityProfile(testConstructId);
    const personality2 = await orchestrator.loadPersonalityProfile(testConstructId);
    
    const isSameInstance = personality1 === personality2;
    console.log(`   📊 Personality caching: ${isSameInstance ? '✅ Cached' : '❌ Reloaded'}`);
    console.log(`   🎯 Personality traits: ${Object.keys(personality1.traits || {}).length}`);
    console.log(`   💬 Communication style: ${personality1.communication_style}`);
    
  } catch (error) {
    console.error('❌ Error auditing memory persistence:', error);
  }
}

async function generateDiagnosticReport() {
  console.log('\n📊 5. DIAGNOSTIC REPORT & RECOMMENDATIONS');
  console.log('─'.repeat(50));
  
  const orchestrator = getUnifiedIntelligenceOrchestrator();
  const capsuleIntegration = getCapsuleIntegration();
  
  console.log('\n🔧 IDENTIFIED ISSUES:');
  
  // Check for potential issues
  const stats = orchestrator.getStats();
  
  if (stats.loaded_personalities === 0) {
    console.log('   ❌ No personalities loaded - may indicate initialization issues');
  }
  
  if (stats.active_conversations === 0) {
    console.log('   ⚠️  No active conversations - normal for fresh start');
  }
  
  const cacheStats = capsuleIntegration.cacheStats;
  const hitRate = cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100;
  
  if (hitRate < 50) {
    console.log(`   ⚠️  Low cache hit rate: ${hitRate.toFixed(1)}% - may indicate cache issues`);
  } else {
    console.log(`   ✅ Good cache hit rate: ${hitRate.toFixed(1)}%`);
  }
  
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('   1. Implement persistent conversation storage in database');
  console.log('   2. Add session recovery mechanisms for orchestrator restarts');
  console.log('   3. Implement conversation context backup/restore');
  console.log('   4. Add health check endpoints for orchestration components');
  console.log('   5. Implement conversation context size limits to prevent memory bloat');
  
  console.log('\n📋 CRITICAL FILES & LOCATIONS:');
  console.log('   - Orchestrator: server/lib/unifiedIntelligenceOrchestrator.js:765-770 (singleton)');
  console.log('   - Context Storage: server/lib/unifiedIntelligenceOrchestrator.js:148-166 (in-memory Map)');
  console.log('   - Capsule Cache: server/lib/capsuleIntegration.js:26-36 (LRU memory cache)');
  console.log('   - Session Persistence: server/lib/vvaultMemoryManager.js:92-138 (VVAULT files)');
  console.log('   - Identity Anchoring: server/lib/identityDriftPrevention.js (personality consistency)');
}

async function runFullAudit() {
  console.log('🚀 Starting Comprehensive Orchestration Audit...\n');
  
  await auditOrchestrationState();
  await auditContextPersistence();
  await auditSessionContinuity();
  await auditMemoryPersistence();
  await generateDiagnosticReport();
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ ORCHESTRATION AUDIT COMPLETED');
  console.log('📊 All components analyzed for state management and context persistence');
  console.log('🎯 Use this report to identify and fix orchestration issues');
}

runFullAudit().catch(console.error);
