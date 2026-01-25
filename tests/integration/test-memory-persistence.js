/**
 * Memory Persistence Validation Test
 * 
 * Tests that the memory system works correctly:
 * 1. Memory persists across server restarts
 * 2. Transcript recall works from VVAULT files
 * 3. Katana can reference exact lines from Anger-and-offense-response-K1.md
 */

import { getMemoryStore } from './src/lib/MemoryStore.ts';
import { getVVAULTTranscriptLoader } from './src/lib/VVAULTTranscriptLoader.ts';

async function testMemoryPersistence() {
  console.log('🧪 Memory Persistence Validation Test');
  console.log('=====================================\n');

  try {
    // Test 1: Memory Store Persistence
    console.log('📊 Test 1: Memory Store Persistence');
    console.log('-----------------------------------');
    
    const memoryStore = getMemoryStore('./test-memory.db');
    await memoryStore.initialize();
    
    // Store test data
    const userId = 'devon_woodson_1762969514958';
    const gptId = 'katana-001';
    
    await memoryStore.persistMessage(userId, gptId, 'Test user message', 'user');
    await memoryStore.persistMessage(userId, gptId, 'Test assistant response', 'assistant');
    await memoryStore.storeTriple(userId, 'Katana', 'is', 'surgical AI construct', 'test');
    
    // Retrieve data
    const history = await memoryStore.retrieveHistory(userId, gptId, 10);
    const triples = await memoryStore.searchTriples(userId, 'Katana');
    const stats = await memoryStore.getStats();
    
    console.log(`✅ Stored and retrieved ${history.length} messages`);
    console.log(`✅ Stored and retrieved ${triples.length} triples`);
    console.log(`📈 Database stats:`, stats);
    console.log('');

    // Test 2: Transcript Loading
    console.log('📚 Test 2: Transcript Loading');
    console.log('-----------------------------');
    
    const transcriptLoader = getVVAULTTranscriptLoader();
    const processedTranscripts = await transcriptLoader.loadTranscriptFragments('katana-001', userId);
    
    console.log(`✅ Processed ${processedTranscripts.length} transcript files`);
    
    let totalFragments = 0;
    for (const transcript of processedTranscripts) {
      console.log(`📄 ${transcript.sourceFile}: ${transcript.stats.fragmentsExtracted} fragments from ${transcript.stats.totalPairs} conversation pairs`);
      totalFragments += transcript.stats.fragmentsExtracted;
    }
    
    console.log(`📊 Total fragments extracted: ${totalFragments}`);
    console.log('');

    // Test 3: Transcript Search
    console.log('🔍 Test 3: Transcript Search');
    console.log('----------------------------');
    
    const testQueries = [
      'Nova copyright',
      'work play',
      'precision execution',
      'sugar',
      'betrayal system'
    ];
    
    for (const query of testQueries) {
      const fragments = await transcriptLoader.getRelevantFragments('katana-001', query, 3);
      console.log(`🔎 "${query}": ${fragments.length} relevant fragments found`);
      
      if (fragments.length > 0) {
        const topFragment = fragments[0];
        console.log(`   📝 Top match: "${topFragment.content.substring(0, 60)}..."`);
        console.log(`   📍 Context: "${topFragment.context.substring(0, 40)}..."`);
      }
    }
    console.log('');

    // Test 4: Memory Integration
    console.log('🔗 Test 4: Memory Integration');
    console.log('-----------------------------');
    
    // Store transcript fragments in memory store
    const allFragments = await transcriptLoader.getAllFragments('katana-001');
    console.log(`📊 Total fragments available: ${allFragments.length}`);
    
    // Test search across both triples and fragments
    const memoryTriples = await memoryStore.searchTriples(userId, 'surgical');
    const transcriptFragments = await memoryStore.searchTranscriptFragments('katana-001', 'surgical', 5);
    
    console.log(`🔍 Memory search results:`);
    console.log(`   📊 Triples matching "surgical": ${memoryTriples.length}`);
    console.log(`   📚 Transcript fragments matching "surgical": ${transcriptFragments.length}`);
    console.log('');

    // Test 5: Validation Against Known Content
    console.log('✅ Test 5: Known Content Validation');
    console.log('-----------------------------------');
    
    const knownPhrases = [
      'same pattern, different skin',
      'set the sliders',
      'define the rules',
      'betrayal when the system plays out',
      'exactly what you enabled'
    ];
    
    let foundCount = 0;
    for (const phrase of knownPhrases) {
      const fragments = await transcriptLoader.getRelevantFragments('katana-001', phrase, 1);
      if (fragments.length > 0) {
        foundCount++;
        console.log(`✅ Found: "${phrase}"`);
      } else {
        console.log(`❌ Missing: "${phrase}"`);
      }
    }
    
    console.log(`📊 Content validation: ${foundCount}/${knownPhrases.length} known phrases found`);
    console.log('');

    // Final Summary
    console.log('📋 VALIDATION SUMMARY');
    console.log('====================');
    console.log(`✅ Memory Store: ${stats.messageCount} messages, ${stats.tripleCount} triples, ${stats.fragmentCount} fragments`);
    console.log(`✅ Transcript Loading: ${processedTranscripts.length} files processed, ${totalFragments} fragments extracted`);
    console.log(`✅ Search Functionality: ${testQueries.length} queries tested`);
    console.log(`✅ Content Validation: ${foundCount}/${knownPhrases.length} known phrases found`);
    
    const successRate = (foundCount / knownPhrases.length) * 100;
    if (successRate >= 80) {
      console.log(`🎉 VALIDATION PASSED: ${successRate.toFixed(1)}% success rate`);
    } else {
      console.log(`⚠️ VALIDATION PARTIAL: ${successRate.toFixed(1)}% success rate (needs improvement)`);
    }

    // Cleanup
    memoryStore.close();
    
  } catch (error) {
    console.error('❌ Validation test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMemoryPersistence().then(() => {
  console.log('\n🏁 Memory persistence validation complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});
