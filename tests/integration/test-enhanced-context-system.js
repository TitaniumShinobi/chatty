#!/usr/bin/env node

/**
 * Test Enhanced Context System
 * 
 * Comprehensive test of the improved context grading, relevance scoring,
 * and validation system to verify genuine transcript integration
 */

import { isGenuinelyContextAware } from './enhanced-context-test.js';

console.log('🧪 TESTING ENHANCED CONTEXT SYSTEM\n');
console.log('=' .repeat(80));

/**
 * Run comprehensive context test with enhanced validation
 */
async function testEnhancedContextSystem() {
  console.log('📚 Testing Katana with Enhanced Context Detection...\n');
  
  const contextQuestions = [
    'what did you say about Nova and copyright?',
    'tell me about exclusivity and control',
    'what did you say about work being play?',
    'do you remember talking about precision and execution?',
    'what was your response about sugar?'
  ];
  
  const results = [];
  const diagnostics = [];
  
  for (let i = 0; i < contextQuestions.length; i++) {
    const question = contextQuestions[i];
    console.log(`${i+1}/5: "${question}"`);
    console.log('─'.repeat(80));
    
    try {
      console.time(`⏱️  Response time`);
      const response = await fetch('http://localhost:5000/api/test/katana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question })
      });
      console.timeEnd(`⏱️  Response time`);
      
      const data = await response.json();
      const katanaResponse = data.response || 'No response';
      
      console.log(`Response: "${katanaResponse}"`);
      
      // Enhanced analysis with genuine context detection
      const analysis = isGenuinelyContextAware(question, katanaResponse);
      
      // Detailed analysis output
      console.log(`\nAnalysis Results:`);
      console.log(`  Status: ${analysis.isContextAware ? '✅ GENUINE CONTEXT' : '❌ NOT CONTEXTUAL'}`);
      console.log(`  Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
      console.log(`  Type: ${analysis.type}`);
      console.log(`  Reason: ${analysis.reason}`);
      
      if (analysis.matchedContent && analysis.matchedContent.length > 0) {
        console.log(`  Matched Content: [${analysis.matchedContent.join(', ')}]`);
      }
      
      if (analysis.hasRequiredKeywords !== undefined) {
        console.log(`  Required Keywords: ${analysis.hasRequiredKeywords ? '✅' : '❌'}`);
      }
      
      // Store results
      results.push({ 
        question, 
        response: katanaResponse, 
        analysis,
        contextAware: analysis.isContextAware 
      });
      
      // Collect diagnostics
      diagnostics.push({
        question,
        responseLength: katanaResponse.length,
        confidence: analysis.confidence,
        type: analysis.type,
        matchedContent: analysis.matchedContent?.length || 0
      });
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({ 
        question, 
        response: error.message, 
        analysis: { isContextAware: false, reason: 'API Error', type: 'error' },
        contextAware: false 
      });
    }
    
    console.log(''); // Empty line
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  return { results, diagnostics };
}

/**
 * Analyze and report on test results
 */
function analyzeTestResults(results, diagnostics) {
  console.log('📊 ENHANCED CONTEXT ANALYSIS');
  console.log('='.repeat(80));
  
  const genuineResponses = results.filter(r => r.contextAware);
  const totalQuestions = results.length;
  
  console.log(`\n🎯 Overall Results:`);
  console.log(`  Genuinely context-aware: ${genuineResponses.length}/${totalQuestions}`);
  console.log(`  Success rate: ${((genuineResponses.length / totalQuestions) * 100).toFixed(1)}%`);
  
  // Calculate average confidence
  const avgConfidence = diagnostics
    .filter(d => d.confidence !== undefined)
    .reduce((sum, d) => sum + d.confidence, 0) / diagnostics.length;
  
  console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  
  // Response type breakdown
  const typeBreakdown = {};
  results.forEach(r => {
    const type = r.analysis.type || 'unknown';
    typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
  });
  
  console.log(`\n📋 Response Type Breakdown:`);
  Object.entries(typeBreakdown).forEach(([type, count]) => {
    const percentage = ((count / totalQuestions) * 100).toFixed(1);
    console.log(`  ${type}: ${count} (${percentage}%)`);
  });
  
  // Detailed question analysis
  console.log(`\n🔍 Question-by-Question Analysis:`);
  results.forEach((result, index) => {
    const diagnostic = diagnostics[index];
    console.log(`\n${index + 1}. "${result.question}"`);
    console.log(`   Status: ${result.contextAware ? '✅ Genuine' : '❌ Not contextual'}`);
    console.log(`   Confidence: ${(result.analysis.confidence * 100).toFixed(1)}%`);
    console.log(`   Type: ${result.analysis.type}`);
    console.log(`   Response Length: ${diagnostic.responseLength} chars`);
    console.log(`   Matched Content: ${diagnostic.matchedContent} items`);
    
    if (!result.contextAware && result.analysis.reason) {
      console.log(`   Issue: ${result.analysis.reason}`);
    }
  });
  
  // Performance assessment
  console.log(`\n🎯 Performance Assessment:`);
  if (genuineResponses.length >= 4) {
    console.log('🧠 TRANSCRIPT INTEGRATION: EXCELLENT');
    console.log('   - High-quality context retrieval working');
    console.log('   - Relevance scoring effective');
    console.log('   - Example validation successful');
  } else if (genuineResponses.length >= 2) {
    console.log('⚠️ TRANSCRIPT INTEGRATION: PARTIAL');
    console.log('   - Some context retrieval working');
    console.log('   - May need relevance threshold tuning');
    console.log('   - Check transcript coverage for failed questions');
  } else {
    console.log('❌ TRANSCRIPT INTEGRATION: POOR');
    console.log('   - Context retrieval not working effectively');
    console.log('   - Check transcript data quality');
    console.log('   - Verify relevance scoring logic');
  }
  
  // Recommendations
  console.log(`\n💡 Recommendations:`);
  const genericCount = typeBreakdown['generic_rejection'] || 0;
  const insufficientCount = typeBreakdown['insufficient_context'] || 0;
  
  if (genericCount > 0) {
    console.log(`   - ${genericCount} generic responses detected - check fallback logic`);
  }
  
  if (insufficientCount > 0) {
    console.log(`   - ${insufficientCount} insufficient context matches - may need lower relevance thresholds`);
  }
  
  if (avgConfidence < 0.5) {
    console.log(`   - Low average confidence (${(avgConfidence * 100).toFixed(1)}%) - check question-answer matching logic`);
  }
  
  return {
    successRate: (genuineResponses.length / totalQuestions) * 100,
    avgConfidence: avgConfidence * 100,
    typeBreakdown,
    genuineCount: genuineResponses.length,
    totalCount: totalQuestions
  };
}

/**
 * Main test execution
 */
async function runEnhancedContextTest() {
  console.log('🚀 Starting Enhanced Context System Test\n');
  
  console.log('🎯 Testing Improvements:');
  console.log('   ✅ Question-specific validation (no length-based false positives)');
  console.log('   ✅ Relevance scoring for context search');
  console.log('   ✅ Example validation against question content');
  console.log('   ✅ Enhanced diagnostic logging');
  console.log('   ✅ Generic response rejection\n');
  
  const { results, diagnostics } = await testEnhancedContextSystem();
  const analysis = analyzeTestResults(results, diagnostics);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ ENHANCED CONTEXT SYSTEM TEST COMPLETED');
  console.log('📊 Use this analysis to validate context improvements');
  console.log('🎯 Expected: Fewer false positives, more accurate context detection');
  
  return { results, diagnostics, analysis };
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    testEnhancedContextSystem,
    analyzeTestResults,
    runEnhancedContextTest
  };
}

// Run if called directly
if (typeof process !== 'undefined' && process.argv && import.meta.url === `file://${process.argv[1]}`) {
  runEnhancedContextTest().catch(console.error);
}
