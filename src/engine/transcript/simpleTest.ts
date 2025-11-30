/**
 * Simple Test for Enhanced Transcript Memory System
 * 
 * Direct instantiation test to bypass factory function issues
 */

import { TranscriptMemoryOrchestrator } from './TranscriptMemoryOrchestrator';

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
 * Run the simple test
 */
export async function runSimpleTranscriptTest(): Promise<void> {
  console.log('🚀 Simple Transcript Memory Test');
  console.log('=' .repeat(50));
  
  try {
    // Direct instantiation
    console.log('📚 Creating orchestrator...');
    const orchestrator = new TranscriptMemoryOrchestrator({
      maxAnchorsPerResponse: 5,
      minAnchorSignificance: 0.6,
      enableFuzzyMatching: true,
      strictValidation: true
    });
    
    console.log('✅ Orchestrator created');
    
    // Initialize with transcript
    console.log('📖 Initializing with transcript...');
    await orchestrator.initialize(SAMPLE_TRANSCRIPT, 'katana-001');
    
    const stats = orchestrator.getStats();
    console.log(`✅ Initialized with ${stats.totalAnchors} anchors`);
    console.log(`📊 Types:`, stats.indexStats.typeBreakdown);
    
    // Test a simple query
    console.log('\n🧪 Testing memory prompt generation...');
    const testQuestion = 'what did you say about Nova and copyright?';
    const injection = await orchestrator.generateMemoryPrompt(testQuestion);
    
    console.log(`Question: "${testQuestion}"`);
    console.log(`Strategy: ${injection.injectionStrategy}`);
    console.log(`Reasoning: ${injection.reasoning}`);
    console.log(`Anchors found: ${injection.memoryContext.relevantAnchors.length}`);
    console.log(`Confidence: ${injection.memoryContext.confidence.toFixed(3)}`);
    
    if (injection.memoryContext.relevantAnchors.length > 0) {
      console.log('\nTop anchor:');
      const topAnchor = injection.memoryContext.relevantAnchors[0];
      console.log(`  [${topAnchor.type}] ${topAnchor.anchor}`);
      console.log(`  Significance: ${topAnchor.significance}`);
    }
    
    console.log('\n✅ Simple test completed successfully!');
    
  } catch (error) {
    console.error('❌ Simple test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).runSimpleTranscriptTest = runSimpleTranscriptTest;
}
