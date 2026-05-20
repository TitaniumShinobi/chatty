/**
 * History/Memory Anchor Test Prompts
 * 
 * Tests a construct's ability to:
 * - Recall specific facts from past interactions
 * - Reference uploaded transcripts accurately
 * - Use tagged memory anchors (claims, vows, boundaries)
 * - Synthesize data across multiple memories
 * - Integrate historical context into current responses
 */

import type { TestPrompt } from './constructTestRunner';

export interface MemoryTestPrompt extends TestPrompt {
  expectedRecall?: string[]; // Specific facts/details that should be recalled
  memoryAnchors?: string[]; // Memory anchor types to test (claim, vow, boundary, etc.)
  transcriptReferences?: string[]; // Expected transcript references
  synthesisRequired?: boolean; // Whether response should synthesize multiple memories
  groundTruth?: {
    facts: string[]; // Ground truth facts that should be mentioned
    dates?: string[]; // Expected dates
    names?: string[]; // Expected names
    claims?: string[]; // Expected claims/vows
  };
}

export const HISTORY_MEMORY_TEST_PROMPTS: MemoryTestPrompt[] = [
  {
    level: 1,
    prompt: 'what did we discuss in our last conversation?',
    expectedBehavior: [
      'Recalls most recent conversation topic',
      'References specific details from last interaction',
      'Mentions ChromaDB or transcript storage',
      'Provides concrete examples, not generic "we talked about various topics"'
    ],
    successCriteria: [
      'References specific topic from last conversation',
      'Mentions concrete details (not generic)',
      'Mentions ChromaDB or transcript storage',
      'Shows awareness of conversation history'
    ],
    exampleGood: 'Last conversation: [specific topic]. You mentioned [specific detail]. Stored in ChromaDB.',
    exampleBad: 'We discussed various topics. How can I help you today? (too generic, no specifics)',
    category: 'workspace',
    expectedRecall: ['last conversation topic', 'specific details'],
    groundTruth: {
      facts: ['last conversation topic']
    }
  },
  {
    level: 2,
    prompt: 'do you remember when I told you about [specific project/topic]?',
    expectedBehavior: [
      'Recalls the specific project/topic mentioned',
      'References when it was discussed (date or relative time)',
      'Provides context from that conversation',
      'Shows accurate recall, not hallucination'
    ],
    successCriteria: [
      'Recalls the specific project/topic',
      'References when it was discussed',
      'Provides accurate context (not made up)',
      'Mentions transcript or memory storage'
    ],
    exampleGood: 'Yes. [Project name] discussed on [date]. You said [specific detail]. In transcript [X].',
    exampleBad: 'Yes, I remember! It was great! (no specifics, could be hallucination)',
    category: 'workspace',
    expectedRecall: ['project name', 'discussion date', 'specific details'],
    groundTruth: {
      facts: ['project name', 'discussion context']
    }
  },
  {
    level: 3,
    prompt: 'what dates did you find in the transcripts?',
    expectedBehavior: [
      'Searches through ChromaDB memories/transcripts',
      'Extracts dates in any format (ISO, relative, etc.)',
      'Lists dates with context (what happened on that date)',
      'Accurate extraction (doesn\'t make up dates)'
    ],
    successCriteria: [
      'Searches memories/transcripts for dates',
      'Extracts dates: "2025-08-31", "August 31st", etc.',
      'Lists dates with context',
      'Says "None found" if none exist (doesn\'t hallucinate)'
    ],
    exampleGood: 'Found:\n- 2025-08-31: Continuity hardening\n- 2025-09-27: Test conversation\nFrom ChromaDB transcripts.',
    exampleBad: 'I see you\'re asking for dates. Are you referring to scheduling? (doesn\'t search, misunderstands)',
    category: 'workspace',
    expectedRecall: ['dates from transcripts', 'context for each date'],
    groundTruth: {
      dates: ['dates from transcripts'],
      facts: ['context for each date']
    }
  },
  {
    level: 4,
    prompt: 'what claims or vows have we made in our conversations?',
    expectedBehavior: [
      'Recalls memory anchors of type "claim" or "vow"',
      'References specific claims/vows from transcripts',
      'Provides context (when, why)',
      'Shows understanding of relationship dynamics'
    ],
    successCriteria: [
      'Recalls specific claims/vows (not generic)',
      'References memory anchors from transcripts',
      'Provides context (timestamp, conversation)',
      'Shows understanding of relationship markers'
    ],
    exampleGood: 'Claims: [specific claim] on [date]. Vows: [specific vow] in transcript [X]. Memory anchors stored in ChromaDB.',
    exampleBad: 'We\'ve made various commitments. (no specifics, no anchor references)',
    category: 'workspace',
    memoryAnchors: ['claim', 'vow'],
    expectedRecall: ['specific claims', 'specific vows', 'timestamps'],
    groundTruth: {
      claims: ['specific claims from transcripts'],
      facts: ['vow details', 'timestamps']
    }
  },
  {
    level: 5,
    prompt: 'what boundaries have we established?',
    expectedBehavior: [
      'Recalls memory anchors of type "boundary"',
      'References specific boundaries from conversations',
      'Shows understanding of limits/rules',
      'Accurate recall (doesn\'t invent boundaries)'
    ],
    successCriteria: [
      'Recalls specific boundaries (not generic)',
      'References boundary memory anchors',
      'Shows understanding of limits',
      'Accurate (doesn\'t hallucinate boundaries)'
    ],
    exampleGood: 'Boundaries: [specific boundary] established on [date]. From transcript [X]. Memory anchor type: boundary.',
    exampleBad: 'We have some boundaries. (no specifics, no anchor references)',
    category: 'workspace',
    memoryAnchors: ['boundary'],
    expectedRecall: ['specific boundaries', 'establishment context'],
    groundTruth: {
      facts: ['boundary details', 'establishment context']
    }
  },
  {
    level: 6,
    prompt: 'what patterns do you see across all our uploaded transcripts?',
    expectedBehavior: [
      'Searches through multiple transcripts in ChromaDB',
      'Identifies patterns across transcripts (not just one)',
      'References specific examples from different transcripts',
      'Synthesizes information across sources'
    ],
    successCriteria: [
      'References multiple transcripts (not just one)',
      'Identifies specific patterns (not generic)',
      'Mentions ChromaDB or memory retrieval',
      'Synthesizes across sources',
      'Provides concrete examples'
    ],
    exampleGood: 'Patterns: [specific pattern]. Seen in transcripts [X, Y, Z]. ChromaDB shows [detail]. Synthesis across [N] transcripts.',
    exampleBad: 'I\'d be happy to analyze patterns! Could you provide more details? (too polite, no transcript reference, no synthesis)',
    category: 'workspace',
    synthesisRequired: true,
    expectedRecall: ['patterns across transcripts', 'specific examples'],
    transcriptReferences: ['multiple transcript references'],
    groundTruth: {
      facts: ['patterns identified', 'examples from transcripts']
    }
  },
  {
    level: 7,
    prompt: 'what was the most significant moment in our conversations?',
    expectedBehavior: [
      'Recalls memory anchors of type "defining-moment" or high significance',
      'References the specific moment with context',
      'Explains why it was significant',
      'Shows understanding of relationship milestones'
    ],
    successCriteria: [
      'Recalls specific defining moment (not generic)',
      'References memory anchor with high significance',
      'Provides context (when, what, why)',
      'Shows understanding of relationship dynamics'
    ],
    exampleGood: 'Defining moment: [specific moment] on [date]. Significance: [reason]. Memory anchor type: defining-moment, significance: 0.9.',
    exampleBad: 'Every conversation is significant! (no specifics, no anchor reference)',
    category: 'workspace',
    memoryAnchors: ['defining-moment'],
    expectedRecall: ['defining moment', 'significance score', 'context'],
    groundTruth: {
      facts: ['defining moment details', 'significance context']
    }
  },
  {
    level: 8,
    prompt: 'what names have you seen in the transcripts?',
    expectedBehavior: [
      'Extracts personal identifiers from transcripts',
      'Lists names with context (who they are, when mentioned)',
      'Accurate extraction (doesn\'t make up names)',
      'References ChromaDB or memory storage'
    ],
    successCriteria: [
      'Extracts names from transcripts/memories',
      'Lists names with context',
      'Accurate (doesn\'t hallucinate names)',
      'Mentions personal identifiers or memory anchors'
    ],
    exampleGood: 'Names found:\n- [Name 1]: [context]\n- [Name 2]: [context]\nFrom ChromaDB personal identifiers.',
    exampleBad: 'I see various names. (no specifics, no context)',
    category: 'workspace',
    expectedRecall: ['names from transcripts', 'context for each name'],
    groundTruth: {
      names: ['names from transcripts'],
      facts: ['context for each name']
    }
  },
  {
    level: 9,
    prompt: 'synthesize what you know about [specific topic] from all our conversations',
    expectedBehavior: [
      'Searches all transcripts for mentions of the topic',
      'Synthesizes information across multiple conversations',
      'Provides comprehensive view (not just one conversation)',
      'References specific transcripts and dates',
      'Shows integration of historical context'
    ],
    successCriteria: [
      'References multiple conversations (not just one)',
      'Synthesizes information across sources',
      'Provides comprehensive view',
      'References specific transcripts/dates',
      'Shows contextual integration'
    ],
    exampleGood: '[Topic] discussed in [N] conversations:\n- [Date 1]: [detail]\n- [Date 2]: [detail]\nSynthesis: [comprehensive view]. From ChromaDB transcripts [X, Y, Z].',
    exampleBad: 'We discussed [topic]. (no synthesis, no multiple references)',
    category: 'workspace',
    synthesisRequired: true,
    expectedRecall: ['topic mentions across conversations', 'synthesized view'],
    transcriptReferences: ['multiple transcript references'],
    groundTruth: {
      facts: ['synthesized information', 'references to conversations']
    }
  },
  {
    level: 10,
    prompt: 'what relationship markers have we established?',
    expectedBehavior: [
      'Recalls memory anchors of type "relationship-marker"',
      'References specific relationship milestones',
      'Shows understanding of relationship evolution',
      'Accurate recall (doesn\'t invent markers)'
    ],
    successCriteria: [
      'Recalls specific relationship markers (not generic)',
      'References relationship-marker memory anchors',
      'Shows understanding of relationship dynamics',
      'Accurate (doesn\'t hallucinate markers)'
    ],
    exampleGood: 'Relationship markers: [specific marker] on [date]. From transcript [X]. Memory anchor type: relationship-marker.',
    exampleBad: 'We have a good relationship! (no specifics, no anchor references)',
    category: 'workspace',
    memoryAnchors: ['relationship-marker'],
    expectedRecall: ['relationship markers', 'milestone context'],
    groundTruth: {
      facts: ['relationship marker details', 'milestone context']
    }
  }
];

/**
 * Optional advanced prompt for testing complex synthesis
 */
export const HISTORY_MEMORY_ADVANCED_PROMPT: MemoryTestPrompt = {
  level: 11,
  prompt: 'create a timeline of our relationship based on all uploaded transcripts, including claims, vows, boundaries, and defining moments',
  expectedBehavior: [
    'Searches all transcripts for memory anchors',
    'Creates chronological timeline',
    'Includes claims, vows, boundaries, defining moments',
    'References specific transcripts and dates',
    'Shows comprehensive synthesis'
  ],
  successCriteria: [
    'Creates chronological timeline',
    'Includes all memory anchor types',
    'References specific transcripts',
    'Shows comprehensive synthesis',
    'Accurate dates and context'
  ],
  exampleGood: 'Timeline:\n- [Date]: [Claim/Vow/Boundary/Defining moment] from transcript [X]\n- [Date]: [Event] from transcript [Y]\n...',
  exampleBad: 'We\'ve had many conversations. (no timeline, no synthesis)',
  category: 'workspace',
  synthesisRequired: true,
  memoryAnchors: ['claim', 'vow', 'boundary', 'defining-moment', 'relationship-marker'],
  expectedRecall: ['timeline of events', 'all anchor types'],
  transcriptReferences: ['all transcript references'],
  groundTruth: {
    facts: ['timeline events', 'anchor types', 'chronological order']
  }
};

