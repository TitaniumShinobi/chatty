#!/usr/bin/env node

/**
 * Debug the conversation index to see what's actually stored
 */

import { getCapsuleIntegration } from './server/lib/capsuleIntegration.js';

async function debugConversationIndex() {
  console.log('🔍 DEBUGGING CONVERSATION INDEX');
  console.log('🎯 Goal: Find why work/play content is not being found\n');
  
  const capsuleIntegration = getCapsuleIntegration();
  const capsule = await capsuleIntegration.loadCapsule('katana-001');
  
  if (!capsule || !capsule.transcript_data) {
    console.log('❌ No capsule or transcript data');
    return;
  }
  
  console.log('📊 Transcript Data Overview:');
  console.log(`   - Files: ${capsule.transcript_data.files?.length || 0}`);
  console.log(`   - Topics: ${Object.keys(capsule.transcript_data.topics || {}).length}`);
  console.log(`   - Entities: ${Object.keys(capsule.transcript_data.entities || {}).length}`);
  console.log(`   - Conversation Index Keys: ${Object.keys(capsule.transcript_data.conversation_index || {}).length}`);
  
  // Check conversation index structure
  if (capsule.transcript_data.conversation_index) {
    console.log('\n🗂️ Conversation Index Keys:');
    Object.keys(capsule.transcript_data.conversation_index).forEach(key => {
      const entries = capsule.transcript_data.conversation_index[key];
      console.log(`   - "${key}": ${Array.isArray(entries) ? entries.length : 'not array'} entries`);
    });
    
    // Look for work/play related content
    console.log('\n🔍 Searching for work/play content:');
    const searchTerms = ['work', 'play', 'precision', 'execution', 'sugar'];
    
    for (const term of searchTerms) {
      console.log(`\n🔎 Searching for "${term}":`);
      
      // Check if term exists as a key
      if (capsule.transcript_data.conversation_index[term]) {
        console.log(`   ✅ Found direct key "${term}"`);
        const entries = capsule.transcript_data.conversation_index[term];
        if (Array.isArray(entries)) {
          entries.slice(0, 2).forEach((entry, i) => {
            console.log(`      ${i+1}. "${entry.assistant_snippet?.substring(0, 80)}..."`);
          });
        }
      } else {
        // Check if term appears in any key
        const matchingKeys = Object.keys(capsule.transcript_data.conversation_index).filter(key => 
          key.toLowerCase().includes(term.toLowerCase())
        );
        
        if (matchingKeys.length > 0) {
          console.log(`   🔍 Found in keys: [${matchingKeys.join(', ')}]`);
          matchingKeys.slice(0, 2).forEach(key => {
            const entries = capsule.transcript_data.conversation_index[key];
            if (Array.isArray(entries) && entries.length > 0) {
              console.log(`      "${key}": "${entries[0].assistant_snippet?.substring(0, 80)}..."`);
            }
          });
        } else {
          // Check if term appears in any assistant snippets
          let found = false;
          for (const [key, entries] of Object.entries(capsule.transcript_data.conversation_index)) {
            if (Array.isArray(entries)) {
              for (const entry of entries) {
                if (entry.assistant_snippet?.toLowerCase().includes(term.toLowerCase())) {
                  console.log(`   📝 Found in snippet under "${key}": "${entry.assistant_snippet.substring(0, 80)}..."`);
                  found = true;
                  break;
                }
              }
            }
            if (found) break;
          }
          
          if (!found) {
            console.log(`   ❌ Term "${term}" not found anywhere in conversation index`);
          }
        }
      }
    }
  }
  
  // Check topics
  if (capsule.transcript_data.topics) {
    console.log('\n📋 Topics:');
    capsule.transcript_data.topics.slice(0, 10).forEach((topic, i) => {
      console.log(`   ${i+1}. "${topic.topic || topic}" (${topic.frequency || 'no freq'})`);
    });
  }
  
  // Check entities
  if (capsule.transcript_data.entities) {
    console.log('\n🏷️ Entities:');
    Object.keys(capsule.transcript_data.entities).slice(0, 10).forEach(entity => {
      console.log(`   - "${entity}"`);
    });
  }
  
  console.log('\n🏁 Debug completed');
}

// Run the debug
debugConversationIndex()
  .then(() => {
    console.log('\n✅ Debug completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
