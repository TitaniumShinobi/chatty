#!/usr/bin/env node

/**
 * Debug the actual conversation index structure to find why assistant_snippet is undefined
 */

import { getCapsuleIntegration } from './server/lib/capsuleIntegration.js';

async function debugIndexStructure() {
  console.log('🔍 DEBUGGING CONVERSATION INDEX STRUCTURE');
  console.log('🎯 Goal: Find why assistant_snippet is undefined\n');
  
  const capsuleIntegration = getCapsuleIntegration();
  const capsule = await capsuleIntegration.loadCapsule('katana-001');
  
  if (!capsule || !capsule.transcript_data || !capsule.transcript_data.conversation_index) {
    console.log('❌ No conversation index found');
    return;
  }
  
  const searchTerms = ['work', 'play', 'precision', 'sugar'];
  
  for (const term of searchTerms) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 ANALYZING "${term}" INDEX STRUCTURE`);
    console.log('='.repeat(60));
    
    const indexData = capsule.transcript_data.conversation_index[term];
    
    if (!indexData) {
      console.log(`❌ No index data for "${term}"`);
      continue;
    }
    
    console.log(`📊 Index data type: ${Array.isArray(indexData) ? 'Array' : typeof indexData}`);
    console.log(`📊 Index data length: ${indexData.length}`);
    
    if (indexData.length > 0) {
      const firstEntry = indexData[0];
      console.log(`\n📋 First entry structure:`);
      console.log(`   - Type: ${typeof firstEntry}`);
      console.log(`   - Keys: [${Object.keys(firstEntry || {}).join(', ')}]`);
      
      if (firstEntry.pattern) console.log(`   - Pattern: "${firstEntry.pattern}"`);
      if (firstEntry.frequency) console.log(`   - Frequency: ${firstEntry.frequency}`);
      if (firstEntry.tone) console.log(`   - Tone: ${firstEntry.tone}`);
      if (firstEntry.source) console.log(`   - Source: ${firstEntry.source}`);
      
      console.log(`\n🔍 Examples structure:`);
      if (firstEntry.examples) {
        console.log(`   - Examples type: ${Array.isArray(firstEntry.examples) ? 'Array' : typeof firstEntry.examples}`);
        console.log(`   - Examples length: ${firstEntry.examples.length}`);
        
        if (firstEntry.examples.length > 0) {
          const firstExample = firstEntry.examples[0];
          console.log(`\n📝 First example structure:`);
          console.log(`   - Type: ${typeof firstExample}`);
          console.log(`   - Keys: [${Object.keys(firstExample || {}).join(', ')}]`);
          
          if (firstExample.user_snippet) {
            console.log(`   - User snippet: "${firstExample.user_snippet.substring(0, 50)}..."`);
          }
          if (firstExample.assistant_snippet) {
            console.log(`   - Assistant snippet: "${firstExample.assistant_snippet.substring(0, 50)}..."`);
          } else {
            console.log(`   - ❌ Assistant snippet: ${firstExample.assistant_snippet}`);
          }
          if (firstExample.conversation_index !== undefined) {
            console.log(`   - Conversation index: ${firstExample.conversation_index}`);
          }
          if (firstExample.tone) {
            console.log(`   - Tone: ${firstExample.tone}`);
          }
          if (firstExample.source) {
            console.log(`   - Source: ${firstExample.source}`);
          }
        } else {
          console.log(`   ❌ No examples in array`);
        }
      } else {
        console.log(`   ❌ No examples property: ${firstEntry.examples}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 DEBUG COMPLETED');
  console.log('='.repeat(60));
}

// Run the debug
debugIndexStructure()
  .then(() => {
    console.log('\n✅ Debug completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
