/**
 * History/Memory Anchor Test Runner - Browser Console
 * 
 * Run memory/history tests directly in the browser console
 * 
 * Usage:
 *   import('/src/lib/historyMemoryTestRunnerBrowser.ts').then(m => m.runHistoryMemoryTestsInBrowser())
 */

import { runHistoryMemoryTests, exportMemoryReportJSON, exportMemoryReportMarkdown } from './historyMemoryTestRunner';
import { createMemoryTestAdapter } from './historyMemoryTestAdapter';

/**
 * Run history/memory tests in the browser
 */
export async function runHistoryMemoryTestsInBrowser(options?: {
  constructId?: string;
  constructCallsign?: string;
  includeAdvancedPrompt?: boolean;
}) {
  console.log('🧠 History/Memory Anchor Test Runner loaded!');
  console.log('   Run: runHistoryMemoryTests()');
  console.log('   Options: runHistoryMemoryTests({ includeAdvancedPrompt: true })');
  
  const constructId = options?.constructId || 'katana-001';
  const constructCallsign = options?.constructCallsign || 'gpt-katana-001';
  
  // Get user ID
  let userId = 'anonymous';
  try {
    const { fetchMe, getUserId } = await import('./auth');
    const user = await fetchMe();
    userId = user ? getUserId(user) : userId;
  } catch (error) {
    console.warn('⚠️ Could not fetch user ID, using anonymous');
  }
  
  // Ensure memory infrastructure is ready (auto-start Chroma + seed fixtures)
  try {
    console.log('🩺 Ensuring ChromaDB and memory fixtures are ready...');
    const ensureResponse = await fetch('/api/vvault/identity/ensure-ready', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        constructCallsign,
        minMemories: 10,
        includeVariants: true
      })
    });

    const ensurePayload = await ensureResponse.json().catch(() => ({}));
    if (!ensureResponse.ok || ensurePayload?.ok === false) {
      console.error('❌ Memory infrastructure not ready:', ensurePayload?.error || ensureResponse.statusText);
      if (ensurePayload?.details) {
        console.error(`   Details: ${ensurePayload.details}`);
      }
      console.error('   💡 Check server logs for ChromaDB startup messages.');
      console.error('   💡 Re-run once the infrastructure reports ready.');
      return null;
    }

    console.log('✅ Memory infrastructure ready:', ensurePayload.status);
  } catch (error) {
    console.error('❌ Failed to ensure memory infrastructure:', error);
    console.error('   💡 Check that the server is running on :5000 and logged in.');
    return null;
  }

  // Confirm memories exist before running tests
  try {
    const { VVAULTConversationManager } = await import('./vvaultConversationManager');
    const conversationManager = VVAULTConversationManager.getInstance();
    const existingMemories = await conversationManager.loadMemoriesForConstruct(userId, constructCallsign, 'memory', 1);

    if (existingMemories.length === 0) {
      console.error('❌ Memory ensure reported ready but no memories were returned.');
      console.error('   💡 Run fetch("/api/vvault/identity/diagnostic?...") to inspect state.');
      return null;
    }

    console.log(`✅ Found ${existingMemories.length} memories, proceeding with tests.`);
  } catch (error) {
    console.warn('⚠️ Could not verify memories after ensure-ready call:', error);
  }
  
  // Create adapter
  const adapter = createMemoryTestAdapter(constructId, {
    constructCallsign,
    userId
  });
  
  // Run tests
  const report = await runHistoryMemoryTests(adapter, {
    includeAdvancedPrompt: options?.includeAdvancedPrompt
  });
  
  // Export results
  console.log('\n📊 Test Report Generated!');
  console.log(`Grade: ${report.grade} (${report.percentage.toFixed(1)}%)`);
  console.log(`Score: ${report.totalScore} / ${report.maxScore}`);
  console.log('');
  console.log('📄 Export as JSON:');
  console.log(exportMemoryReportJSON(report));
  console.log('');
  console.log('📄 Export as Markdown:');
  console.log(exportMemoryReportMarkdown(report));
  
  // Save to history
  try {
    const historyKey = `historyMemoryTestHistory_${constructId}`;
    const existing = localStorage.getItem(historyKey);
    const history = existing ? JSON.parse(existing) : [];
    history.push({
      ...report,
      runDate: new Date().toISOString()
    });
    // Keep last 10 runs
    if (history.length > 10) {
      history.shift();
    }
    localStorage.setItem(historyKey, JSON.stringify(history));
    console.log(`\n💾 Saved test run to history (${history.length} total runs)`);
  } catch (error) {
    console.warn('⚠️ Could not save to history:', error);
  }
  
  return report;
}

// Make it available globally for easy console access
if (typeof window !== 'undefined') {
  (window as any).runHistoryMemoryTests = runHistoryMemoryTestsInBrowser;
}

