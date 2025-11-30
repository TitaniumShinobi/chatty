/**
 * Browser Console Test Runner for Katana
 * 
 * Usage in browser console:
 *   import('/src/lib/katanaTestRunnerBrowser.ts').then(m => m.runKatanaTestsInBrowser())
 * 
 * Or make it available globally:
 *   window.runKatanaTests = async () => { ... }
 */

import { runConstructTests, exportReport, exportReportMarkdown, type TestReport } from './constructTestRunner';
import { createKatanaAdapter, getKatanaFailingPrompt } from './katanaTestAdapter';

/**
 * Run Katana tests in the browser console
 */
export async function runKatanaTestsInBrowser(options?: {
  includeFailingPrompt?: boolean;
  constructCallsign?: string;
}): Promise<TestReport> {
  console.log('🗡️ Starting Katana Conversational Ability Tests in Browser...\n');
  
  // Get user ID
  let userId = 'anonymous';
  try {
    const { fetchMe, getUserId } = await import('./auth');
    const user = await fetchMe();
    userId = user ? getUserId(user) : 'anonymous';
  } catch (error) {
    console.warn('⚠️ Could not fetch user ID, using anonymous:', error);
  }
  
  // Create Katana adapter
  const adapter = createKatanaAdapter({
    constructCallsign: options?.constructCallsign || 'gpt-katana-001',
    userId
  });
  
  // Run tests
  const report = await runConstructTests(adapter, {
    includeFailingPrompt: options?.includeFailingPrompt || false,
    failingPrompt: options?.includeFailingPrompt ? getKatanaFailingPrompt() : undefined
  });
  
  // Export results
  console.log('\n📊 Test Report Generated!');
  console.log('Grade:', report.grade, `(${report.percentage.toFixed(1)}%)`);
  console.log('Score:', report.totalScore, '/', report.maxScore);
  console.log('\n📄 Export as JSON:');
  console.log(exportReport(report));
  console.log('\n📄 Export as Markdown:');
  console.log(exportReportMarkdown(report));
  
  // Make report available globally
  (window as any).lastKatanaTestReport = report;
  
  // Save to localStorage for historical tracking
  try {
    const history = JSON.parse(localStorage.getItem('katanaTestHistory') || '[]');
    history.push({
      ...report,
      runId: Date.now(),
      runDate: new Date().toISOString()
    });
    // Keep last 50 runs
    const trimmedHistory = history.slice(-50);
    localStorage.setItem('katanaTestHistory', JSON.stringify(trimmedHistory));
    localStorage.setItem('lastKatanaTestReport', JSON.stringify(report));
    (window as any).katanaTestHistory = trimmedHistory;
    console.log(`\n💾 Saved test run to history (${trimmedHistory.length} total runs)`);
  } catch (error) {
    console.warn('⚠️ Failed to save test history:', error);
  }
  
  return report;
}

// Make it available globally for easy console access
if (typeof window !== 'undefined') {
  (window as any).runKatanaTests = runKatanaTestsInBrowser;
  console.log('✅ Katana Test Runner loaded! Run: runKatanaTests()');
  console.log('   Options: runKatanaTests({ includeFailingPrompt: true })');
}

