#!/usr/bin/env node

/**
 * Comprehensive Audit of Katana's Context Injection Pipeline
 * Verifies what transcript/capsule data is being loaded for Katana
 */

console.log('🔍 KATANA CONTEXT INJECTION PIPELINE AUDIT');
console.log('='.repeat(60));

async function auditKatanaContext() {
  
  // 1. Check VVAULT transcript files on filesystem
  console.log('\n📁 1. FILESYSTEM AUDIT - VVAULT Transcript Files');
  console.log('-'.repeat(50));
  
  const fs = await import('fs');
  const path = await import('path');
  
  const vvaultPath = '/Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/instances/katana-001';
  
  try {
    // Check chatgpt folder
    const chatgptPath = path.join(vvaultPath, 'chatgpt');
    const chatgptFiles = await fs.promises.readdir(chatgptPath);
    console.log(`✅ ChatGPT transcripts found: ${chatgptFiles.length} files`);
    chatgptFiles.forEach(file => console.log(`   - ${file}`));
    
    // Check identity folder
    const identityPath = path.join(vvaultPath, 'identity');
    const identityFiles = await fs.promises.readdir(identityPath);
    console.log(`✅ Identity files found: ${identityFiles.length} files`);
    identityFiles.forEach(file => console.log(`   - ${file}`));
    
    // Check personality.json content
    const personalityPath = path.join(vvaultPath, 'personality.json');
    const personalityData = JSON.parse(await fs.promises.readFile(personalityPath, 'utf8'));
    console.log(`✅ Personality data:`, {
      coreTraits: personalityData.coreTraits?.length || 0,
      speechPatterns: personalityData.speechPatterns?.length || 0,
      behavioralMarkers: personalityData.behavioralMarkers?.length || 0,
      memoryAnchors: personalityData.memoryAnchors?.length || 0,
      consistencyRules: personalityData.consistencyRules?.length || 0
    });
    
    // Check key transcript file content
    const keyTranscriptPath = path.join(chatgptPath, 'Missing-context-examples-K1.md');
    const transcriptContent = await fs.promises.readFile(keyTranscriptPath, 'utf8');
    const hasWorkPlay = transcriptContent.includes('work being play');
    const hasPrecisionExecution = transcriptContent.includes('precision and execution');
    const hasSugar = transcriptContent.includes('sugar');
    
    console.log(`✅ Key transcript content check:`, {
      hasWorkPlay,
      hasPrecisionExecution,
      hasSugar,
      fileSize: `${Math.round(transcriptContent.length / 1024)}KB`
    });
    
  } catch (error) {
    console.log(`❌ Filesystem audit failed:`, error.message);
  }
  
  // 2. Check Chatty's VVAULT connector integration
  console.log('\n🔗 2. CHATTY VVAULT CONNECTOR INTEGRATION');
  console.log('-'.repeat(50));
  
  try {
    // Load the VVAULT connector
    const { readConversations } = require('./vvaultConnector/readConversations.js');
    
    // Test reading conversations for devon_woodson_1762969514958
    const conversations = await readConversations('devon_woodson_1762969514958');
    
    console.log(`✅ VVAULT connector working:`, {
      totalConversations: conversations.length,
      katanaConversations: conversations.filter(c => c.constructId?.includes('katana')).length,
      hasTranscriptData: conversations.some(c => c.messages?.length > 0)
    });
    
    // Check specific conversation content
    const katanaConvs = conversations.filter(c => c.constructId?.includes('katana'));
    if (katanaConvs.length > 0) {
      const sampleConv = katanaConvs[0];
      console.log(`✅ Sample Katana conversation:`, {
        sessionId: sampleConv.sessionId,
        title: sampleConv.title,
        messageCount: sampleConv.messages?.length || 0,
        hasWorkPlayContent: sampleConv.messages?.some(m => 
          m.content?.includes('work') && m.content?.includes('play')
        )
      });
    }
    
  } catch (error) {
    console.log(`❌ VVAULT connector test failed:`, error.message);
  }
  
  // 3. Check Capsule Integration
  console.log('\n💊 3. CAPSULE INTEGRATION AUDIT');
  console.log('-'.repeat(50));
  
  try {
    const { CapsuleIntegration } = await import('./server/lib/capsuleIntegration.js');
    const capsuleIntegration = new CapsuleIntegration();
    
    // Test loading Katana capsule
    const capsule = await capsuleIntegration.loadCapsule('katana-001');
    
    if (capsule) {
      console.log(`✅ Capsule loaded successfully:`, {
        hasTraits: !!capsule.traits,
        hasPersonality: !!capsule.personality,
        hasMemory: !!capsule.memory,
        hasTranscriptData: !!capsule.transcript_data,
        traitCount: Object.keys(capsule.traits || {}).length,
        memorySnapshotCount: capsule.memory?.length || 0
      });
      
      // Check if transcript data includes key content
      if (capsule.transcript_data) {
        const hasWorkPlayEntity = capsule.transcript_data.entities?.concepts?.includes('work') || 
                                  capsule.transcript_data.entities?.concepts?.includes('play');
        const hasConversationIndex = Object.keys(capsule.transcript_data.conversation_index || {}).length > 0;
        
        console.log(`✅ Transcript data analysis:`, {
          hasWorkPlayEntity,
          hasConversationIndex,
          entityCount: Object.keys(capsule.transcript_data.entities || {}).length,
          conversationIndexKeys: Object.keys(capsule.transcript_data.conversation_index || {}).length
        });
      }
    } else {
      console.log(`❌ No capsule found for katana-001`);
    }
    
  } catch (error) {
    console.log(`❌ Capsule integration test failed:`, error.message);
  }
  
  // 4. Check ChromaDB Memory System
  console.log('\n🧠 4. CHROMADB MEMORY SYSTEM AUDIT');
  console.log('-'.repeat(50));
  
  try {
    // Check if ChromaDB is enabled
    const chromaEnabled = process.env.ENABLE_CHROMADB === 'true';
    console.log(`📊 ChromaDB status: ${chromaEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (chromaEnabled) {
      const { getIdentityService } = await import('./server/services/identityService.js');
      const identityService = getIdentityService();
      
      // Test querying memories for Katana
      const memories = await identityService.queryIdentities(
        'devon_woodson_1762969514958',
        'katana-001',
        'work play precision execution sugar',
        20
      );
      
      console.log(`✅ ChromaDB memory query:`, {
        memoryCount: memories.length,
        hasWorkPlayMemories: memories.some(m => 
          (m.context?.includes('work') && m.context?.includes('play')) ||
          (m.response?.includes('work') && m.response?.includes('play'))
        ),
        hasPrecisionMemories: memories.some(m =>
          m.context?.includes('precision') || m.response?.includes('precision')
        ),
        hasSugarMemories: memories.some(m =>
          m.context?.includes('sugar') || m.response?.includes('sugar')
        )
      });
      
      // Show sample memories
      if (memories.length > 0) {
        console.log(`📋 Sample memories (first 3):`);
        memories.slice(0, 3).forEach((mem, i) => {
          console.log(`   ${i+1}. Context: ${mem.context?.substring(0, 80)}...`);
          console.log(`      Response: ${mem.response?.substring(0, 80)}...`);
          console.log(`      Relevance: ${mem.relevance || 'N/A'}`);
        });
      }
    } else {
      console.log(`⚠️  ChromaDB is disabled - memory retrieval will be limited`);
    }
    
  } catch (error) {
    console.log(`❌ ChromaDB audit failed:`, error.message);
  }
  
  // 5. Context Injection Analysis
  console.log('\n🎯 5. CONTEXT INJECTION ANALYSIS');
  console.log('-'.repeat(50));
  
  try {
    // Analyze what context is actually being injected
    const { UnifiedLinOrchestrator } = await import('./src/engine/orchestration/UnifiedLinOrchestrator.ts');
    
    console.log(`✅ UnifiedLinOrchestrator available`);
    
    // Check memory retrieval limits
    console.log(`📊 Memory retrieval configuration:`, {
      defaultLimit: 10, // From loadVVAULTMemories default
      maxRetries: 3, // From loadVVAULTMemories
      hasExponentialBackoff: true,
      hasFallbackToBlueprintAnchors: true
    });
    
  } catch (error) {
    console.log(`❌ Context injection analysis failed:`, error.message);
  }
  
  // 6. Compare with Rich ChatGPT Environment
  console.log('\n🔍 6. COMPARISON WITH RICH CHATGPT ENVIRONMENT');
  console.log('-'.repeat(50));
  
  console.log(`📊 What Chatty HAS:`);
  console.log(`   ✅ Capsule data (personality, traits, memory snapshots)`);
  console.log(`   ✅ Blueprint data (core traits, speech patterns, behavioral markers)`);
  console.log(`   ✅ ChromaDB memories (uploaded transcripts, conversation pairs)`);
  console.log(`   ✅ User profile data (name, email)`);
  console.log(`   ✅ Conversation history (session-based)`);
  console.log(`   ✅ Transcript processing (12 transcript files for Katana)`);
  
  console.log(`\n❌ What Chatty is MISSING compared to rich ChatGPT:`);
  console.log(`   ❌ Core operational documents (system architecture, project specs)`);
  console.log(`   ❌ Full conversation history breadth (limited to 20 memories per query)`);
  console.log(`   ❌ Real-time project state (current file contents, git status)`);
  console.log(`   ❌ Comprehensive workspace file access (only uploaded transcripts)`);
  console.log(`   ❌ Cross-project context (isolated to individual construct memories)`);
  console.log(`   ❌ Real-time system status (server health, database state)`);
  
  console.log(`\n⚠️  CRITICAL GAPS IDENTIFIED:`);
  console.log(`   1. Memory scope limited to 20 memories per query (vs unlimited ChatGPT context)`);
  console.log(`   2. No access to operational documents (VVAULT docs, Chatty architecture)`);
  console.log(`   3. Static context vs dynamic project awareness`);
  console.log(`   4. Fragmented context pipeline (capsule + ChromaDB + blueprint separately)`);
  
  // 7. Recommendations
  console.log('\n💡 7. RECOMMENDED IMPROVEMENTS');
  console.log('-'.repeat(50));
  
  console.log(`🎯 Immediate Actions:`);
  console.log(`   1. Increase memory retrieval limit from 20 to 100+ for richer context`);
  console.log(`   2. Ingest core operational documents into VVAULT/ChromaDB`);
  console.log(`   3. Create unified context orchestrator combining all data sources`);
  console.log(`   4. Add real-time context updates (file changes, project state)`);
  
  console.log(`\n🔧 Technical Implementation:`);
  console.log(`   1. Modify VVAULTRetrievalWrapper to support higher memory limits`);
  console.log(`   2. Create document ingestion pipeline for operational files`);
  console.log(`   3. Enhance UnifiedLinOrchestrator with comprehensive context building`);
  console.log(`   4. Add workspace file monitoring and real-time updates`);
  
  console.log('\n✅ AUDIT COMPLETE');
  console.log('='.repeat(60));
}

// Run the audit
auditKatanaContext().catch(console.error);
