/**
 * Browser Console Test Runner for Any Construct
 * 
 * Generic test runner that works with any construct adapter.
 * 
 * Usage in browser console:
 *   import('/src/lib/constructTestRunnerBrowser.ts').then(m => 
 *     m.runConstructTests(adapter)
 *   )
 */

import { runConstructTests, exportReport, exportReportMarkdown, type TestReport, type ConstructAdapter } from './constructTestRunner';

/**
 * Run tests for any construct in the browser console
 * 
 * @param adapter - Construct adapter (e.g., from createKatanaAdapter, createLinAdapter, etc.)
 * @param options - Test options
 */
export async function runConstructTestsInBrowser(
  adapter: ConstructAdapter,
  options?: {
    includeFailingPrompt?: boolean;
    failingPrompt?: any;
    workspaceContext?: string;
  }
): Promise<TestReport> {
  console.log(`🧪 Starting ${adapter.constructName} Conversational Ability Tests in Browser...\n`);
  
  // Run tests
  const report = await runConstructTests(adapter, options);
  
  // Export results
  console.log('\n📊 Test Report Generated!');
  console.log('Grade:', report.grade, `(${report.percentage.toFixed(1)}%)`);
  console.log('Score:', report.totalScore, '/', report.maxScore);
  console.log('\n📄 Export as JSON:');
  console.log(exportReport(report));
  console.log('\n📄 Export as Markdown:');
  console.log(exportReportMarkdown(report));
  
  // Make report available globally
  const globalKey = `last${adapter.constructName}TestReport`;
  (window as any)[globalKey] = report;
  
  // Save to localStorage for historical tracking
  try {
    const historyKey = `${adapter.constructId}TestHistory`;
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    history.push({
      ...report,
      runId: Date.now(),
      runDate: new Date().toISOString()
    });
    // Keep last 50 runs
    const trimmedHistory = history.slice(-50);
    localStorage.setItem(historyKey, JSON.stringify(trimmedHistory));
    localStorage.setItem(globalKey, JSON.stringify(report));
    (window as any)[historyKey] = trimmedHistory;
    console.log(`\n💾 Saved test run to history (${trimmedHistory.length} total runs)`);
  } catch (error) {
    console.warn('⚠️ Failed to save test history:', error);
  }
  
  return report;
}

// Make it available globally for easy console access
if (typeof window !== 'undefined') {
  (window as any).runConstructTests = runConstructTestsInBrowser;
  console.log('✅ Universal Construct Test Runner loaded!');
  console.log('   Usage: runConstructTests(adapter, options)');
}

