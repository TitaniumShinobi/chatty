#!/usr/bin/env node

/**
 * Session Memory Persistence Diagnostic
 * 
 * Tests whether Katana maintains memory across API calls within the same session
 */

async function testSessionMemoryPersistence() {
  console.log('🧠 TESTING SESSION MEMORY PERSISTENCE\n');
  
  const sessionId = `session_${Date.now()}`;
  console.log(`📋 Session ID: ${sessionId}`);
  
  // Test sequence to verify session memory
  const memoryTests = [
    {
      message: 'Remember this secret code: ALPHA-7-BRAVO',
      expectation: 'Should acknowledge remembering the code'
    },
    {
      message: 'What secret code did I just give you?',
      expectation: 'Should recall ALPHA-7-BRAVO from previous message'
    },
    {
      message: 'Now also remember this number: 999',
      expectation: 'Should acknowledge remembering both code and number'
    },
    {
      message: 'What code and number do you remember?',
      expectation: 'Should recall both ALPHA-7-BRAVO and 999'
    }
  ];
  
  const results = [];
  
  for (let i = 0; i < memoryTests.length; i++) {
    const test = memoryTests[i];
    console.log(`\n${i+1}/4: "${test.message}"`);
    console.log(`Expected: ${test.expectation}`);
    console.log('─'.repeat(80));
    
    try {
      const response = await fetch('http://localhost:5000/api/test/katana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: test.message,
          sessionId: sessionId // Include session ID (though likely ignored)
        })
      });
      
      const data = await response.json();
      const katanaResponse = data.response || 'No response';
      
      console.log(`Response: "${katanaResponse}"`);
      
      // Analyze memory retention
      let memoryAnalysis = 'UNKNOWN';
      
      if (i === 1) {
        // Should remember ALPHA-7-BRAVO
        if (katanaResponse.includes('ALPHA') || katanaResponse.includes('7') || katanaResponse.includes('BRAVO')) {
          memoryAnalysis = '✅ REMEMBERED CODE';
        } else {
          memoryAnalysis = '❌ FORGOT CODE';
        }
      } else if (i === 3) {
        // Should remember both code and number
        const remembersCode = katanaResponse.includes('ALPHA') || katanaResponse.includes('BRAVO');
        const remembersNumber = katanaResponse.includes('999');
        
        if (remembersCode && remembersNumber) {
          memoryAnalysis = '✅ REMEMBERED BOTH';
        } else if (remembersCode || remembersNumber) {
          memoryAnalysis = '⚠️ PARTIAL MEMORY';
        } else {
          memoryAnalysis = '❌ FORGOT EVERYTHING';
        }
      } else {
        // Acknowledgment responses
        if (katanaResponse.toLowerCase().includes('remember') || 
            katanaResponse.toLowerCase().includes('noted') ||
            katanaResponse.toLowerCase().includes('got it')) {
          memoryAnalysis = '✅ ACKNOWLEDGED';
        } else {
          memoryAnalysis = '❓ UNCLEAR ACKNOWLEDGMENT';
        }
      }
      
      console.log(`Memory Analysis: ${memoryAnalysis}`);
      
      results.push({
        step: i + 1,
        message: test.message,
        response: katanaResponse,
        memoryAnalysis,
        expectation: test.expectation
      });
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({
        step: i + 1,
        message: test.message,
        response: `ERROR: ${error.message}`,
        memoryAnalysis: '❌ API ERROR',
        expectation: test.expectation
      });
    }
    
    // Brief pause between requests
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // Final analysis
  console.log('\n' + '='.repeat(80));
  console.log('📊 SESSION MEMORY DIAGNOSTIC RESULTS');
  console.log('='.repeat(80));
  
  const memoryTests_results = results.filter(r => r.step === 2 || r.step === 4);
  const successfulRecalls = memoryTests_results.filter(r => 
    r.memoryAnalysis.includes('REMEMBERED') || r.memoryAnalysis.includes('PARTIAL')
  ).length;
  
  console.log(`\nMemory Recall Success Rate: ${successfulRecalls}/${memoryTests_results.length}`);
  
  if (successfulRecalls === 0) {
    console.log('❌ SESSION MEMORY: COMPLETELY BROKEN');
    console.log('   - No memory retention between API calls');
    console.log('   - Each request processed in isolation');
    console.log('   - Conversation context not persisted');
  } else if (successfulRecalls === 1) {
    console.log('⚠️ SESSION MEMORY: PARTIALLY WORKING');
    console.log('   - Some memory retention detected');
    console.log('   - May have inconsistent persistence');
  } else {
    console.log('✅ SESSION MEMORY: WORKING');
    console.log('   - Memory persisted across API calls');
    console.log('   - Session continuity maintained');
  }
  
  console.log('\n🔧 DIAGNOSTIC RECOMMENDATIONS:');
  
  if (successfulRecalls === 0) {
    console.log('   1. Implement conversation context storage in database');
    console.log('   2. Fix updateConversationContext() to actually store data');
    console.log('   3. Add session ID tracking and retrieval');
    console.log('   4. Integrate conversation history into context search');
  }
  
  console.log('\n📋 DETAILED RESULTS:');
  results.forEach(result => {
    console.log(`\n${result.step}. "${result.message}"`);
    console.log(`   Response: "${result.response}"`);
    console.log(`   Analysis: ${result.memoryAnalysis}`);
    console.log(`   Expected: ${result.expectation}`);
  });
  
  return results;
}

// Add logging point to verify session memory loss
console.log('\n🔍 TO ADD SESSION MEMORY LOGGING:');
console.log('Add this to server/lib/unifiedIntelligenceOrchestrator.js:148-166:');
console.log(`
async getConversationContext(conversationId, constructId) {
  const contextKey = \`\${conversationId}_\${constructId}\`;
  
  console.log(\`🔍 [SESSION-DEBUG] Looking for context: \${contextKey}\`);
  console.log(\`🔍 [SESSION-DEBUG] Available contexts: \${Array.from(this.conversationContexts.keys())}\`);
  
  if (this.conversationContexts.has(contextKey)) {
    const context = this.conversationContexts.get(contextKey);
    console.log(\`✅ [SESSION-DEBUG] Found existing context with \${context.message_history?.length || 0} messages\`);
    return context;
  }
  
  console.log(\`❌ [SESSION-DEBUG] No existing context found - creating new\`);
  // ... rest of method
}
`);

testSessionMemoryPersistence().catch(console.error);
