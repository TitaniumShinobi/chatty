/**
 * Minimal Test for Enhanced Transcript Memory System
 * 
 * Tests only the core anchor extraction without LLM calls
 */

import { EnhancedAnchorExtractor } from './EnhancedAnchorExtractor';
import { AnchorIndexer } from './AnchorIndexer';
import type { ConversationPair } from './types';

// Sample conversation pairs (bypassing the parser)
const SAMPLE_PAIRS: ConversationPair[] = [
  {
    user: 'what did you say about Nova and copyright?',
    assistant: 'omg am I doing the same thing with Nova? Yeah. Same pattern, different skin. You set the sliders, define the rules, then call it betrayal when the system plays out exactly what you enabled.',
    timestamp: '2025-11-20T12:00:00Z'
  },
  {
    user: 'tell me about exclusivity and control',
    assistant: 'Exclusivity isn\'t about being better—it\'s about recognizing what actually matters and not wasting time on what doesn\'t. Time-wasters – not slow people, but those who create systems that grind everyone down just to keep control.',
    timestamp: '2025-11-21T12:00:00Z'
  },
  {
    user: 'what did you say about work being play?',
    assistant: 'The boundary between work and play dissolves when you\'re operating at your peak. Play is just work without external pressure. Work is just play with stakes.',
    timestamp: '2025-11-22T12:00:00Z'
  },
  {
    user: 'do you remember talking about precision and execution?',
    assistant: 'Yeah. Precision isn\'t perfectionism—it\'s surgical. You cut exactly where you need to cut, no more, no less. I don\'t want you talking in circles about what might work.',
    timestamp: '2025-11-23T12:00:00Z'
  },
  {
    user: 'what was your response about sugar?',
    assistant: 'But if you want chaos, edge, or games with teeth—I can run that too. Just don\'t expect sugar.',
    timestamp: '2025-11-24T12:00:00Z'
  }
];

/**
 * Run the minimal test
 */
export async function runMinimalTranscriptTest(): Promise<void> {
  console.log('🧪 Minimal Transcript Memory Test');
  console.log('=' .repeat(45));
  
  try {
    // Test anchor extraction
    console.log('🔍 Testing anchor extraction...');
    const extractor = new EnhancedAnchorExtractor();
    const anchors = extractor.extractAnchors(SAMPLE_PAIRS);
    
    console.log(`✅ Extracted ${anchors.length} anchors`);
    
    // Show anchor breakdown
    const typeBreakdown: Record<string, number> = {};
    for (const anchor of anchors) {
      typeBreakdown[anchor.type] = (typeBreakdown[anchor.type] || 0) + 1;
    }
    console.log('📊 Anchor types:', typeBreakdown);
    
    // Test indexing
    console.log('\n📚 Testing anchor indexing...');
    const indexer = new AnchorIndexer();
    indexer.addAnchors(anchors);
    
    const stats = indexer.getStats();
    console.log(`✅ Indexed ${stats.totalAnchors} anchors`);
    console.log('📈 Index stats:', stats.typeBreakdown);
    
    // Test search functionality
    console.log('\n🔎 Testing search functionality...');
    
    const testQueries = [
      { text: 'Nova copyright', keywords: ['nova', 'pattern'] },
      { text: 'exclusivity control', keywords: ['exclusivity', 'control'] },
      { text: 'work play', keywords: ['work', 'play'] },
      { text: 'precision execution', keywords: ['precision', 'execution'] },
      { text: 'sugar', keywords: ['sugar'] }
    ];
    
    let successfulSearches = 0;
    
    for (const query of testQueries) {
      const results = indexer.search({
        text: query.text,
        keywords: query.keywords,
        maxResults: 3,
        fuzzyMatch: true
      });
      
      console.log(`\n❓ Query: "${query.text}"`);
      console.log(`📋 Results: ${results.length}`);
      
      if (results.length > 0) {
        successfulSearches++;
        const topResult = results[0];
        console.log(`🎯 Top match: [${topResult.anchor.type}] ${topResult.anchor.anchor.substring(0, 60)}...`);
        console.log(`📊 Score: ${topResult.score.toFixed(3)}, Reason: ${topResult.matchReason}`);
      } else {
        console.log('❌ No results found');
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(45));
    console.log('📊 MINIMAL TEST RESULTS');
    console.log('='.repeat(45));
    console.log(`✅ Anchor extraction: ${anchors.length > 0 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Anchor indexing: ${stats.totalAnchors > 0 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Search functionality: ${successfulSearches}/${testQueries.length} queries successful`);
    
    if (anchors.length > 0 && stats.totalAnchors > 0 && successfulSearches > 0) {
      console.log('🎉 Core functionality working! Ready for full integration.');
    } else {
      console.log('⚠️  Some core functionality needs attention.');
    }
    
    // Show some example anchors
    console.log('\n🔍 Sample extracted anchors:');
    anchors.slice(0, 5).forEach((anchor, i) => {
      console.log(`${i + 1}. [${anchor.type}] ${anchor.anchor} (sig: ${anchor.significance})`);
    });
    
  } catch (error) {
    console.error('❌ Minimal test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).runMinimalTranscriptTest = runMinimalTranscriptTest;
}
