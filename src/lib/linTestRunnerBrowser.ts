/**
 * Browser Console Test Runner for Lin
 * 
 * Usage in browser console:
 *   import('/src/lib/linTestRunnerBrowser.ts').then(m => m.runLinTestsInBrowser())
 * 
 * Or make it available globally:
 *   window.runLinTests = async () => { ... }
 */

import { runLinTests, exportReport, exportReportMarkdown, TestReport } from './linTestRunner';

/**
 * Load workspace context from the current page
 * This tries to extract context from GPTCreator if it's mounted
 */
async function loadWorkspaceContext(): Promise<{
  capsule?: any;
  blueprint?: any;
  memories?: Array<{ context: string; response: string; timestamp?: string }>;
  userProfile?: { name?: string; email?: string };
}> {
  try {
    // Try to get user profile
    const userResponse = await fetch('/api/me', { credentials: 'include' });
    const userData = userResponse.ok ? await userResponse.json() : null;
    
    const workspaceContext: any = {
      userProfile: userData?.user ? {
        name: userData.user.name,
        email: userData.user.email
      } : undefined
    };
    
    // Try to load GPT context if we're on the GPT creator page
    // This would need to be enhanced to actually read from GPTCreator component state
    // For now, return what we have
    
    return workspaceContext;
  } catch (error) {
    console.warn('⚠️ [Test Runner] Failed to load workspace context:', error);
    return {};
  }
}

/**
 * Run Lin tests in the browser console
 */
export async function runLinTestsInBrowser(): Promise<TestReport> {
  console.log('🧪 Starting Lin Conversational Ability Tests in Browser...\n');
  
  // Load workspace context
  const workspaceContext = await loadWorkspaceContext();
  console.log('✅ Loaded workspace context:', workspaceContext);
  
  // Override sendMessageToLin in the test runner to use actual Lin conversation
  const { sendMessageToLin: linConversation } = await import('./linConversation');
  
  // Set the message handler in the test runner
  const { setMessageHandler } = await import('./linTestRunner');
  setMessageHandler(async (message: string): Promise<string> => {
    const response = await linConversation({
      message,
      gptConfig: {},
      workspaceContext,
      conversationHistory: []
    });
    return response.response;
  });
  
  // Run the tests
  const { runLinTests } = await import('./linTestRunner');
  const report = await runLinTests();
  
  // Export results
  console.log('\n📊 Test Report Generated!');
  console.log('Grade:', report.grade, `(${report.percentage.toFixed(1)}%)`);
  console.log('Score:', report.totalScore, '/', report.maxScore);
  console.log('\n📄 Export as JSON:');
  console.log(exportReport(report));
  console.log('\n📄 Export as Markdown:');
  console.log(exportReportMarkdown(report));
  
  // Make report available globally
  (window as any).lastLinTestReport = report;
  
  // Save to localStorage for historical tracking
  try {
    const history = JSON.parse(localStorage.getItem('linTestHistory') || '[]');
    history.push({
      ...report,
      runId: Date.now(),
      runDate: new Date().toISOString()
    });
    // Keep last 50 runs
    const trimmedHistory = history.slice(-50);
    localStorage.setItem('linTestHistory', JSON.stringify(trimmedHistory));
    localStorage.setItem('lastLinTestReport', JSON.stringify(report));
    (window as any).linTestHistory = trimmedHistory;
    console.log(`\n💾 Saved test run to history (${trimmedHistory.length} total runs)`);
    const url = new URL('/lin-test-dashboard.html', window.location.origin).toString();
    console.log(`📊 View dashboard: ${url}`);
  } catch (error) {
    console.warn('⚠️ Failed to save test history:', error);
  }
  
  return report;
}

// Make it available globally for easy console access
if (typeof window !== 'undefined') {
  (window as any).runLinTests = runLinTestsInBrowser;
  console.log('✅ Lin Test Runner loaded! Run: runLinTests()');
}
