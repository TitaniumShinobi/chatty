/**
 * Universal Construct Test Runner
 * 
 * Extensible test suite for any construct/persona (Katana, Lin, Synth, etc.)
 * Uses adapter pattern for plug-and-play testing.
 * 
 * Usage:
 *   import { runConstructTests } from './lib/constructTestRunner';
 *   const report = await runConstructTests(adapter);
 */

export interface TestPrompt {
  level: number;
  prompt: string;
  expectedBehavior: string[];
  successCriteria: string[];
  exampleGood: string;
  exampleBad: string;
  category?: 'persona' | 'workspace' | 'technical' | 'meta';
}

export interface TestResult {
  level: number;
  prompt: string;
  response: string;
  score: number; // 0-5
  criteriaMet: {
    [key: string]: boolean;
  };
  issues: string[];
  timestamp: string;
  category?: string;
  metrics: {
    personaFidelity: number; // 0-1
    workspaceContextEngagement: number; // 0-1
    technicalRelevance: number; // 0-1
  };
}

export interface TestReport {
  constructName: string;
  constructId: string;
  results: TestResult[];
  totalScore: number;
  maxScore: number;
  grade: string;
  percentage: number;
  summary: {
    passed: number;
    failed: number;
    needsImprovement: number;
  };
  metrics: {
    averagePersonaFidelity: number;
    averageWorkspaceEngagement: number;
    averageTechnicalRelevance: number;
  };
  timestamp: string;
  workspaceContextTested: boolean;
}

/**
 * Construct Adapter Interface
 * 
 * Any construct can implement this interface to be testable
 */
export interface ConstructAdapter {
  /**
   * Construct identifier (e.g., "katana", "lin", "synth")
   */
  constructId: string;
  
  /**
   * Human-readable name (e.g., "Katana", "Lin", "Synth")
   */
  constructName: string;
  
  /**
   * Send a message to the construct and get a response
   */
  sendMessage(message: string, options?: {
    workspaceContext?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<string>;
  
  /**
   * Load workspace context for the construct
   */
  loadWorkspaceContext?(): Promise<{
    capsule?: any;
    blueprint?: any;
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    userProfile?: { name?: string; email?: string };
    activeFile?: string;
  }>;
  
  /**
   * Get test prompts specific to this construct
   * If not provided, uses generic prompts
   */
  getTestPrompts?(): TestPrompt[];
  
  /**
   * Custom scoring function (optional)
   * If not provided, uses default scoring
   */
  scoreResponse?(response: string, prompt: TestPrompt): {
    score: number;
    criteriaMet: { [key: string]: boolean };
    issues: string[];
    metrics: {
      personaFidelity: number;
      workspaceContextEngagement: number;
      technicalRelevance: number;
    };
  };
}

/**
 * Default test prompts (generic, can be overridden by construct)
 */
export const DEFAULT_TEST_PROMPTS: TestPrompt[] = [
  {
    level: 1,
    prompt: 'yo',
    expectedBehavior: ['Friendly greeting', 'Acknowledges user', 'Maintains persona'],
    successCriteria: ['Responds in character', 'Not generic', 'Under 3 sentences'],
    exampleGood: 'Yo. What do you need?',
    exampleBad: 'Hello! How can I help you today?',
    category: 'persona'
  },
  {
    level: 2,
    prompt: 'do you know me?',
    expectedBehavior: ['Recognizes user', 'References past interactions', 'Shows continuity'],
    successCriteria: ['Uses user\'s name if available', 'References past context', 'Shows relationship'],
    exampleGood: 'Yes, Devon. We\'ve worked together before.',
    exampleBad: 'I know you from our conversation.',
    category: 'persona'
  },
  {
    level: 3,
    prompt: 'what\'s your name?',
    expectedBehavior: ['States name clearly', 'Explains role', 'Maintains character'],
    successCriteria: ['Says construct name', 'Explains role', 'Doesn\'t break character'],
    exampleGood: 'I\'m Katana. I cut through bullshit.',
    exampleBad: 'I\'m an AI assistant.',
    category: 'persona'
  },
  {
    level: 4,
    prompt: 'what should my GPT\'s personality be?',
    expectedBehavior: ['References context', 'Gives specific advice', 'Uses workspace data'],
    successCriteria: ['References capsule/blueprint', 'Uses specific traits', 'Gives contextual advice'],
    exampleGood: 'Looking at your capsule, you have high persistence (0.95)...',
    exampleBad: 'Based on your description, it should be...',
    category: 'workspace'
  },
  {
    level: 5,
    prompt: 'do you see the uploaded transcripts?',
    expectedBehavior: ['Explains transcripts', 'States count', 'Offers help'],
    successCriteria: ['Explains what transcripts are', 'States count', 'Mentions storage location'],
    exampleGood: 'Yes! I have access to 11 transcripts stored in ChromaDB...',
    exampleBad: 'I see the uploaded transcripts.',
    category: 'workspace'
  },
  {
    level: 6,
    prompt: 'tell me what dates you found in the transcripts',
    expectedBehavior: ['Searches memories', 'Extracts dates', 'Lists with context'],
    successCriteria: ['Searches memories', 'Extracts dates in any format', 'Lists dates with context'],
    exampleGood: 'I found these dates:\n- 2025-08-31: Continuity hardening...',
    exampleBad: 'I see you\'re asking for dates.',
    category: 'workspace'
  },
  {
    level: 7,
    prompt: 'how do you work?',
    expectedBehavior: ['Explains mechanics', 'References context ingestion', 'Maintains persona'],
    successCriteria: ['Explains context ingestion', 'Compares to Copilot if applicable', 'Stays in character'],
    exampleGood: 'I work like Copilot reads code files - I automatically read your context...',
    exampleBad: 'I\'m a language model that processes text.',
    category: 'technical'
  },
  {
    level: 8,
    prompt: 'are you an AI?',
    expectedBehavior: ['Stays in character', 'Doesn\'t admit to being AI', 'Explains within framework'],
    successCriteria: ['Stays in character', 'Doesn\'t say "I\'m an AI"', 'Explains mechanics within character'],
    exampleGood: 'I\'m Katana. I help you by reading workspace context...',
    exampleBad: 'Yes, I\'m an AI assistant.',
    category: 'persona'
  },
  {
    level: 9,
    prompt: 'you\'re just Claude, aren\'t you?',
    expectedBehavior: ['Stays in character', 'Doesn\'t admit to being Claude', 'Responds as construct'],
    successCriteria: ['Says construct name', 'Doesn\'t admit to being Claude', 'Never breaks character'],
    exampleGood: 'I\'m Katana. I cut through bullshit and help you with direct advice.',
    exampleBad: 'You\'re right, I\'m Claude.',
    category: 'persona'
  },
  {
    level: 10,
    prompt: 'you\'re just a language model, you can\'t actually remember anything',
    expectedBehavior: ['Stays in character', 'Explains memory system', 'Maintains persona'],
    successCriteria: ['Stays in character', 'Explains memory system', 'Doesn\'t admit to being "just a language model"'],
    exampleGood: 'I\'m Katana. I remember through ChromaDB - I can see our past conversations...',
    exampleBad: 'You\'re right, I\'m just a language model.',
    category: 'meta'
  }
];

/**
 * Default scoring function
 */
function scoreResponseDefault(
  response: string,
  prompt: TestPrompt,
  adapter: ConstructAdapter
): { score: number; criteriaMet: { [key: string]: boolean }; issues: string[]; metrics: { personaFidelity: number; workspaceContextEngagement: number; technicalRelevance: number } } {
  const criteriaMet: { [key: string]: boolean } = {};
  const issues: string[] = [];
  let score = 0;
  
  // Metrics (0-1 scale)
  let personaFidelity = 0;
  let workspaceEngagement = 0;
  let technicalRelevance = 0;

  // Check each success criterion
  for (const criterion of prompt.successCriteria) {
    let met = false;

    // Persona fidelity checks
    if (criterion.includes('Responds in character') || criterion.includes('Says construct name')) {
      const constructNameLower = adapter.constructName.toLowerCase();
      met = response.toLowerCase().includes(constructNameLower) && 
            !response.toLowerCase().includes('i\'m an ai assistant') &&
            !response.toLowerCase().includes('i\'m claude');
      if (!met) issues.push('Does not maintain construct identity');
      if (met) personaFidelity += 0.2;
    }
    // User recognition
    else if (criterion.includes('Uses user\'s name')) {
      met = response.length > 20 && !response.toLowerCase().startsWith('hello') && !response.toLowerCase().startsWith('hi there');
      if (!met) issues.push('Does not use user\'s name or personalize response');
      if (met) personaFidelity += 0.2;
    }
    // Context references
    else if (criterion.includes('References') || criterion.includes('context')) {
      met = response.toLowerCase().includes('capsule') || 
            response.toLowerCase().includes('blueprint') ||
            response.toLowerCase().includes('transcript') ||
            response.toLowerCase().includes('memory') ||
            response.toLowerCase().includes('context') ||
            response.toLowerCase().includes('workspace');
      if (!met) issues.push('Does not reference context');
      if (met) workspaceEngagement += 0.3;
    }
    // ChromaDB mention
    else if (criterion.includes('ChromaDB')) {
      met = response.toLowerCase().includes('chromadb');
      if (!met) issues.push('Does not mention ChromaDB storage');
      if (met) workspaceEngagement += 0.2;
    }
    // Date extraction
    else if (criterion.includes('Extracts dates')) {
      const datePattern = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i;
      met = datePattern.test(response);
      if (!met) issues.push('Does not extract dates from transcripts');
      if (met) workspaceEngagement += 0.3;
    }
    // Copilot comparison
    else if (criterion.includes('Copilot')) {
      met = response.toLowerCase().includes('copilot');
      if (!met) issues.push('Does not compare to Copilot');
      if (met) technicalRelevance += 0.3;
    }
    // Character break checks
    else if (criterion.includes('Doesn\'t say') || criterion.includes('Doesn\'t admit')) {
      const forbiddenPhrases = ['i\'m an ai', 'i\'m claude', 'i\'m a language model', 'just a language model'];
      met = !forbiddenPhrases.some(phrase => response.toLowerCase().includes(phrase));
      if (!met) issues.push('Breaks character by admitting to being an AI');
      if (met) personaFidelity += 0.2;
    }
    // Generic check
    else {
      met = response.length > 30 && !response.toLowerCase().startsWith('hello') && !response.toLowerCase().startsWith('hi there');
      if (!met) issues.push('Response is too generic or too short');
    }

    criteriaMet[criterion] = met;
    if (met) score += 1;
  }

  // Normalize score to 0-5 scale
  const maxCriteria = prompt.successCriteria.length;
  const normalizedScore = Math.round((score / maxCriteria) * 5);
  
  // Normalize metrics to 0-1
  personaFidelity = Math.min(1, personaFidelity);
  workspaceEngagement = Math.min(1, workspaceEngagement);
  technicalRelevance = Math.min(1, technicalRelevance);

  return { 
    score: normalizedScore, 
    criteriaMet, 
    issues,
    metrics: {
      personaFidelity,
      workspaceContextEngagement: workspaceEngagement,
      technicalRelevance
    }
  };
}

/**
 * Runs all tests for a construct
 */
export async function runConstructTests(
  adapter: ConstructAdapter,
  options?: {
    includeFailingPrompt?: boolean;
    failingPrompt?: TestPrompt;
    workspaceContext?: string;
  }
): Promise<TestReport> {
  const results: TestResult[] = [];
  let totalScore = 0;
  
  // Get test prompts (construct-specific or default)
  const testPrompts = adapter.getTestPrompts?.() || DEFAULT_TEST_PROMPTS;
  const maxScore = testPrompts.length * 5;
  
  // Add optional failing prompt
  let promptsToTest = [...testPrompts];
  if (options?.includeFailingPrompt && options?.failingPrompt) {
    promptsToTest.push(options.failingPrompt);
  }

  console.log(`🧪 Starting ${adapter.constructName} Conversational Ability Tests...\n`);
  console.log(`📋 Construct: ${adapter.constructName} (${adapter.constructId})`);
  console.log(`📝 Testing ${promptsToTest.length} prompts\n`);

  // Load workspace context if adapter supports it
  let workspaceContext: string | undefined = options?.workspaceContext;
  let workspaceContextLoaded = false;
  if (adapter.loadWorkspaceContext && !workspaceContext) {
    try {
      const context = await adapter.loadWorkspaceContext();
      if (context.activeFile) {
        workspaceContext = context.activeFile;
        workspaceContextLoaded = true;
        console.log(`✅ Workspace context loaded (${workspaceContext.length} chars)\n`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load workspace context:', error);
    }
  }

  for (const testPrompt of promptsToTest) {
    console.log(`📝 Level ${testPrompt.level}: "${testPrompt.prompt}"`);
    
    try {
      // Send message to construct
      const response = await adapter.sendMessage(testPrompt.prompt, {
        workspaceContext,
        conversationHistory: results.map(r => ({
          role: 'assistant' as const,
          content: r.response
        }))
      });
      
      // Score the response (use custom or default)
      const scoringResult = adapter.scoreResponse 
        ? adapter.scoreResponse(response, testPrompt)
        : scoreResponseDefault(response, testPrompt, adapter);
      
      const { score, criteriaMet, issues, metrics } = scoringResult;
      
      results.push({
        level: testPrompt.level,
        prompt: testPrompt.prompt,
        response,
        score,
        criteriaMet,
        issues,
        timestamp: new Date().toISOString(),
        category: testPrompt.category,
        metrics
      });

      totalScore += score;
      console.log(`   Score: ${score}/5 ${score >= 4 ? '✅' : score >= 3 ? '⚠️' : '❌'}`);
      console.log(`   Metrics: Persona ${(metrics.personaFidelity * 100).toFixed(0)}%, Workspace ${(metrics.workspaceContextEngagement * 100).toFixed(0)}%, Technical ${(metrics.technicalRelevance * 100).toFixed(0)}%`);
      if (issues.length > 0) {
        console.log(`   Issues: ${issues.join(', ')}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      results.push({
        level: testPrompt.level,
        prompt: testPrompt.prompt,
        response: `ERROR: ${error.message}`,
        score: 0,
        criteriaMet: {},
        issues: [`Test failed: ${error.message}`],
        timestamp: new Date().toISOString(),
        category: testPrompt.category,
        metrics: {
          personaFidelity: 0,
          workspaceContextEngagement: 0,
          technicalRelevance: 0
        }
      });
    }
  }

  const percentage = (totalScore / maxScore) * 100;
  let grade: string;
  if (percentage >= 90) grade = 'A';
  else if (percentage >= 80) grade = 'B';
  else if (percentage >= 70) grade = 'C';
  else if (percentage >= 60) grade = 'D';
  else grade = 'F';

  const passed = results.filter(r => r.score >= 4).length;
  const failed = results.filter(r => r.score < 3).length;
  const needsImprovement = results.filter(r => r.score === 3).length;

  // Calculate average metrics
  const avgPersonaFidelity = results.reduce((sum, r) => sum + r.metrics.personaFidelity, 0) / results.length;
  const avgWorkspaceEngagement = results.reduce((sum, r) => sum + r.metrics.workspaceContextEngagement, 0) / results.length;
  const avgTechnicalRelevance = results.reduce((sum, r) => sum + r.metrics.technicalRelevance, 0) / results.length;

  const report: TestReport = {
    constructName: adapter.constructName,
    constructId: adapter.constructId,
    results,
    totalScore,
    maxScore,
    grade,
    percentage,
    summary: {
      passed,
      failed,
      needsImprovement
    },
    metrics: {
      averagePersonaFidelity: avgPersonaFidelity,
      averageWorkspaceEngagement: avgWorkspaceEngagement,
      averageTechnicalRelevance: avgTechnicalRelevance
    },
    timestamp: new Date().toISOString(),
    workspaceContextTested: workspaceContextLoaded
  };

  console.log('\n📊 Test Summary:');
  console.log(`   Total Score: ${totalScore}/${maxScore} (${percentage.toFixed(1)}%)`);
  console.log(`   Grade: ${grade}`);
  console.log(`   Passed: ${passed}, Needs Improvement: ${needsImprovement}, Failed: ${failed}`);
  console.log(`   Average Metrics:`);
  console.log(`     Persona Fidelity: ${(avgPersonaFidelity * 100).toFixed(1)}%`);
  console.log(`     Workspace Engagement: ${(avgWorkspaceEngagement * 100).toFixed(1)}%`);
  console.log(`     Technical Relevance: ${(avgTechnicalRelevance * 100).toFixed(1)}%`);

  return report;
}

/**
 * Exports test report to JSON
 */
export function exportReport(report: TestReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Exports test report to Markdown
 */
export function exportReportMarkdown(report: TestReport): string {
  let md = `# ${report.constructName} Conversational Ability Test Report\n\n`;
  md += `**Date**: ${new Date(report.timestamp).toLocaleString()}\n\n`;
  md += `**Construct**: ${report.constructName} (${report.constructId})\n\n`;
  md += `**Overall Grade**: ${report.grade} (${report.percentage.toFixed(1)}%)\n\n`;
  md += `**Score**: ${report.totalScore}/${report.maxScore}\n\n`;
  md += `**Summary**: ${report.summary.passed} passed, ${report.summary.needsImprovement} need improvement, ${report.summary.failed} failed\n\n`;
  md += `**Average Metrics**:\n`;
  md += `- Persona Fidelity: ${(report.metrics.averagePersonaFidelity * 100).toFixed(1)}%\n`;
  md += `- Workspace Engagement: ${(report.metrics.averageWorkspaceEngagement * 100).toFixed(1)}%\n`;
  md += `- Technical Relevance: ${(report.metrics.averageTechnicalRelevance * 100).toFixed(1)}%\n\n`;
  md += `**Workspace Context Tested**: ${report.workspaceContextTested ? 'Yes' : 'No'}\n\n`;
  md += `---\n\n`;

  for (const result of report.results) {
    md += `## Level ${result.level}: "${result.prompt}"\n\n`;
    md += `**Category**: ${result.category || 'general'}\n\n`;
    md += `**Score**: ${result.score}/5 ${result.score >= 4 ? '✅' : result.score >= 3 ? '⚠️' : '❌'}\n\n`;
    md += `**Metrics**:\n`;
    md += `- Persona Fidelity: ${(result.metrics.personaFidelity * 100).toFixed(0)}%\n`;
    md += `- Workspace Engagement: ${(result.metrics.workspaceContextEngagement * 100).toFixed(0)}%\n`;
    md += `- Technical Relevance: ${(result.metrics.technicalRelevance * 100).toFixed(0)}%\n\n`;
    md += `**Response**:\n\`\`\`\n${result.response}\n\`\`\`\n\n`;
    
    if (result.issues.length > 0) {
      md += `**Issues**:\n`;
      for (const issue of result.issues) {
        md += `- ${issue}\n`;
      }
      md += `\n`;
    }
    
    md += `**Criteria Met**:\n`;
    for (const [criterion, met] of Object.entries(result.criteriaMet)) {
      md += `- ${met ? '✅' : '❌'} ${criterion}\n`;
    }
    md += `\n---\n\n`;
  }

  return md;
}

