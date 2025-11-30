#!/usr/bin/env node

/**
 * Debug script to analyze why context search is failing
 */

import { getUnifiedIntelligenceOrchestrator } from './server/lib/unifiedIntelligenceOrchestrator.js';

async function debugContextSearch() {
  console.log('🔍 DEBUGGING CONTEXT SEARCH PIPELINE');
  console.log('🎯 Goal: Understand why transcript context is not being found\n');
  
  const orchestrator = getUnifiedIntelligenceOrchestrator();
  await orchestrator.initialize();
  
  const testQuestions = [
    'what did you say about Nova and copyright?',
    'tell me about exclusivity and control',
    'what did you say about work being play?'
  ];
  
  for (const question of testQuestions) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 DEBUGGING: "${question}"`);
    console.log('='.repeat(80));
    
    try {
      // Step 1: Check if capsule loads
      console.log('\n📦 STEP 1: Loading Katana capsule...');
      const context = await orchestrator.getRelevantContext(question, 'katana-001');
      
      if (!context) {
        console.log('❌ No context returned - capsule or transcript data missing');
        continue;
      }
      
      console.log(`✅ Context found with:`);
      console.log(`   - Topics: ${context.relevant_topics?.length || 0}`);
      console.log(`   - Entities: ${context.relevant_entities?.length || 0}`);
      console.log(`   - Examples: ${context.relevant_examples?.length || 0}`);
      
      // Step 2: Check topic matches
      if (context.relevant_topics?.length > 0) {
        console.log('\n📋 STEP 2: Topic matches found:');
        context.relevant_topics.forEach((topic, i) => {
          console.log(`   ${i+1}. "${topic.topic}" (score: ${topic.score})`);
          console.log(`      Matched words: [${topic.matchedWords?.join(', ') || 'none'}]`);
          if (topic.examples?.length > 0) {
            console.log(`      Examples: ${topic.examples.length}`);
            topic.examples.forEach((example, j) => {
              console.log(`        ${j+1}. "${example.assistant_snippet?.substring(0, 100)}..."`);
            });
          }
        });
      }
      
      // Step 3: Check entity matches
      if (context.relevant_entities?.length > 0) {
        console.log('\n🏷️ STEP 3: Entity matches found:');
        context.relevant_entities.forEach((entity, i) => {
          console.log(`   ${i+1}. "${entity.name}" (score: ${entity.score})`);
          console.log(`      Matched words: [${entity.matchedWords?.join(', ') || 'none'}]`);
          if (entity.contexts?.length > 0) {
            console.log(`      Contexts: ${entity.contexts.length}`);
            entity.contexts.forEach((ctx, j) => {
              console.log(`        ${j+1}. "${ctx.snippet?.substring(0, 100)}..."`);
            });
          }
        });
      }
      
      // Step 4: Check conversation examples
      if (context.relevant_examples?.length > 0) {
        console.log('\n💬 STEP 4: Conversation examples found:');
        context.relevant_examples.forEach((example, i) => {
          console.log(`   ${i+1}. Score: ${example.relevanceScore}`);
          console.log(`      User: "${example.user_snippet?.substring(0, 80)}..."`);
          console.log(`      Assistant: "${example.assistant_snippet?.substring(0, 80)}..."`);
        });
      }
      
      // Step 5: Test strict validation on found examples
      console.log('\n🎯 STEP 5: Testing strict validation on found examples:');
      
      if (context.relevant_examples?.length > 0) {
        for (const example of context.relevant_examples) {
          if (example.assistant_snippet) {
            const validation = orchestrator.strictTranscriptValidate(question, example.assistant_snippet);
            console.log(`   Example: "${example.assistant_snippet.substring(0, 60)}..."`);
            console.log(`   Validation: ${validation.valid ? '✅ VALID' : '❌ INVALID'} (${validation.type})`);
            console.log(`   Reason: ${validation.reason}`);
          }
        }
      } else {
        console.log('   ❌ No examples to validate');
      }
      
    } catch (error) {
      console.error(`❌ Error debugging question "${question}":`, error);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 DIAGNOSIS SUMMARY');
  console.log('='.repeat(80));
  console.log('Based on the debug output above, the issues are likely:');
  console.log('1. Context search not finding relevant transcript fragments');
  console.log('2. Relevance scoring too strict or word matching failing');
  console.log('3. Transcript data structure not matching search expectations');
  console.log('4. Missing specific conversation examples for test questions');
}

// Run the debug
debugContextSearch()
  .then(() => {
    console.log('\n🏁 Debug completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Debug failed with error:', error);
    process.exit(1);
  });
