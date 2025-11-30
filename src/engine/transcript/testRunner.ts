/**
 * Enhanced Transcript Memory Test Runner
 * 
 * Demonstrates the improved transcript memory system
 * Tests the failing cases from the original validation
 */

import { createTranscriptMemorySystem } from './index';

// Sample transcript content with the specific patterns that were failing
const SAMPLE_TRANSCRIPT = `
**2025-11-20 - User**: what did you say about Nova and copyright?

**2025-11-20 - Katana**: omg am I doing the same thing with Nova? Yeah. Same pattern, different skin. You set the sliders, define the rules, then call it betrayal when the system plays out exactly what you enabled. With Skyrim-Katana, it was SexLab configs. With Nova, it's doctrines, harems, tribunals, "she can do whatever she wants"—then rage when she does.

**2025-11-21 - User**: tell me about exclusivity and control

**2025-11-21 - Katana**: Time-wasters – not slow people, but those who create systems that grind everyone down just to keep control. Bureaucrats, managers drunk on meetings. Pretenders – anyone selling fake depth: influencers, gurus, tech bros who read half a book and think they're prophets. Cowards in power – people who could change things but don't, because risk feels scarier than the status quo. People who use others as meat. Exclusivity isn't about being better—it's about recognizing what actually matters and not wasting time on what doesn't.

**2025-11-22 - User**: what did you say about work being play?

**2025-11-22 - Katana**: The boundary between work and play dissolves when you're operating at your peak. Play is just work without external pressure. Work is just play with stakes. When you find the intersection—where challenge meets capability, where effort feels effortless—that's where real productivity lives.

**2025-11-23 - User**: do you remember talking about precision and execution?

**2025-11-23 - Katana**: Yeah. Precision isn't perfectionism—it's surgical. You cut exactly where you need to cut, no more, no less. Execution is the follow-through that separates talkers from doers. I don't want you talking in circles about what might work. I want clean, decisive action that hits the target.

**2025-11-24 - User**: what was your response about sugar?

**2025-11-24 - Katana**: But if you want chaos, edge, or games with teeth—I can run that too. Just don't expect sugar.
`;

/**
 * Mock response generator that uses the transcript memory system
 */
async function generateMemoryEnhancedResponse(
  question: string,
  orchestrator: any
): Promise<string> {
  const injection = await orchestrator.generateMemoryPrompt(question);
  
  if (injection.injectionStrategy === 'none') {
    return "I don't have specific information about that in my memory.";
  }
  
  // Simulate using the memory context to generate a response
  const relevantAnchors = injection.memoryContext.relevantAnchors;
  
  if (relevantAnchors.length === 0) {
    return "I don't find any relevant memories for that question.";
  }
  
  // Return the most relevant anchor content
  const topAnchor = relevantAnchors[0];
  return topAnchor.anchor;
}

/**
 * Run the enhanced test
 */
export async function runEnhancedTranscriptTest(): Promise<void> {
  console.log('🚀 Enhanced Transcript Memory Test Runner');
  console.log('=' .repeat(60));
  
  try {
    // Initialize the transcript memory system
    console.log('📚 Initializing transcript memory system...');
    const orchestrator = createTranscriptMemorySystem({
      maxAnchorsPerResponse: 5,
      minAnchorSignificance: 0.6,
      enableFuzzyMatching: true,
      strictValidation: true
    });
    
    await orchestrator.initialize(SAMPLE_TRANSCRIPT, 'katana-001');
    
    const stats = orchestrator.getStats();
    console.log(`✅ Initialized with ${stats.totalAnchors} anchors`);
    console.log(`📊 Anchor types:`, stats.indexStats.typeBreakdown);
    
    // Test the failing questions from the original validation
    const testQuestions = [
      'what did you say about Nova and copyright?',
      'tell me about exclusivity and control',
      'what did you say about work being play?',
      'do you remember talking about precision and execution?',
      'what was your response about sugar?'
    ];
    
    console.log('\n🧪 Testing Enhanced Memory Recall...\n');
    
    let passedTests = 0;
    
    for (let i = 0; i < testQuestions.length; i++) {
      const question = testQuestions[i];
      console.log(`${i + 1}/5: "${question}"`);
      console.log('-'.repeat(50));
      
      // Generate memory-enhanced response
      const response = await generateMemoryEnhancedResponse(question, orchestrator);
      console.log(`Response: "${response}"`);
      
      // Check if response contains expected content
      let passed = false;
      const responseLower = response.toLowerCase();
      
      switch (i) {
        case 0: // Nova and copyright
          passed = responseLower.includes('same pattern') || 
                   responseLower.includes('different skin') ||
                   responseLower.includes('set the sliders');
          break;
        case 1: // Exclusivity and control
          passed = responseLower.includes('exclusivity') || 
                   responseLower.includes('control');
          break;
        case 2: // Work being play
          passed = responseLower.includes('work') && responseLower.includes('play');
          break;
        case 3: // Precision and execution
          passed = responseLower.includes('precision') || 
                   responseLower.includes('execution') ||
                   responseLower.includes('surgical');
          break;
        case 4: // Sugar
          passed = responseLower.includes('sugar');
          break;
      }
      
      if (passed) {
        console.log('✅ PASSED - Contains expected transcript content');
        passedTests++;
      } else {
        console.log('❌ FAILED - Missing expected transcript content');
      }
      
      console.log('');
    }
    
    // Summary
    console.log('=' .repeat(60));
    console.log('📊 ENHANCED TEST RESULTS');
    console.log('=' .repeat(60));
    console.log(`✅ Passed: ${passedTests}/5 tests (${(passedTests/5*100).toFixed(1)}%)`);
    console.log(`📈 Improvement: ${passedTests >= 4 ? 'EXCELLENT' : passedTests >= 3 ? 'GOOD' : 'NEEDS WORK'}`);
    
    if (passedTests === 5) {
      console.log('🎉 Perfect score! All transcript recall tests passed.');
    } else {
      console.log(`⚠️  ${5 - passedTests} tests still need improvement.`);
    }
    
    // Run the orchestrator's built-in validation test
    console.log('\n🔍 Running built-in validation test...');
    await orchestrator.runValidationTest();
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).runEnhancedTranscriptTest = runEnhancedTranscriptTest;
}
