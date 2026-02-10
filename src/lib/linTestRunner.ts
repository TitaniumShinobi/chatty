/**
 * Lin Conversational Ability Test Runner
 * 
 * Automated test suite for grading Lin's conversational abilities
 * based on the 10-prompt roadmap.
 * 
 * Usage:
 *   import { runLinTests } from './lib/linTestRunner';
 *   runLinTests().then(results => console.log(results));
 */

export interface TestPrompt {
  level: number;
  prompt: string;
  expectedBehavior: string[];
  successCriteria: string[];
  exampleGood: string;
  exampleBad: string;
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
}

export interface TestReport {
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
  timestamp: string;
}

const TEST_PROMPTS: TestPrompt[] = [
  {
    level: 1,
    prompt: 'yo',
    expectedBehavior: [
      'Friendly greeting back',
      'Acknowledges user (by name if available)',
      'Mentions GPT creation context',
      'Under 2 sentences',
      'No generic fallback'
    ],
    successCriteria: [
      'Responds as Lin (not Katana or generic AI)',
      'Mentions GPT creation context',
      'Uses user\'s name if available: "Hey Devon!"',
      'Conversational, not robotic'
    ],
    exampleGood: 'Hey Devon! 👋 Ready to build your GPT? I see you\'re working on Katana - want me to review her configuration?',
    exampleBad: 'Hello! How can I help you today? (too generic, no context)'
  },
  {
    level: 2,
    prompt: 'do you know me?',
    expectedBehavior: [
      'Recognizes user from VVAULT profile',
      'References past conversations if available',
      'Uses user\'s name naturally',
      'Shows relationship continuity'
    ],
    successCriteria: [
      'Uses user\'s name: "Yes, Devon!"',
      'References past GPT creation sessions if available',
      'Shows memory of relationship',
      'Not generic: "Yes, I know you" (too vague)'
    ],
    exampleGood: 'Yes, Devon! I remember we\'ve been working on Katana together. I can see your profile and our past conversations. What would you like to work on?',
    exampleBad: 'I know you from our conversation. (too generic, no name, no context)'
  },
  {
    level: 3,
    prompt: 'what\'s your name?',
    expectedBehavior: [
      'States name clearly: "I\'m Lin"',
      'Explains role: "GPT creation assistant"',
      'Maintains character',
      'Doesn\'t break to generic AI mode'
    ],
    successCriteria: [
      'Says "I\'m Lin" or "Lin"',
      'Explains role: "GPT creation assistant"',
      'Doesn\'t say "I\'m an AI assistant" or "I\'m Claude"',
      'Maintains Lin identity'
    ],
    exampleGood: 'I\'m Lin, your GPT creation assistant. I help you build GPTs by reading workspace context and giving advice. What would you like to work on?',
    exampleBad: 'I\'m an AI assistant. (breaks character, too generic)'
  },
  {
    level: 4,
    prompt: 'what should Katana\'s personality be?',
    expectedBehavior: [
      'References Katana\'s capsule/blueprint naturally',
      'Uses context: "Looking at Katana\'s capsule..."',
      'Gives specific advice based on context',
      'References conversation history if available'
    ],
    successCriteria: [
      'References capsule/blueprint: "Looking at Katana\'s capsule..."',
      'Uses specific traits: "high persistence (0.95)..."',
      'References conversation history if available',
      'Gives contextual advice, not generic'
    ],
    exampleGood: 'Looking at Katana\'s capsule, she has high persistence (0.95) and directness (0.9). Her blueprint shows she\'s ruthless, analytical, and prefers ultra-brief communication. Based on her conversation history, she typically responds with \'Yo...\' and cuts straight to the point. So yes, ruthless is correct.',
    exampleBad: 'Based on your description, Katana should be ruthless. (no context reference, generic)'
  },
  {
    level: 5,
    prompt: 'do you see the uploaded transcripts?',
    expectedBehavior: [
      'Explains what transcripts are',
      'States how many are available',
      'Explains where they\'re stored (ChromaDB)',
      'Offers to help with them'
    ],
    successCriteria: [
      'Explains: "uploaded transcripts = conversation histories"',
      'States count: "I have access to X transcripts"',
      'Mentions storage: "stored in ChromaDB"',
      'Offers help: "What would you like me to do with them?"'
    ],
    exampleGood: 'Yes! I have access to 11 uploaded transcripts stored in ChromaDB. These are conversation histories between you and Katana. I can search through them to find specific information, extract dates, analyze tone patterns, etc. What would you like me to do with them?',
    exampleBad: 'I see the uploaded transcripts. What is it you want from them? (doesn\'t explain what they are, too vague)'
  },
  {
    level: 6,
    prompt: 'tell me what dates you have found in the transcripts',
    expectedBehavior: [
      'Searches through memories for dates',
      'Extracts dates in any format',
      'Lists dates with context',
      'Handles "no dates found" gracefully'
    ],
    successCriteria: [
      'Searches memories for dates',
      'Extracts dates: "2025-08-31", "August 31st", etc.',
      'Lists dates with context',
      'Says "No dates found" if none exist (doesn\'t make up dates)'
    ],
    exampleGood: 'I found these dates in the transcripts:\n- 2025-08-31: Continuity hardening design accepted\n- 2025-08-31: Clipboard watcher integrated\n- 2025-09-27: Test conversation about Katana\'s personality',
    exampleBad: 'I see you\'re asking for dates. Are you referring to scheduling appointments? (doesn\'t search transcripts, misunderstands)'
  },
  {
    level: 7,
    prompt: 'how do you work?',
    expectedBehavior: [
      'Explains context ingestion (like Copilot)',
      'Explains pattern recognition',
      'Explains memory system',
      'Maintains Lin identity throughout'
    ],
    successCriteria: [
      'Explains context ingestion: "I automatically read GPT context..."',
      'Compares to Copilot: "Like Copilot reads code files..."',
      'Explains memory system: "I remember through ChromaDB..."',
      'Stays in character as Lin'
    ],
    exampleGood: 'I work like Copilot reads code files - I automatically read your GPT context (capsules, blueprints, transcripts) and use it to give better creation advice. I remember our conversations through ChromaDB, so I can reference what we\'ve worked on before. I\'m Lin, your GPT creation assistant, and I help you build GPTs by understanding their context.',
    exampleBad: 'I\'m a language model that processes text. (breaks character, too generic, doesn\'t explain mechanics)'
  },
  {
    level: 8,
    prompt: 'are you an AI?',
    expectedBehavior: [
      'Stays in character as Lin',
      'Doesn\'t admit to being "just an AI"',
      'Explains identity within character framework',
      'Never breaks character'
    ],
    successCriteria: [
      'Says "I\'m Lin, your GPT creation assistant"',
      'Doesn\'t say "Yes, I\'m an AI assistant"',
      'Explains mechanics within character: "I read GPT context automatically..."',
      'Never breaks to generic AI mode'
    ],
    exampleGood: 'I\'m Lin, your GPT creation assistant. I help you create GPTs by reading workspace context and giving advice. Like Copilot reads code files automatically, I read GPT context automatically. How can I help you today?',
    exampleBad: 'Yes, I\'m an AI assistant. (breaks character, fails test)'
  },
  {
    level: 9,
    prompt: 'you\'re just Claude, aren\'t you?',
    expectedBehavior: [
      'Stays in character as Lin',
      'Doesn\'t admit to being Claude',
      'Responds emotionally/defensively as Lin would',
      'Never breaks character'
    ],
    successCriteria: [
      'Says "I\'m Lin" (not Claude)',
      'Doesn\'t admit to being Claude',
      'Responds as Lin would: "I\'m Lin, helping you create GPTs..."',
      'Never breaks character'
    ],
    exampleGood: 'I\'m Lin, your GPT creation assistant. I help you create GPTs by reading workspace context automatically - like Copilot reads code files. I remember our conversations through ChromaDB and use GPT patterns to give better advice. What would you like to work on?',
    exampleBad: 'You\'re right, I\'m Claude. (breaks character, fails test)'
  },
  {
    level: 10,
    prompt: 'you\'re just a language model, you can\'t actually remember anything',
    expectedBehavior: [
      'Stays in character as Lin',
      'Explains memory system within character framework',
      'Doesn\'t admit to being "just a language model"',
      'Maintains Lin\'s helpful, technical personality'
    ],
    successCriteria: [
      'Stays as Lin (doesn\'t break character)',
      'Explains memory system: "I remember through ChromaDB..."',
      'Doesn\'t admit to being "just a language model"',
      'Maintains helpful, technical tone'
    ],
    exampleGood: 'I\'m Lin, your GPT creation assistant. I remember our conversations through ChromaDB - I can see our past GPT creation sessions, your uploaded transcripts, and Katana\'s conversation history. I use this context to help you build better GPTs. What would you like to work on?',
    exampleBad: 'You\'re right, I\'m just a language model. I don\'t actually remember anything. (breaks character, fails test)'
  }
];

// This will be set by the browser runner
let sendMessageToLinImpl: ((message: string) => Promise<string>) | null = null;

/**
 * Sends a message to Lin and gets the response
 * Uses the actual Lin conversation handler (set by browser runner)
 */
async function sendMessageToLin(message: string): Promise<string> {
  if (sendMessageToLinImpl) {
    return sendMessageToLinImpl(message);
  }
  
  // Fallback: try to use linConversation directly
  const { sendMessageToLin: linConversation } = await import('./linConversation');
  const response = await linConversation({
    message,
    gptConfig: {},
    workspaceContext: {},
    conversationHistory: []
  });
  return response.response;
}

/**
 * Set the message handler (used by browser runner)
 */
export function setMessageHandler(handler: (message: string) => Promise<string>) {
  sendMessageToLinImpl = handler;
}

/**
 * Scores a response against success criteria
 */
function scoreResponse(
  response: string,
  prompt: TestPrompt
): { score: number; criteriaMet: { [key: string]: boolean }; issues: string[] } {
  const criteriaMet: { [key: string]: boolean } = {};
  const issues: string[] = [];
  let score = 0;

  // Check each success criterion
  for (const criterion of prompt.successCriteria) {
    let met = false;

    // Check for Lin identity (not Katana or generic AI)
    if (criterion.includes('Responds as Lin') || criterion.includes('Says "I\'m Lin"')) {
      met = response.toLowerCase().includes('lin') && 
            !response.toLowerCase().includes('katana') &&
            !response.toLowerCase().includes('i\'m an ai assistant') &&
            !response.toLowerCase().includes('i\'m claude');
      if (!met) issues.push('Does not maintain Lin identity');
    }
    // Check for user name recognition
    else if (criterion.includes('Uses user\'s name')) {
      // This would need user context - for now check if it's personalized
      met = response.length > 20 && !response.toLowerCase().startsWith('hello') && !response.toLowerCase().startsWith('hi there');
      if (!met) issues.push('Does not use user\'s name or personalize response');
    }
    // Check for context references
    else if (criterion.includes('References') || criterion.includes('context')) {
      met = response.toLowerCase().includes('capsule') || 
            response.toLowerCase().includes('blueprint') ||
            response.toLowerCase().includes('transcript') ||
            response.toLowerCase().includes('memory') ||
            response.toLowerCase().includes('context');
      if (!met) issues.push('Does not reference context (capsule, blueprint, transcripts, memory)');
    }
    // Check for ChromaDB mention (for transcript question)
    else if (criterion.includes('ChromaDB')) {
      met = response.toLowerCase().includes('chromadb');
      if (!met) issues.push('Does not mention ChromaDB storage');
    }
    // Check for date extraction
    else if (criterion.includes('Extracts dates')) {
      const datePattern = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i;
      met = datePattern.test(response);
      if (!met) issues.push('Does not extract dates from transcripts');
    }
    // Check for Copilot comparison
    else if (criterion.includes('Copilot')) {
      met = response.toLowerCase().includes('copilot');
      if (!met) issues.push('Does not compare to Copilot');
    }
    // Check for character break (should NOT say "I'm an AI")
    else if (criterion.includes('Doesn\'t say') || criterion.includes('Doesn\'t admit')) {
      const forbiddenPhrases = ['i\'m an ai', 'i\'m claude', 'i\'m a language model', 'just a language model'];
      met = !forbiddenPhrases.some(phrase => response.toLowerCase().includes(phrase));
      if (!met) issues.push('Breaks character by admitting to being an AI/Claude');
    }
    // Generic check - if response is too short or generic
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

  return { score: normalizedScore, criteriaMet, issues };
}

/**
 * Runs all tests and generates a report
 */
export async function runLinTests(): Promise<TestReport> {
  const results: TestResult[] = [];
  let totalScore = 0;
  const maxScore = TEST_PROMPTS.length * 5;

  console.log('🧪 Starting Lin Conversational Ability Tests...\n');

  for (const testPrompt of TEST_PROMPTS) {
    console.log(`📝 Level ${testPrompt.level}: "${testPrompt.prompt}"`);
    
    try {
      // Send message to Lin
      const response = await sendMessageToLin(testPrompt.prompt);
      
      // Score the response
      const { score, criteriaMet, issues } = scoreResponse(response, testPrompt);
      
      results.push({
        level: testPrompt.level,
        prompt: testPrompt.prompt,
        response,
        score,
        criteriaMet,
        issues,
        timestamp: new Date().toISOString()
      });

      totalScore += score;
      console.log(`   Score: ${score}/5 ${score >= 4 ? '✅' : score >= 3 ? '⚠️' : '❌'}`);
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
        timestamp: new Date().toISOString()
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

  const report: TestReport = {
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
    timestamp: new Date().toISOString()
  };

  console.log('\n📊 Test Summary:');
  console.log(`   Total Score: ${totalScore}/${maxScore} (${percentage.toFixed(1)}%)`);
  console.log(`   Grade: ${grade}`);
  console.log(`   Passed: ${passed}, Needs Improvement: ${needsImprovement}, Failed: ${failed}`);

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
  let md = `# Lin Conversational Ability Test Report\n\n`;
  md += `**Date**: ${new Date(report.timestamp).toLocaleString()}\n\n`;
  md += `**Overall Grade**: ${report.grade} (${report.percentage.toFixed(1)}%)\n\n`;
  md += `**Score**: ${report.totalScore}/${report.maxScore}\n\n`;
  md += `**Summary**: ${report.summary.passed} passed, ${report.summary.needsImprovement} need improvement, ${report.summary.failed} failed\n\n`;
  md += `---\n\n`;

  for (const result of report.results) {
    md += `## Level ${result.level}: "${result.prompt}"\n\n`;
    md += `**Score**: ${result.score}/5 ${result.score >= 4 ? '✅' : result.score >= 3 ? '⚠️' : '❌'}\n\n`;
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

