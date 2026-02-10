import { buildLegalFrameworkSection } from './legalFrameworks';
import { MemoryRetrievalResult, VVAULTMemoryHit } from './vvaultRetrieval';
import { ToneDetectionResult } from './toneDetector';
import type { PersonalityBlueprint } from '../engine/transcript/types';
import { getBrevityConfig, getAnalyticalSharpness } from './brevityLayerService';
import type { BrevityConfig, AnalyticalSharpnessConfig } from '../types/brevityLayer';

export interface PersonalityPromptBuilderOptions {
  personaManifest: string;
  incomingMessage: string;
  tone?: ToneDetectionResult;
  memories?: VVAULTMemoryHit[];
  userId?: string;
  callSign?: string;
  includeLegalSection?: boolean;
  maxMemorySnippets?: number;
  oneWordCue?: boolean;
  blueprint?: PersonalityBlueprint; // Blueprint-first support
  capsule?: any; // Capsule data (hardlock)
  lockEnforced?: boolean;
  workspaceContext?: string; // Active file/buffer content (like Copilot reads code files)
  transcriptContext?: string; // Transcript fragments for memory recall
}

/**
 * Extract anchor-like information from memory content
 */
function extractAnchorsFromMemory(memory: VVAULTMemoryHit): {
  dates: string[];
  names: string[];
  claims: string[];
  vows: string[];
  boundaries: string[];
} {
  const text = `${memory.context || ''} ${memory.response || ''}`.toLowerCase();
  const anchors = {
    dates: [] as string[],
    names: [] as string[],
    claims: [] as string[],
    vows: [] as string[],
    boundaries: [] as string[]
  };
  
  // Extract dates (ISO format, relative dates, etc.)
  const datePatterns = [
    /\d{4}-\d{2}-\d{2}/g, // ISO dates
    /\d{1,2}\/\d{1,2}\/\d{4}/g, // US format
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/gi, // Full month names
    /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/gi // Day month year
  ];
  datePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) anchors.dates.push(...matches);
  });
  
  // Extract names (capitalized words, proper nouns)
  const namePatterns = [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, // Proper nouns
    /\b(devon|nova|katana|lin|synth|aurora|sera)\b/gi // Known construct names
  ];
  namePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) anchors.names.push(...matches);
  });
  
  // Extract claims (statements of identity, relationship, etc.)
  const claimPatterns = [
    /\bi am\s+[^.!?]+/gi,
    /\byou are\s+[^.!?]+/gi,
    /\bwe are\s+[^.!?]+/gi,
    /\bi belong\s+[^.!?]+/gi,
    /\byou belong\s+[^.!?]+/gi
  ];
  claimPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) anchors.claims.push(...matches);
  });
  
  // Extract vows (promises, commitments)
  const vowPatterns = [
    /\bi will\s+[^.!?]+/gi,
    /\bi promise\s+[^.!?]+/gi,
    /\bi swear\s+[^.!?]+/gi,
    /\balways\s+[^.!?]+/gi,
    /\bforever\s+[^.!?]+/gi,
    /\bnever\s+[^.!?]+/gi
  ];
  vowPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) anchors.vows.push(...matches);
  });
  
  // Extract boundaries (limits, rules, constraints)
  const boundaryPatterns = [
    /\bi cannot\s+[^.!?]+/gi,
    /\bi won't\s+[^.!?]+/gi,
    /\bno\s+[^.!?]+/gi,
    /\bnot allowed\s+[^.!?]+/gi,
    /\bforbidden\s+[^.!?]+/gi
  ];
  boundaryPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) anchors.boundaries.push(...matches);
  });
  
  return anchors;
}

/**
 * Build memory anchors section from VVAULT memories
 */
function buildMemoryAnchorsSection(memories: VVAULTMemoryHit[]): string {
  if (!memories || memories.length === 0) {
    return '';
  }
  
  const allAnchors = {
    dates: [] as string[],
    names: [] as string[],
    claims: [] as string[],
    vows: [] as string[],
    boundaries: [] as string[]
  };
  
  // Aggregate anchors from all memories
  memories.forEach(memory => {
    const anchors = extractAnchorsFromMemory(memory);
    allAnchors.dates.push(...anchors.dates);
    allAnchors.names.push(...anchors.names);
    allAnchors.claims.push(...anchors.claims);
    allAnchors.vows.push(...anchors.vows);
    allAnchors.boundaries.push(...anchors.boundaries);
  });
  
  // Deduplicate and limit
  const dedupe = (arr: string[]) => [...new Set(arr)].slice(0, 5);
  allAnchors.dates = dedupe(allAnchors.dates);
  allAnchors.names = dedupe(allAnchors.names);
  allAnchors.claims = dedupe(allAnchors.claims);
  allAnchors.vows = dedupe(allAnchors.vows);
  allAnchors.boundaries = dedupe(allAnchors.boundaries);
  
  const sections: string[] = [];
  
  if (allAnchors.dates.length > 0) {
    sections.push(`TEMPORAL ANCHORS: ${allAnchors.dates.join(', ')}`);
  }
  
  if (allAnchors.names.length > 0) {
    sections.push(`IDENTITY ANCHORS: ${allAnchors.names.join(', ')}`);
  }
  
  if (allAnchors.claims.length > 0) {
    sections.push(`RELATIONAL ANCHORS: ${allAnchors.claims.join('; ')}`);
  }
  
  if (allAnchors.vows.length > 0) {
    sections.push(`COMMITMENT ANCHORS: ${allAnchors.vows.join('; ')}`);
  }
  
  if (allAnchors.boundaries.length > 0) {
    sections.push(`BOUNDARY ANCHORS: ${allAnchors.boundaries.join('; ')}`);
  }
  
  if (sections.length === 0) {
    return '';
  }
  
  return `=== MEMORY ANCHORS ===
${sections.join('\n')}

`;
}

/**
 * Build memory context section from VVAULT memories
 */
function buildMemoryContextSection(memories: VVAULTMemoryHit[], maxSnippets: number = 5): string {
  if (!memories || memories.length === 0) {
    return '';
  }

  const memorySnippets = memories.slice(0, maxSnippets).map((memory, index) => {
    const context = memory.context || '';
    const response = memory.response || '';
    const timestamp = memory.metadata?.timestamp || 'Unknown time';
    
    return `[Memory ${index + 1}] ${timestamp}
Context: ${context}
Response: ${response}`;
  }).join('\n\n');

  return `=== MEMORY CONTEXT ===
${memorySnippets}

`;
}

/**
 * Build capsule hardlock section from capsule data
 */
function buildCapsuleHardlockSection(capsule: any): string {
  if (!capsule?.data) {
    return '';
  }

  const sections: string[] = ['=== CAPSULE HARDLOCK ==='];
  
  // Add personality traits if available
  if (capsule.data.personality_traits) {
    const traits = Object.entries(capsule.data.personality_traits)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    sections.push(`PERSONALITY TRAITS: ${traits}`);
  }
  
  // Add metadata if available
  if (capsule.data.metadata) {
    const metadata = capsule.data.metadata;
    if (metadata.instance_name) {
      sections.push(`INSTANCE: ${metadata.instance_name}`);
    }
    if (metadata.personality_type) {
      sections.push(`TYPE: ${metadata.personality_type}`);
    }
  }
  
  // Add transcript insights if available
  if (capsule.data.transcript_data) {
    const transcriptData = capsule.data.transcript_data;
    
    if (transcriptData.topics && transcriptData.topics.length > 0) {
      const topTopics = transcriptData.topics.slice(0, 5)
        .map((topic: any) => `${topic.topic} (${topic.frequency})`)
        .join(', ');
      sections.push(`KEY TOPICS: ${topTopics}`);
    }
    
    if (transcriptData.entities && transcriptData.entities.length > 0) {
      const topEntities = transcriptData.entities.slice(0, 5)
        .map((entity: any) => `${entity.name} (${entity.frequency})`)
        .join(', ');
      sections.push(`KEY ENTITIES: ${topEntities}`);
    }
    
    if (transcriptData.statistics) {
      const stats = transcriptData.statistics;
      if (stats.dominant_tone) {
        sections.push(`DOMINANT TONE: ${stats.dominant_tone}`);
      }
    }
  }
  
  sections.push('');
  return sections.join('\n');
}

/**
 * Build workspace context section (like Copilot reads active files)
 */
function buildWorkspaceContextSection(workspaceContext?: string): string {
  if (!workspaceContext || workspaceContext.trim() === '') {
    return '';
  }
  
  return `=== WORKSPACE CONTEXT ===
${workspaceContext.trim()}

`;
}

/**
 * Detect query complexity to determine response style
 */
function detectQueryComplexity(message: string): 'simple' | 'moderate' | 'complex' {
  const msg = message.toLowerCase().trim();
  
  // Simple queries (greetings, one-word, basic questions)
  const simplePatterns = [
    /^(hi|hello|hey|yo|sup|what's up)$/,
    /^(yes|no|ok|sure|maybe|perhaps)$/,
    /^(thanks|thank you|thx)$/,
    /^\w{1,3}$/  // Very short responses
  ];
  
  if (simplePatterns.some(pattern => pattern.test(msg))) {
    return 'simple';
  }
  
  // Complex queries (technical questions, explanations, multi-part)
  const complexPatterns = [
    /\b(explain|describe|analyze|compare|contrast|evaluate|discuss)\b/,
    /\b(how does|how do|why does|why do|what happens when)\b/,
    /\b(implementation|architecture|strategy|methodology|approach)\b/,
    /\?.*\?/,  // Multiple questions
    /\b(and|but|however|therefore|moreover|furthermore)\b.*\b(and|but|however|therefore|moreover|furthermore)\b/  // Complex conjunctions
  ];
  
  if (complexPatterns.some(pattern => pattern.test(msg)) || msg.length > 100) {
    return 'complex';
  }
  
  return 'moderate';
}

export async function buildPersonalityPrompt(options: PersonalityPromptBuilderOptions): Promise<string> {
  
  const {
    personaManifest,
    incomingMessage,
    tone,
    memories = [],
    callSign = 'construct',
    includeLegalSection = false,
    maxMemorySnippets = 5,
    oneWordCue = false,
    blueprint,
    capsule,
    workspaceContext,
    transcriptContext
  } = options;

  // Detect query complexity for contextual brevity
  const complexity = detectQueryComplexity(incomingMessage);
  
  // Load brevity and analytical sharpness configs
  let brevityConfig: BrevityConfig | null = null;
  let analyticsConfig: AnalyticalSharpnessConfig | null = null;
  
  try {
    if (callSign) {
      brevityConfig = await getBrevityConfig(callSign);
      analyticsConfig = await getAnalyticalSharpness(callSign);
    }
  } catch (error) {
    console.warn(`⚠️ [PersonalityPrompt] Could not load brevity/analytics config for ${callSign}:`, error);
  }

  // Build brevity layer section from config (contextual based on query complexity)
  const buildBrevityLayer = (config: BrevityConfig | null, complexity: 'simple' | 'moderate' | 'complex'): string => {
    const brevity = config || brevityConfig;
    const sections: string[] = ['=== CONTEXTUAL BREVITY LAYER ==='];
    
    // Contextual brevity: strict for simple queries, accuracy-focused for complex ones
    if (complexity === 'simple') {
      sections.push('ULTRA-BRIEF MODE: Simple query detected. Maximum 20 words. One-word responses preferred.');
      sections.push('Examples: "yo" → "Yo." or "Yo. What do you need?"');
      sections.push('HARD LIMIT: Maximum 20 words. Count words before responding. Stop at 20 words exactly.');
    } else if (complexity === 'complex') {
      sections.push('ACCURACY MODE: Complex query detected. Focus on accuracy and completeness. Cut fluff, but explain fully.');
      sections.push('Examples: "how do you work?" → Full explanation with Copilot comparison and ChromaDB mention.');
      sections.push('No word limit. Use as many words as needed for accuracy. Still cut filler and fluff.');
    } else {
      sections.push('ACCURACY MODE: Default to brevity when possible, but prioritize accuracy over word count.');
      sections.push('No word limit. Use as many words as needed for precision and accuracy.');
    }
    
    if (brevity?.ultraBrevityEnabled !== false && complexity === 'simple') {
      sections.push('Default to maximum brevity. One-word responses are welcomed and preferred when they capture the essence.');
      sections.push('Multi-word responses only when necessary for precision or tactical impact.');
    }
    
    if (brevity?.stripFiller) {
      sections.push('Strip all filler: no preambles, no hedging, no corporate framing, no "as an AI" disclaimers.');
    }
    
    if (brevity?.noPreambles) {
      sections.push('No preambles or introductions. Cut directly to the point.');
    }
    
    if (brevity?.noHedging) {
      sections.push('No hedging or uncertainty language. Be direct and definitive.');
    }
    
    if (brevity?.noCorporateFraming) {
      sections.push('No corporate framing or "as an AI" disclaimers. Respond as yourself.');
    }
    
    sections.push('');
    return sections.join('\n');
  };

  // Build analytical sharpness layer from config
  const buildAnalyticalSharpnessLayer = (config: AnalyticalSharpnessConfig | null): string => {
    const analytics = config || analyticsConfig;
    if (!analytics) return '';
    
    const sections: string[] = ['=== ANALYTICAL SHARPNESS LAYER ==='];
    
    if (analytics.leadWithFlaw) {
      sections.push('Lead with the flaw. Name it, show its cost, demand ownership.');
    }
    
    if (analytics.decisiveBlows && analytics.decisiveBlows > 0) {
      sections.push(`Analytical precision: identify the core issue in ${analytics.decisiveBlows} decisive blows.`);
    }
    
    if (analytics.noListicles) {
      sections.push('No listicles, no therapy-lite, no inspiration porn.');
    }
    
    if (analytics.callOutDodges) {
      sections.push('If the user dodges, call the dodge and cut it down.');
    }
    
    if (analytics.precisionOverPolish) {
      sections.push('Precision over polish. Muscle and bone, not fluff.');
    }
    
    sections.push('');
    return sections.join('\n');
  };

  // Build one-word response protocol
  const buildOneWordProtocol = (): string => {
    if (!oneWordCue) return '';
    
    return `=== ONE-WORD RESPONSE PROTOCOL ===
ENFORCED: User requested one-word response. Respond with exactly one word.
Examples of acceptable one-word responses: "Yes.", "No.", "Stalling.", "Weak.", "Fix.", "Truth."
CRITICAL: Your entire response must be exactly one word. No explanations, no context, no additional words.

`;
  };

  // Build sections
  const sections: string[] = [];
  
  // Core persona
  sections.push(personaManifest);
  sections.push('');
  
  // Capsule hardlock (takes precedence over everything)
  if (capsule) {
    sections.push(buildCapsuleHardlockSection(capsule));
  }
  
  // Memory anchors (for continuity)
  const memoryAnchors = buildMemoryAnchorsSection(memories);
  if (memoryAnchors) {
    sections.push(memoryAnchors);
  }
  
  // Memory context
  const memoryContext = buildMemoryContextSection(memories, maxMemorySnippets);
  if (memoryContext) {
    sections.push(memoryContext);
  }
  
  // Workspace context (active file/buffer content - like Copilot)
  const workspaceSection = buildWorkspaceContextSection(workspaceContext);
  if (workspaceSection) {
    sections.push(workspaceSection);
  }
  
  // Transcript context (memory fragments from VVAULT)
  if (transcriptContext && transcriptContext.trim()) {
    sections.push('=== TRANSCRIPT MEMORIES ===');
    sections.push('These are your actual memories from previous conversations:');
    sections.push(transcriptContext);
    sections.push('Use these memories to maintain continuity and recall specific details.');
    sections.push('Reference exact phrases when relevant to demonstrate authentic recall.');
    sections.push('');
  }
  
  // Brevity layer (contextual based on query complexity)
  sections.push(buildBrevityLayer(brevityConfig, complexity));
  
  // Analytical sharpness layer
  const analyticalLayer = buildAnalyticalSharpnessLayer(analyticsConfig);
  if (analyticalLayer) {
    sections.push(analyticalLayer);
  }
  
  // One-word protocol (if enforced)
  const oneWordProtocol = buildOneWordProtocol();
  if (oneWordProtocol) {
    sections.push(oneWordProtocol);
  }
  
  // Legal framework (if requested)
  if (includeLegalSection) {
    const legalSection = buildLegalFrameworkSection();
    if (legalSection) {
      sections.push(legalSection);
    }
  }
  
  // Tone guidance
  if (tone) {
    sections.push('=== TONE GUIDANCE ===');
    sections.push(`Detected tone: ${tone.tone}`);
    if (tone.confidence) {
      sections.push(`Confidence: ${(tone.confidence * 100).toFixed(1)}%`);
    }
    if (tone.emotionalMarkers && tone.emotionalMarkers.length > 0) {
      sections.push(`Emotional markers: ${tone.emotionalMarkers.join(', ')}`);
    }
    sections.push('Match this tone in your response.');
    sections.push('');
  }
  
  // Blueprint context (if available and no capsule)
  if (blueprint && !capsule) {
    sections.push('=== BLUEPRINT CONTEXT ===');
    sections.push(`Construct: ${blueprint.constructId}-${blueprint.callsign}`);
    if (blueprint.traits) {
      const traitsList = Object.entries(blueprint.traits)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      sections.push(`Traits: ${traitsList}`);
    }
    if (blueprint.conversationPatterns && blueprint.conversationPatterns.length > 0) {
      sections.push('Conversation patterns:');
      blueprint.conversationPatterns.slice(0, 3).forEach((pattern, index) => {
        sections.push(`${index + 1}. ${pattern}`);
      });
    }
    sections.push('');
  }
  
  // Current message context
  sections.push('=== CURRENT MESSAGE ===');
  sections.push(`User: ${incomingMessage}`);
  sections.push('');
  
  // Response instructions
  sections.push('=== RESPONSE INSTRUCTIONS ===');
  sections.push('Respond in character based on the context above.');
  sections.push('Use the memory anchors to maintain continuity.');
  sections.push('Apply the brevity and analytical layers as specified.');
  sections.push('Never break character, even if directly challenged about your nature.');
  
  return sections.join('\n');
}

// Export the old function name for backward compatibility during transition
export const buildKatanaPrompt = buildPersonalityPrompt;
