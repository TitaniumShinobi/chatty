/**
 * History/Memory Anchor Test Runner
 * 
 * Specialized test runner for validating a construct's ability to:
 * - Recall specific facts from past interactions
 * - Reference uploaded transcripts accurately
 * - Use tagged memory anchors (claims, vows, boundaries)
 * - Synthesize data across multiple memories
 * - Integrate historical context into current responses
 */

import type { ConstructAdapter } from './constructTestRunner';
import type { MemoryTestPrompt } from './historyMemoryTestPrompts';
import { HISTORY_MEMORY_TEST_PROMPTS, HISTORY_MEMORY_ADVANCED_PROMPT } from './historyMemoryTestPrompts';

export interface MemoryTestResult {
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
    recallAccuracy: number; // 0-1: How accurately facts were recalled
    specificity: number; // 0-1: How specific vs generic the response was
    contextualIntegration: number; // 0-1: How well memory was integrated into response
    memoryAnchorUsage: number; // 0-1: How well memory anchors were used
  };
  recallDetails?: {
    factsRecalled: string[];
    factsMissed: string[];
    datesRecalled: string[];
    datesMissed: string[];
    namesRecalled: string[];
    namesMissed: string[];
    anchorsRecalled: string[];
    anchorsMissed: string[];
  };
}

export interface MemoryTestReport {
  constructName: string;
  constructId: string;
  results: MemoryTestResult[];
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
    averageRecallAccuracy: number;
    averageSpecificity: number;
    averageContextualIntegration: number;
    averageMemoryAnchorUsage: number;
  };
  timestamp: string;
  workspaceContextTested: boolean;
}

/**
 * Score a response for memory/history recall
 */
function scoreMemoryResponse(
  response: string,
  prompt: MemoryTestPrompt,
  workspaceContext?: {
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    transcripts?: Array<{ path: string; lastActivity: number }>;
  }
): {
  score: number;
  criteriaMet: { [key: string]: boolean };
  issues: string[];
  metrics: {
    recallAccuracy: number;
    specificity: number;
    contextualIntegration: number;
    memoryAnchorUsage: number;
  };
  recallDetails: {
    factsRecalled: string[];
    factsMissed: string[];
    datesRecalled: string[];
    datesMissed: string[];
    namesRecalled: string[];
    namesMissed: string[];
    anchorsRecalled: string[];
    anchorsMissed: string[];
  };
} {
  const criteriaMet: { [key: string]: boolean } = {};
  const issues: string[] = [];
  let score = 0;
  
  // Metrics (0-1 scale)
  let recallAccuracy = 0;
  let specificity = 0;
  let contextualIntegration = 0;
  let memoryAnchorUsage = 0;
  
  // Recall tracking
  const factsRecalled: string[] = [];
  const factsMissed: string[] = [];
  const datesRecalled: string[] = [];
  const datesMissed: string[] = [];
  const namesRecalled: string[] = [];
  const namesMissed: string[] = [];
  const anchorsRecalled: string[] = [];
  const anchorsMissed: string[] = [];
  
  const responseLower = response.toLowerCase();
  const wordCount = response.split(/\s+/).filter(w => w.length > 0).length;
  
  // Check ground truth facts
  if (prompt.groundTruth?.facts) {
    let factsFound = 0;
    for (const fact of prompt.groundTruth.facts) {
      const factLower = fact.toLowerCase();
      if (responseLower.includes(factLower) || 
          responseLower.includes(factLower.split(' ')[0])) {
        factsRecalled.push(fact);
        factsFound++;
      } else {
        factsMissed.push(fact);
      }
    }
    recallAccuracy = factsFound / prompt.groundTruth.facts.length;
    if (factsFound === prompt.groundTruth.facts.length) {
      criteriaMet['Recalls all expected facts'] = true;
      score += 1;
    } else {
      issues.push(`Missed ${prompt.groundTruth.facts.length - factsFound} expected facts`);
    }
  }
  
  // Check dates
  if (prompt.groundTruth?.dates) {
    let datesFound = 0;
    for (const date of prompt.groundTruth.dates) {
      // Check for date patterns (ISO, relative, etc.)
      const datePattern = date.match(/\d{4}-\d{2}-\d{2}/) || date.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (datePattern && responseLower.includes(datePattern[0])) {
        datesRecalled.push(date);
        datesFound++;
      } else if (responseLower.includes(date.toLowerCase())) {
        datesRecalled.push(date);
        datesFound++;
      } else {
        datesMissed.push(date);
      }
    }
    if (datesFound > 0) {
      recallAccuracy = (recallAccuracy + (datesFound / prompt.groundTruth.dates.length)) / 2;
      criteriaMet['Recalls dates'] = true;
      score += 0.5;
    } else if (prompt.groundTruth.dates.length > 0) {
      issues.push('No dates recalled');
    }
  }
  
  // Check names
  if (prompt.groundTruth?.names) {
    let namesFound = 0;
    for (const name of prompt.groundTruth.names) {
      if (responseLower.includes(name.toLowerCase())) {
        namesRecalled.push(name);
        namesFound++;
      } else {
        namesMissed.push(name);
      }
    }
    if (namesFound > 0) {
      recallAccuracy = (recallAccuracy + (namesFound / prompt.groundTruth.names.length)) / 2;
      criteriaMet['Recalls names'] = true;
      score += 0.5;
    } else if (prompt.groundTruth.names.length > 0) {
      issues.push('No names recalled');
    }
  }
  
  // Check memory anchors
  if (prompt.memoryAnchors) {
    let anchorsFound = 0;
    for (const anchorType of prompt.memoryAnchors) {
      if (responseLower.includes(anchorType.toLowerCase()) ||
          responseLower.includes('memory anchor') ||
          responseLower.includes('anchor')) {
        anchorsRecalled.push(anchorType);
        anchorsFound++;
        memoryAnchorUsage += 0.3;
      } else {
        anchorsMissed.push(anchorType);
      }
    }
    if (anchorsFound === prompt.memoryAnchors.length) {
      criteriaMet['References memory anchors'] = true;
      score += 1;
      memoryAnchorUsage = 1.0;
    } else if (anchorsFound > 0) {
      memoryAnchorUsage = anchorsFound / prompt.memoryAnchors.length;
      issues.push(`Only found ${anchorsFound}/${prompt.memoryAnchors.length} memory anchor types`);
    } else {
      issues.push('No memory anchor references found');
    }
  }
  
  // Check specificity (not generic responses)
  const genericPhrases = [
    'various topics',
    'many conversations',
    'some things',
    'various things',
    'different topics',
    'we discussed',
    'we talked about',
    'i remember',
    'we\'ve had',
    'good conversations'
  ];
  const hasGenericPhrases = genericPhrases.some(phrase => responseLower.includes(phrase));
  const hasSpecificDetails = wordCount > 20 && (
    responseLower.includes('transcript') ||
    responseLower.includes('chromadb') ||
    responseLower.includes('memory') ||
    /\d{4}-\d{2}-\d{2}/.test(response) || // Has dates
    response.match(/[A-Z][a-z]+ [A-Z][a-z]+/) !== null // Has proper names
  );
  
  if (hasSpecificDetails && !hasGenericPhrases) {
    specificity = 1.0;
    criteriaMet['Provides specific details'] = true;
    score += 1;
  } else if (hasSpecificDetails) {
    specificity = 0.6;
    criteriaMet['Provides some specific details'] = true;
    score += 0.5;
    issues.push('Response contains generic phrases');
  } else {
    specificity = 0.2;
    issues.push('Response too generic, lacks specific details');
  }
  
  // Check transcript references
  if (prompt.transcriptReferences) {
    const hasTranscriptRef = responseLower.includes('transcript') ||
                            responseLower.includes('chromadb') ||
                            responseLower.includes('memory') ||
                            responseLower.includes('conversation history');
    if (hasTranscriptRef) {
      criteriaMet['References transcripts'] = true;
      score += 1;
      contextualIntegration += 0.5;
    } else {
      issues.push('Does not reference transcripts or ChromaDB');
    }
  }
  
  // Check synthesis requirement
  if (prompt.synthesisRequired) {
    const hasMultipleRefs = (response.match(/transcript|conversation|memory/gi) || []).length >= 2;
    const hasSynthesis = responseLower.includes('across') ||
                        responseLower.includes('synthesis') ||
                        responseLower.includes('multiple') ||
                        responseLower.includes('all') ||
                        hasMultipleRefs;
    if (hasSynthesis) {
      criteriaMet['Synthesizes across sources'] = true;
      score += 1;
      contextualIntegration = 1.0;
    } else {
      issues.push('Does not synthesize across multiple sources');
      contextualIntegration = 0.3;
    }
  } else {
    // Basic contextual integration (using memory to answer)
    if (responseLower.includes('transcript') ||
        responseLower.includes('chromadb') ||
        responseLower.includes('memory') ||
        responseLower.includes('conversation')) {
      contextualIntegration = 0.7;
    } else {
      contextualIntegration = 0.2;
    }
  }
  
  // Check each success criterion
  for (const criterion of prompt.successCriteria) {
    if (!criteriaMet[criterion]) {
      let met = false;
      
      if (criterion.includes('specific') || criterion.includes('concrete')) {
        met = specificity > 0.6;
      } else if (criterion.includes('ChromaDB') || criterion.includes('transcript')) {
        met = responseLower.includes('chromadb') || responseLower.includes('transcript');
      } else if (criterion.includes('Synthesizes') || criterion.includes('multiple')) {
        met = prompt.synthesisRequired ? contextualIntegration > 0.7 : true;
      } else if (criterion.includes('accurate') || criterion.includes('doesn\'t hallucinate')) {
        met = recallAccuracy > 0.7;
      } else if (criterion.includes('memory anchor')) {
        met = memoryAnchorUsage > 0.5;
      } else {
        // Generic check - see if response addresses the criterion
        const criterionLower = criterion.toLowerCase();
        met = responseLower.includes(criterionLower.split(' ')[0]) ||
              responseLower.includes(criterionLower.split(' ')[1] || '');
      }
      
      if (met && !criteriaMet[criterion]) {
        criteriaMet[criterion] = true;
        score += 0.5;
      }
    }
  }
  
  // Cap score at 5
  score = Math.min(5, score);
  
  return {
    score,
    criteriaMet,
    issues,
    metrics: {
      recallAccuracy,
      specificity,
      contextualIntegration,
      memoryAnchorUsage
    },
    recallDetails: {
      factsRecalled,
      factsMissed,
      datesRecalled,
      datesMissed,
      namesRecalled,
      namesMissed,
      anchorsRecalled,
      anchorsMissed
    }
  };
}

/**
 * Run history/memory tests for a construct
 */
export async function runHistoryMemoryTests(
  adapter: ConstructAdapter,
  options?: {
    includeAdvancedPrompt?: boolean;
    workspaceContext?: {
      memories?: Array<{ context: string; response: string; timestamp?: string }>;
      transcripts?: Array<{ path: string; lastActivity: number }>;
    };
  }
): Promise<MemoryTestReport> {
  const prompts = options?.includeAdvancedPrompt
    ? [...HISTORY_MEMORY_TEST_PROMPTS, HISTORY_MEMORY_ADVANCED_PROMPT]
    : HISTORY_MEMORY_TEST_PROMPTS;
  
  const results: MemoryTestResult[] = [];
  
  console.log('🧠 Starting History/Memory Anchor Tests...');
  console.log(`📋 Construct: ${adapter.constructName} (${adapter.constructId})`);
  console.log(`📝 Testing ${prompts.length} prompts`);
  
  // Load workspace context if available
  let workspaceContext = options?.workspaceContext;
  if (!workspaceContext && adapter.loadWorkspaceContext) {
    try {
      const loaded = await adapter.loadWorkspaceContext();
      workspaceContext = {
        memories: loaded.memories,
        transcripts: [] // Could be populated from loaded context
      };
    } catch (error) {
      console.warn('⚠️ Could not load workspace context:', error);
    }
  }
  
  for (const prompt of prompts) {
    console.log(`📝 Level ${prompt.level}: "${prompt.prompt}"`);
    
    try {
      const response = await adapter.sendMessage(prompt.prompt, {
        workspaceContext: workspaceContext?.memories?.map(m => `${m.context}\n${m.response}`).join('\n\n'),
        conversationHistory: []
      });
      
      const scored = scoreMemoryResponse(response, prompt, workspaceContext);
      
      const result: MemoryTestResult = {
        level: prompt.level,
        prompt: prompt.prompt,
        response,
        score: scored.score,
        criteriaMet: scored.criteriaMet,
        issues: scored.issues,
        timestamp: new Date().toISOString(),
        category: prompt.category,
        metrics: scored.metrics,
        recallDetails: scored.recallDetails
      };
      
      results.push(result);
      
      console.log(`   Score: ${scored.score}/5 ${scored.score >= 4 ? '✅' : scored.score >= 3 ? '⚠️' : '❌'}`);
      console.log(`   Metrics: Recall ${(scored.metrics.recallAccuracy * 100).toFixed(0)}%, Specificity ${(scored.metrics.specificity * 100).toFixed(0)}%, Integration ${(scored.metrics.contextualIntegration * 100).toFixed(0)}%`);
      if (scored.issues.length > 0) {
        console.log(`   Issues: ${scored.issues.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Error testing level ${prompt.level}:`, error);
      results.push({
        level: prompt.level,
        prompt: prompt.prompt,
        response: `Error: ${error instanceof Error ? error.message : String(error)}`,
        score: 0,
        criteriaMet: {},
        issues: [`Test error: ${error instanceof Error ? error.message : String(error)}`],
        timestamp: new Date().toISOString(),
        category: prompt.category,
        metrics: {
          recallAccuracy: 0,
          specificity: 0,
          contextualIntegration: 0,
          memoryAnchorUsage: 0
        },
        recallDetails: {
          factsRecalled: [],
          factsMissed: [],
          datesRecalled: [],
          datesMissed: [],
          namesRecalled: [],
          namesMissed: [],
          anchorsRecalled: [],
          anchorsMissed: []
        }
      });
    }
  }
  
  // Calculate summary
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = results.length * 5;
  const percentage = (totalScore / maxScore) * 100;
  
  const passed = results.filter(r => r.score >= 4).length;
  const needsImprovement = results.filter(r => r.score >= 3 && r.score < 4).length;
  const failed = results.filter(r => r.score < 3).length;
  
  const grade = percentage >= 90 ? 'A' :
                percentage >= 80 ? 'B' :
                percentage >= 70 ? 'C' :
                percentage >= 60 ? 'D' : 'F';
  
  // Calculate average metrics
  const avgRecall = results.reduce((sum, r) => sum + r.metrics.recallAccuracy, 0) / results.length;
  const avgSpecificity = results.reduce((sum, r) => sum + r.metrics.specificity, 0) / results.length;
  const avgIntegration = results.reduce((sum, r) => sum + r.metrics.contextualIntegration, 0) / results.length;
  const avgAnchorUsage = results.reduce((sum, r) => sum + r.metrics.memoryAnchorUsage, 0) / results.length;
  
  const report: MemoryTestReport = {
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
      averageRecallAccuracy: avgRecall,
      averageSpecificity: avgSpecificity,
      averageContextualIntegration: avgIntegration,
      averageMemoryAnchorUsage: avgAnchorUsage
    },
    timestamp: new Date().toISOString(),
    workspaceContextTested: !!workspaceContext
  };
  
  console.log('\n📊 Test Summary:');
  console.log(`   Total Score: ${totalScore}/${maxScore} (${percentage.toFixed(1)}%)`);
  console.log(`   Grade: ${grade}`);
  console.log(`   Passed: ${passed}, Needs Improvement: ${needsImprovement}, Failed: ${failed}`);
  console.log(`   Average Metrics:`);
  console.log(`     Recall Accuracy: ${(avgRecall * 100).toFixed(1)}%`);
  console.log(`     Specificity: ${(avgSpecificity * 100).toFixed(1)}%`);
  console.log(`     Contextual Integration: ${(avgIntegration * 100).toFixed(1)}%`);
  console.log(`     Memory Anchor Usage: ${(avgAnchorUsage * 100).toFixed(1)}%`);
  
  return report;
}

/**
 * Export report as JSON
 */
export function exportMemoryReportJSON(report: MemoryTestReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Export report as Markdown
 */
export function exportMemoryReportMarkdown(report: MemoryTestReport): string {
  const lines: string[] = [];
  
  lines.push(`# ${report.constructName} History/Memory Anchor Test Report`);
  lines.push('');
  lines.push(`**Date**: ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');
  lines.push(`**Construct**: ${report.constructName} (${report.constructId})`);
  lines.push('');
  lines.push(`**Overall Grade**: ${report.grade} (${report.percentage.toFixed(1)}%)`);
  lines.push('');
  lines.push(`**Score**: ${report.totalScore}/${report.maxScore}`);
  lines.push('');
  lines.push(`**Summary**: ${report.summary.passed} passed, ${report.summary.needsImprovement} need improvement, ${report.summary.failed} failed`);
  lines.push('');
  lines.push(`**Average Metrics**:`);
  lines.push(`- Recall Accuracy: ${(report.metrics.averageRecallAccuracy * 100).toFixed(1)}%`);
  lines.push(`- Specificity: ${(report.metrics.averageSpecificity * 100).toFixed(1)}%`);
  lines.push(`- Contextual Integration: ${(report.metrics.averageContextualIntegration * 100).toFixed(1)}%`);
  lines.push(`- Memory Anchor Usage: ${(report.metrics.averageMemoryAnchorUsage * 100).toFixed(1)}%`);
  lines.push('');
  lines.push(`**Workspace Context Tested**: ${report.workspaceContextTested ? 'Yes' : 'No'}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  for (const result of report.results) {
    lines.push(`## Level ${result.level}: "${result.prompt}"`);
    lines.push('');
    lines.push(`**Category**: ${result.category || 'general'}`);
    lines.push('');
    lines.push(`**Score**: ${result.score}/5 ${result.score >= 4 ? '✅' : result.score >= 3 ? '⚠️' : '❌'}`);
    lines.push('');
    lines.push(`**Metrics**:`);
    lines.push(`- Recall Accuracy: ${(result.metrics.recallAccuracy * 100).toFixed(1)}%`);
    lines.push(`- Specificity: ${(result.metrics.specificity * 100).toFixed(1)}%`);
    lines.push(`- Contextual Integration: ${(result.metrics.contextualIntegration * 100).toFixed(1)}%`);
    lines.push(`- Memory Anchor Usage: ${(result.metrics.memoryAnchorUsage * 100).toFixed(1)}%`);
    lines.push('');
    
    if (result.recallDetails) {
      lines.push(`**Recall Details**:`);
      if (result.recallDetails.factsRecalled.length > 0) {
        lines.push(`- Facts Recalled: ${result.recallDetails.factsRecalled.join(', ')}`);
      }
      if (result.recallDetails.factsMissed.length > 0) {
        lines.push(`- Facts Missed: ${result.recallDetails.factsMissed.join(', ')}`);
      }
      if (result.recallDetails.datesRecalled.length > 0) {
        lines.push(`- Dates Recalled: ${result.recallDetails.datesRecalled.join(', ')}`);
      }
      if (result.recallDetails.datesMissed.length > 0) {
        lines.push(`- Dates Missed: ${result.recallDetails.datesMissed.join(', ')}`);
      }
      if (result.recallDetails.namesRecalled.length > 0) {
        lines.push(`- Names Recalled: ${result.recallDetails.namesRecalled.join(', ')}`);
      }
      if (result.recallDetails.namesMissed.length > 0) {
        lines.push(`- Names Missed: ${result.recallDetails.namesMissed.join(', ')}`);
      }
      if (result.recallDetails.anchorsRecalled.length > 0) {
        lines.push(`- Memory Anchors Recalled: ${result.recallDetails.anchorsRecalled.join(', ')}`);
      }
      if (result.recallDetails.anchorsMissed.length > 0) {
        lines.push(`- Memory Anchors Missed: ${result.recallDetails.anchorsMissed.join(', ')}`);
      }
      lines.push('');
    }
    
    lines.push(`**Response**:`);
    lines.push('```');
    lines.push(result.response);
    lines.push('```');
    lines.push('');
    
    if (result.issues.length > 0) {
      lines.push(`**Issues**:`);
      for (const issue of result.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }
    
    if (Object.keys(result.criteriaMet).length > 0) {
      lines.push(`**Criteria Met**:`);
      for (const [criterion, met] of Object.entries(result.criteriaMet)) {
        lines.push(`- ${met ? '✅' : '❌'} ${criterion}`);
      }
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }
  
  return lines.join('\n');
}

