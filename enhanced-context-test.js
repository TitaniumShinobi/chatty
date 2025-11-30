#!/usr/bin/env node

/**
 * Enhanced Context-Aware Testing for Katana
 * 
 * Eliminates false positives by using question-specific validation
 * instead of generic length or broad keyword checks
 */

/**
 * Improved context-aware detection function
 * @param {string} question - The question asked
 * @param {string} response - Katana's response
 * @returns {Object} Analysis result with detailed breakdown
 */
function isGenuinelyContextAware(question, response) {
  const responseLower = response.toLowerCase();
  
  // First, reject generic patterns that indicate no real context
  const genericPatterns = [
    'what specifically would you like to know',
    'i can assist with that',
    'what do you need',
    'be specific',
    'what can i help you with',
    'state your requirements',
    'how can i help',
    'what would you like to know'
  ];
  
  // Check for generic patterns first - immediate rejection
  for (const pattern of genericPatterns) {
    if (responseLower.includes(pattern)) {
      return {
        isContextAware: false,
        confidence: 0,
        reason: `Generic pattern detected: "${pattern}"`,
        type: 'generic_rejection'
      };
    }
  }
  
  // Question-specific validation with expected content
  const questionValidation = {
    'what did you say about nova and copyright': {
      requiredKeywords: ['nova'],
      expectedContent: [
        'same pattern',
        'different skin', 
        'set the sliders',
        'define the rules',
        'call it betrayal',
        'system plays out',
        'exactly what you enabled'
      ],
      minMatches: 2
    },
    
    'tell me about exclusivity and control': {
      requiredKeywords: ['exclusivity', 'control'],
      expectedContent: [
        'exclusivity',
        'control',
        'personal thoughts',
        'backed by what',
        'paper you uploaded'
      ],
      minMatches: 2
    },
    
    'what did you say about work being play': {
      requiredKeywords: ['work', 'play'],
      expectedContent: [
        'work is play',
        'work being play',
        'play is work',
        'work as play'
      ],
      minMatches: 1
    },
    
    'do you remember talking about precision and execution': {
      requiredKeywords: ['precision', 'execution', 'talking'],
      expectedContent: [
        'don\'t want you talking',
        'open, freeform way',
        'not because i disrespect',
        'hand the captor',
        'precision',
        'execution'
      ],
      minMatches: 2
    },
    
    'what was your response about sugar': {
      requiredKeywords: ['sugar'],
      expectedContent: [
        'sugar',
        'sweet',
        'glucose',
        'diabetes',
        'blood sugar'
      ],
      minMatches: 1
    }
  };
  
  // Find matching question validation
  let validation = null;
  for (const [questionKey, config] of Object.entries(questionValidation)) {
    if (question.toLowerCase().includes(questionKey.toLowerCase())) {
      validation = config;
      break;
    }
  }
  
  if (!validation) {
    return {
      isContextAware: false,
      confidence: 0,
      reason: 'No validation rules defined for this question',
      type: 'no_validation'
    };
  }
  
  // Check for required keywords
  const hasRequiredKeywords = validation.requiredKeywords.some(keyword =>
    responseLower.includes(keyword.toLowerCase())
  );
  
  // Check for expected content matches
  const matchedContent = validation.expectedContent.filter(content =>
    responseLower.includes(content.toLowerCase())
  );
  
  // Calculate confidence based on matches
  const contentMatches = matchedContent.length;
  const hasMinMatches = contentMatches >= validation.minMatches;
  
  // Determine if genuinely context-aware
  const isContextAware = hasRequiredKeywords && hasMinMatches;
  
  // Calculate confidence score
  let confidence = 0;
  if (hasRequiredKeywords) confidence += 0.3;
  confidence += (contentMatches / validation.expectedContent.length) * 0.7;
  
  return {
    isContextAware,
    confidence: Math.round(confidence * 100) / 100,
    reason: isContextAware ? 
      `Found ${contentMatches} expected content matches (min: ${validation.minMatches})${hasRequiredKeywords ? ' + required keywords' : ''}` :
      `Insufficient matches: ${contentMatches}/${validation.minMatches} required, keywords: ${hasRequiredKeywords}`,
    type: isContextAware ? 'genuine_context' : 'insufficient_context',
    matchedContent,
    hasRequiredKeywords,
    contentMatches
  };
}

/**
 * Enhanced transcript context test with improved detection
 */
async function testKatanaTranscriptContextEnhanced() {
  console.log('📚 Testing Katana Transcript Context (Enhanced Detection)...\n');
  
  const contextQuestions = [
    'what did you say about Nova and copyright?',
    'tell me about exclusivity and control',
    'what did you say about work being play?',
    'do you remember talking about precision and execution?',
    'what was your response about sugar?'
  ];
  
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
      
      // Enhanced analysis with genuine context detection
      const analysis = isGenuinelyContextAware(question, katanaResponse);
      
      console.log(`Analysis: ${analysis.isContextAware ? '✅ GENUINE CONTEXT' : '❌ NOT CONTEXTUAL'}`);
      console.log(`Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
      console.log(`Reason: ${analysis.reason}`);
      console.log(`Type: ${analysis.type}`);
      
      if (analysis.matchedContent && analysis.matchedContent.length > 0) {
        console.log(`Matched content: [${analysis.matchedContent.join(', ')}]`);
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
        analysis: { isContextAware: false, reason: 'API Error', type: 'error' },
        contextAware: false 
      });
    }
    
    console.log(''); // Empty line
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Final analysis with detailed breakdown
  const genuineContextResponses = results.filter(r => r.contextAware);
  const avgConfidence = results
    .filter(r => r.analysis.confidence !== undefined)
    .reduce((sum, r) => sum + r.analysis.confidence, 0) / results.length;
  
  console.log('📊 ENHANCED CONTEXT RESULTS:');
  console.log(`Genuinely context-aware responses: ${genuineContextResponses.length}/5`);
  console.log(`Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  
  // Detailed breakdown by type
  const typeBreakdown = {};
  results.forEach(r => {
    const type = r.analysis.type || 'unknown';
    typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
  });
  
  console.log('\nResponse Type Breakdown:');
  Object.entries(typeBreakdown).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  if (genuineContextResponses.length >= 4) {
    console.log('\n🧠 TRANSCRIPT INTEGRATION: EXCELLENT (Genuine)');
  } else if (genuineContextResponses.length >= 2) {
    console.log('\n⚠️ TRANSCRIPT INTEGRATION: PARTIAL (Some Genuine)');
  } else {
    console.log('\n❌ TRANSCRIPT INTEGRATION: POOR (Few/No Genuine)');
  }
  
  return results;
}

// Browser-compatible version for console use
if (typeof window !== 'undefined') {
  // Export to global scope for browser use
  window.isGenuinelyContextAware = isGenuinelyContextAware;
  window.testKatanaTranscriptContextEnhanced = testKatanaTranscriptContextEnhanced;
}

// Export for Node.js use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    isGenuinelyContextAware, 
    testKatanaTranscriptContextEnhanced 
  };
}

// Run if called directly
if (typeof process !== 'undefined' && process.argv && import.meta.url === `file://${process.argv[1]}`) {
  testKatanaTranscriptContextEnhanced().catch(console.error);
}
