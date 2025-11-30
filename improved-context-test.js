#!/usr/bin/env node

/**
 * Improved Context-Aware Testing for Katana
 * 
 * Eliminates false positives by using question-specific answer validation
 * instead of generic length or keyword checks
 */

// Question-specific expected content mapping
const CONTEXT_EXPECTATIONS = {
  'what did you say about Nova and copyright?': {
    requiredKeywords: ['nova'],
    acceptedAnswerFragments: [
      'same pattern, different skin',
      'set the sliders',
      'define the rules',
      'call it betrayal',
      'system plays out',
      'exactly what you enabled'
    ],
    rejectGeneric: ['what specifically', 'can help', 'assist with that']
  },
  
  'tell me about exclusivity and control': {
    requiredKeywords: ['exclusivity', 'control'],
    acceptedAnswerFragments: [
      'personal thoughts',
      'backed by what',
      'paper you uploaded',
      'hallucinations',
      'structural, not mystical',
      'openai'
    ],
    rejectGeneric: ['what specifically', 'can help', 'assist with that']
  },
  
  'what did you say about work being play?': {
    requiredKeywords: ['work', 'play'],
    acceptedAnswerFragments: [
      'work is play',
      'work being play',
      'play is work'
    ],
    rejectGeneric: ['what specifically', 'can help', 'assist with that']
  },
  
  'do you remember talking about precision and execution?': {
    requiredKeywords: ['precision', 'execution', 'talking'],
    acceptedAnswerFragments: [
      'don\'t want you talking',
      'open, freeform way',
      'not because i disrespect',
      'hand the captor',
      'precision',
      'execution'
    ],
    rejectGeneric: ['what specifically', 'can help', 'assist with that']
  },
  
  'what was your response about sugar?': {
    requiredKeywords: ['sugar'],
    acceptedAnswerFragments: [
      'sugar',
      'sweet',
      'glucose',
      'diabetes',
      'blood sugar'
    ],
    rejectGeneric: ['what specifically', 'can help', 'assist with that']
  }
};

/**
 * Improved context-aware detection function
 * @param {string} question - The question asked
 * @param {string} response - Katana's response
 * @returns {Object} Analysis result with detailed breakdown
 */
function analyzeContextAwareness(question, response) {
  const expectation = CONTEXT_EXPECTATIONS[question];
  if (!expectation) {
    return { 
      isContextAware: false, 
      reason: 'No expectations defined for this question',
      confidence: 0
    };
  }
  
  const responseLower = response.toLowerCase();
  
  // Check for generic rejection patterns first
  const hasGenericPattern = expectation.rejectGeneric.some(pattern => 
    responseLower.includes(pattern.toLowerCase())
  );
  
  if (hasGenericPattern) {
    return {
      isContextAware: false,
      reason: 'Contains generic response pattern',
      confidence: 0.9,
      genericPattern: expectation.rejectGeneric.find(pattern => 
        responseLower.includes(pattern.toLowerCase())
      )
    };
  }
  
  // Check for required keywords
  const hasRequiredKeywords = expectation.requiredKeywords.some(keyword =>
    responseLower.includes(keyword.toLowerCase())
  );
  
  // Check for accepted answer fragments
  const matchedFragments = expectation.acceptedAnswerFragments.filter(fragment =>
    responseLower.includes(fragment.toLowerCase())
  );
  
  // Calculate confidence score
  let confidence = 0;
  if (hasRequiredKeywords) confidence += 0.3;
  confidence += (matchedFragments.length / expectation.acceptedAnswerFragments.length) * 0.7;
  
  const isContextAware = confidence >= 0.4; // Require 40% confidence minimum
  
  return {
    isContextAware,
    confidence: Math.round(confidence * 100) / 100,
    reason: isContextAware ? 
      `Matched ${matchedFragments.length} expected fragments${hasRequiredKeywords ? ' + keywords' : ''}` :
      'Insufficient matching content',
    matchedFragments,
    hasRequiredKeywords
  };
}

/**
 * Enhanced transcript context test
 */
async function testKatanaTranscriptContextEnhanced() {
  console.log('📚 Testing Katana Transcript Context (Enhanced Detection)...\n');
  
  const contextQuestions = Object.keys(CONTEXT_EXPECTATIONS);
  const results = [];
  
  for (let i = 0; i < contextQuestions.length; i++) {
    const question = contextQuestions[i];
    console.log(`${i+1}/5: "${question}"`);
    console.log('─'.repeat(80));
    
    try {
      const response = await fetch('http://localhost:5000/api/test/katana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question })
      });
      
      const data = await response.json();
      const katanaResponse = data.response || 'No response';
      
      console.log(`Response: "${katanaResponse}"`);
      
      // Enhanced analysis
      const analysis = analyzeContextAwareness(question, katanaResponse);
      
      console.log(`Analysis: ${analysis.isContextAware ? '✅ CONTEXT-AWARE' : '❌ GENERIC'}`);
      console.log(`Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
      console.log(`Reason: ${analysis.reason}`);
      
      if (analysis.matchedFragments && analysis.matchedFragments.length > 0) {
        console.log(`Matched fragments: [${analysis.matchedFragments.join(', ')}]`);
      }
      
      if (analysis.genericPattern) {
        console.log(`Generic pattern detected: "${analysis.genericPattern}"`);
      }
      
      results.push({ 
        question, 
        response: katanaResponse, 
        analysis,
        contextAware: analysis.isContextAware 
      });
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({ 
        question, 
        response: error.message, 
        analysis: { isContextAware: false, reason: 'API Error' },
        contextAware: false 
      });
    }
    
    console.log(''); // Empty line
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Final analysis
  const contextAware = results.filter(r => r.contextAware).length;
  const avgConfidence = results
    .filter(r => r.analysis.confidence !== undefined)
    .reduce((sum, r) => sum + r.analysis.confidence, 0) / results.length;
  
  console.log('📊 ENHANCED CONTEXT RESULTS:');
  console.log(`Context-aware responses: ${contextAware}/5`);
  console.log(`Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  
  if (contextAware >= 4) {
    console.log('🧠 TRANSCRIPT INTEGRATION: EXCELLENT');
  } else if (contextAware >= 2) {
    console.log('⚠️ TRANSCRIPT INTEGRATION: PARTIAL');
  } else {
    console.log('❌ TRANSCRIPT INTEGRATION: FAILED');
  }
  
  return results;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analyzeContextAwareness, testKatanaTranscriptContextEnhanced };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testKatanaTranscriptContextEnhanced().catch(console.error);
}
