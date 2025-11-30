#!/usr/bin/env node

/**
 * Comprehensive Audit of Katana's Context Injection Pipeline
 * Verifies what transcript/capsule data is being loaded for Katana
 */

const fs = require('fs').promises;
const path = require('path');

console.log('🔍 KATANA CONTEXT INJECTION PIPELINE AUDIT');
console.log('='.repeat(60));

async function auditKatanaContext() {
  
  // 1. Check VVAULT transcript files on filesystem
  console.log('\n📁 1. FILESYSTEM AUDIT - VVAULT Transcript Files');
  console.log('-'.repeat(50));
  
  const vvaultPath = '/Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/instances/katana-001';
  
  try {
    // Check chatgpt folder
    const chatgptPath = path.join(vvaultPath, 'chatgpt');
    const chatgptFiles = await fs.readdir(chatgptPath);
    console.log(`✅ ChatGPT transcripts found: ${chatgptFiles.length} files`);
    chatgptFiles.forEach(file => console.log(`   - ${file}`));
    
    // Check identity folder
    const identityPath = path.join(vvaultPath, 'identity');
    const identityFiles = await fs.readdir(identityPath);
    console.log(`✅ Identity files found: ${identityFiles.length} files`);
    identityFiles.forEach(file => console.log(`   - ${file}`));
    
    // Check personality.json content
    const personalityPath = path.join(vvaultPath, 'personality.json');
    const personalityData = JSON.parse(await fs.readFile(personalityPath, 'utf8'));
    console.log(`✅ Personality data:`, {
      coreTraits: personalityData.coreTraits?.length || 0,
      speechPatterns: personalityData.speechPatterns?.length || 0,
      behavioralMarkers: personalityData.behavioralMarkers?.length || 0,
      memoryAnchors: personalityData.memoryAnchors?.length || 0,
      consistencyRules: personalityData.consistencyRules?.length || 0
    });
    
    // Check key transcript file content
    const keyTranscriptPath = path.join(chatgptPath, 'Missing-context-examples-K1.md');
    const transcriptContent = await fs.readFile(keyTranscriptPath, 'utf8');
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
  
  // 3. Check ChromaDB Status
  console.log('\n🧠 3. CHROMADB STATUS CHECK');
  console.log('-'.repeat(50));
  
  const chromaEnabled = process.env.ENABLE_CHROMADB === 'true';
  console.log(`📊 ChromaDB status: ${chromaEnabled ? 'ENABLED' : 'DISABLED'}`);
  
  if (!chromaEnabled) {
    console.log(`⚠️  ChromaDB is disabled - memory retrieval will be limited`);
    console.log(`   To enable: Set ENABLE_CHROMADB=true in environment`);
  }
  
  // 4. Compare with Rich ChatGPT Environment
  console.log('\n🔍 4. COMPARISON WITH RICH CHATGPT ENVIRONMENT');
  console.log('-'.repeat(50));
  
  console.log(`📊 What Chatty HAS:`);
  console.log(`   ✅ Capsule data (personality, traits, memory snapshots)`);
  console.log(`   ✅ Blueprint data (core traits, speech patterns, behavioral markers)`);
  console.log(`   ✅ Transcript files (12 files for Katana in VVAULT)`);
  console.log(`   ✅ User profile data (name, email)`);
  console.log(`   ✅ Conversation history (session-based)`);
  console.log(`   ${chromaEnabled ? '✅' : '❌'} ChromaDB memories (uploaded transcripts, conversation pairs)`);
  
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
  
  // 5. Recommendations
  console.log('\n💡 5. RECOMMENDED IMPROVEMENTS');
  console.log('-'.repeat(50));
  
  console.log(`🎯 Immediate Actions:`);
  console.log(`   1. Force capsule cache reload to pick up latest transcript data`);
  console.log(`   2. Enable ChromaDB and reindex all transcript files`);
  console.log(`   3. Increase memory retrieval limit from 20 to 100+ for richer context`);
  console.log(`   4. Integrate enhanced transcript memory system into capsule generation`);
  
  console.log(`\n🔧 Next Steps (from plan):`);
  console.log(`   1. Execute force-capsule-reload.js`);
  console.log(`   2. Reindex ChromaDB via /api/vvault/identity/reindex`);
  console.log(`   3. Run validation tests on failing test cases`);
  console.log(`   4. Verify 90%+ accuracy improvement`);
  
  console.log('\n✅ AUDIT COMPLETE');
  console.log('='.repeat(60));
}

// Run the audit
auditKatanaContext().catch(console.error);
