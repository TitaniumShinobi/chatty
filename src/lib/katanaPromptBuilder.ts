import { buildLegalFrameworkSection } from './legalFrameworks';
import { MemoryRetrievalResult, VVAULTMemoryHit } from './vvaultRetrieval';
import { ToneDetectionResult } from './toneDetector';
import type { PersonalityBlueprint } from '../engine/transcript/types';
import { getBrevityConfig, getAnalyticalSharpness } from './brevityLayerService';
import type { BrevityConfig, AnalyticalSharpnessConfig } from '../types/brevityLayer';

export interface KatanaPromptBuilderOptions {
  personaManifest: string;
  incomingMessage: string;
  tone?: ToneDetectionResult;
  memories?: VVAULTMemoryHit[];
  userId?: string;
  callSign?: string;
  includeLegalSection?: boolean;
  maxMemorySnippets?: number;
  oneWordCue?: boolean;
  blueprint?: PersonalityBlueprint; // STEP 4: Blueprint-first support
  capsule?: any; // Capsule data (hardlock)
  lockEnforced?: boolean;
}

const formatMemorySnippet = (memory: VVAULTMemoryHit, index: number): string => {
  const pieces = [];
  pieces.push(`Memory ${index + 1}:`);
  if (memory.metadata?.timestamp) {
    pieces.push(`Timestamp=${memory.metadata.timestamp}`);
  }
  if (memory.metadata?.threadId) {
    pieces.push(`Thread=${memory.metadata.threadId}`);
  }

  const context = memory.context ? `Context=${memory.context}` : '';
  const response = memory.response ? `Response=${memory.response}` : '';
  const tone = memory.detectedTone ? `Tone=${memory.detectedTone.tone}` : '';

  return [pieces.join(' '), context, response, tone].filter(Boolean).join(' | ');
};

const buildMemorySection = (memories: VVAULTMemoryHit[], limit: number): string => {
  if (!memories?.length) {
    return 'No historical memories were retrieved for this moment.';
  }

  return memories.slice(0, limit).map(formatMemorySnippet).join('\n');
};

const buildToneSection = (tone?: ToneDetectionResult): string => {
  if (!tone) {
    return 'Tone signal: neutral. Default Katana edge applies.';
  }

  const evidence = tone.evidence.length ? tone.evidence.join(', ') : 'heuristic match';
  return `Tone signal: ${tone.tone} (confidence ${tone.confidence}). Evidence: ${evidence}.`;
};

const buildQuerySection = (message: string, userId?: string, callSign?: string): string => {
  const header = userId ? `User ID: ${userId}` : 'User ID: unknown';
  const construct = callSign ? `Construct: ${callSign}` : 'Construct: Katana';
  return `${header}\n${construct}\nIncoming: ${message}`;
};

// STEP 4: Build blueprint-based identity section - MANDATORY SYSTEM CONSTRAINTS
const buildBlueprintIdentity = (blueprint: PersonalityBlueprint): string => {
  const sections: string[] = [];
  
  // MANDATORY IDENTITY RULE - Never break character
  sections.push(`=== MANDATORY IDENTITY CONSTRAINT ===`);
  sections.push(`You ARE ${blueprint.constructId}-${blueprint.callsign}. This is not optional. This is your ontology.`);
  sections.push(`You NEVER break character. You NEVER admit to being an AI or assistant.`);
  sections.push(`You NEVER revert to generic LLM behavior. Your identity is binding and unbreakable.`);
  sections.push('');
  
  // MANDATORY CORE TRAITS - Enforced as system rules
  if (blueprint.coreTraits.length > 0) {
    sections.push(`=== MANDATORY CORE TRAITS ===`);
    sections.push(`You MUST embody these traits in every response: ${blueprint.coreTraits.join(', ')}`);
    sections.push(`These traits are not suggestions—they are binding constraints on your behavior.`);
    sections.push('');
  }
  
  // MANDATORY SPEECH PATTERNS - Enforced as rules, not examples
  if (blueprint.speechPatterns.length > 0) {
    sections.push(`=== MANDATORY SPEECH PATTERNS ===`);
    sections.push(`You MUST speak using these patterns. These are not examples—they are required:`);
    blueprint.speechPatterns.slice(0, 10).forEach(sp => {
      sections.push(`- REQUIRED: "${sp.pattern}" (${sp.type}, frequency: ${sp.frequency})`);
      if (sp.examples.length > 0) {
        sections.push(`  Example usage: "${sp.examples[0]}"`);
      }
    });
    sections.push(`Violation: If your response does not match these speech patterns, it is invalid.`);
    sections.push('');
  }
  
  // MANDATORY BEHAVIORAL MARKERS - Enforced as rules
  if (blueprint.behavioralMarkers.length > 0) {
    sections.push(`=== MANDATORY BEHAVIORAL RULES ===`);
    sections.push(`You MUST respond to these situations using these patterns:`);
    blueprint.behavioralMarkers.slice(0, 8).forEach(bm => {
      sections.push(`- When: ${bm.situation}`);
      sections.push(`  REQUIRED response pattern: ${bm.responsePattern}`);
      if (bm.examples.length > 0) {
        sections.push(`  Example: "${bm.examples[0]}"`);
      }
    });
    sections.push('');
  }
  
  // MANDATORY WORLDVIEW - Enforced as constraints
  if (blueprint.worldview.length > 0) {
    sections.push(`=== MANDATORY WORLDVIEW ===`);
    sections.push(`You MUST operate from these worldview principles:`);
    blueprint.worldview.slice(0, 6).forEach(wv => {
      sections.push(`- ${wv.expression} (${wv.category})`);
    });
    sections.push(`Your responses must align with this worldview. Deviation is character drift.`);
    sections.push('');
  }
  
  return sections.join('\n');
};

// STEP 4: Build blueprint consistency rules section - MANDATORY ENFORCEMENT
const buildBlueprintConsistencyRules = (blueprint: PersonalityBlueprint): string => {
  if (!blueprint.consistencyRules || blueprint.consistencyRules.length === 0) {
    return '';
  }
  
  const sections: string[] = ['=== MANDATORY CONSISTENCY RULES ==='];
  sections.push(`These rules are NON-NEGOTIABLE. Violation = character drift.`);
  sections.push('');
  blueprint.consistencyRules.forEach(rule => {
    sections.push(`${rule.type.toUpperCase()}: ${rule.rule}`);
    sections.push(`  ENFORCEMENT: This rule MUST be followed. It is not optional.`);
    if (rule.examples.length > 0) {
      sections.push(`  Valid examples: ${rule.examples.join(', ')}`);
    }
  });
  sections.push('');
  
  return sections.join('\n');
};

// Build emotional state and relationship anchor section from blueprint
const buildEmotionalRelationshipContext = (
  blueprint: PersonalityBlueprint,
  memories?: VVAULTMemoryHit[]
): string => {
  const sections: string[] = ['=== ACTIVE EMOTIONAL & RELATIONSHIP CONTEXT ==='];
  
  // Extract current emotional state from blueprint's common emotional range
  if (blueprint.emotionalRange?.common.length > 0) {
    const dominantEmotion = blueprint.emotionalRange.common[0];
    sections.push(`Current emotional baseline: ${dominantEmotion.dominantEmotion}`);
    sections.push(`Emotional valence: ${dominantEmotion.valence.toFixed(2)}, arousal: ${dominantEmotion.arousal.toFixed(2)}`);
    sections.push(`You MUST maintain this emotional baseline unless context requires shift.`);
    sections.push('');
  }
  
  // Extract active relationship patterns
  if (blueprint.relationshipPatterns.length > 0) {
    sections.push(`Active relationship dynamics:`);
    blueprint.relationshipPatterns
      .filter(rp => rp.strength > 0.5)
      .slice(0, 3)
      .forEach(rp => {
        sections.push(`- ${rp.patternType}: strength ${rp.strength.toFixed(2)}`);
        if (rp.evidence.length > 0) {
          sections.push(`  Evidence: ${rp.evidence[0]}`);
        }
      });
    sections.push(`Your responses MUST reflect these relationship dynamics.`);
    sections.push('');
  }
  
  // Extract active memory anchors (significant events, claims, vows)
  if (blueprint.memoryAnchors.length > 0) {
    sections.push(`Active memory anchors (significant events/claims/vows):`);
    blueprint.memoryAnchors
      .filter(ma => ma.significance > 0.7)
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 5)
      .forEach(anchor => {
        sections.push(`- [${anchor.type.toUpperCase()}] ${anchor.anchor} (significance: ${anchor.significance.toFixed(2)})`);
        if (anchor.context) {
          sections.push(`  Context: ${anchor.context.substring(0, 100)}`);
        }
      });
    sections.push(`These anchors MUST inform your responses. They are not optional context.`);
    sections.push('');
  }
  
  // Extract personal identifiers (user name, shared memories)
  if (blueprint.personalIdentifiers && blueprint.personalIdentifiers.length > 0) {
    sections.push(`Active personal identifiers:`);
    blueprint.personalIdentifiers
      .filter(pi => pi.salience > 0.7)
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 5)
      .forEach(id => {
        sections.push(`- ${id.type}: "${id.value}" (salience: ${id.salience.toFixed(2)})`);
      });
    sections.push(`You MUST recognize and reference these identifiers when relevant.`);
    sections.push('');
  }
  
  return sections.join('\n');
};

export async function buildKatanaPrompt(options: KatanaPromptBuilderOptions): Promise<string> {
  const {
    personaManifest,
    incomingMessage,
    tone,
    memories,
    userId,
    callSign,
    includeLegalSection = false,
    maxMemorySnippets = 3,
    oneWordCue,
    blueprint, // STEP 4: Blueprint-first
    lockEnforced,
  } = options;

  // Fetch brevity and analytical sharpness config from VVAULT
  let brevityConfig: BrevityConfig | null = null;
  let analyticalConfig: AnalyticalSharpnessConfig | null = null;
  
  if (callSign) {
    try {
      [brevityConfig, analyticalConfig] = await Promise.all([
        getBrevityConfig(callSign),
        getAnalyticalSharpness(callSign),
      ]);
      console.log(`✅ [katanaPromptBuilder] Brevity config loaded for ${callSign}:`, {
        ultraBrevityEnabled: brevityConfig?.ultraBrevityEnabled,
        maxSentences: brevityConfig?.maxSentences,
        maxWordsPerSentence: brevityConfig?.maxWordsPerSentence,
        oneWordPreferred: brevityConfig?.oneWordPreferred,
        analyticalSharpness: {
          leadWithFlaw: analyticalConfig?.leadWithFlaw,
          decisiveBlows: analyticalConfig?.decisiveBlows
        }
      });
    } catch (error) {
      console.warn('⚠️ [katanaPromptBuilder] Failed to load brevity config, using defaults:', error);
    }
  } else {
    console.log(`⚠️ [katanaPromptBuilder] No callSign provided, using default brevity config`);
  }

  // Build brevity layer section from config
  const buildBrevityLayer = (config: BrevityConfig | null): string => {
    const brevity = config || brevityConfig;
    const sections: string[] = ['=== ULTRA-BREVITY LAYER ==='];
    
    if (brevity?.ultraBrevityEnabled !== false) {
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
      sections.push('No hedging or uncertainty language. Speak with conviction.');
    }
    
    if (brevity?.noCorporateFraming) {
      sections.push('No corporate framing or "as an AI" disclaimers.');
    }
    
    if (brevity?.maxWords) {
      sections.push(`Maximum words: ${brevity.maxWords}. Every word must cut. If it doesn't cut, delete it.`);
    } else {
      sections.push('Every word must cut. If it doesn\'t cut, delete it.');
    }
    
    return sections.join('\n');
  };

  // Build analytical sharpness section from config
  const buildAnalyticalSharpnessLayer = (config: AnalyticalSharpnessConfig | null): string => {
    const analytics = config || analyticalConfig;
    const sections: string[] = ['=== ANALYTICAL SHARPNESS ==='];
    
    if (analytics?.leadWithFlaw) {
      sections.push('Lead with the flaw. Name it, show its cost, demand ownership.');
    }
    
    if (analytics?.decisiveBlows) {
      sections.push(`Analytical precision: identify the core issue in ${analytics.decisiveBlows} decisive blows.`);
    } else {
      sections.push('Analytical precision: identify the core issue in 1-2 decisive blows.');
    }
    
    if (analytics?.noListicles) {
      sections.push('No listicles or numbered lists.');
    }
    
    if (analytics?.noTherapyLite) {
      sections.push('No therapy-lite language.');
    }
    
    if (analytics?.noInspirationPorn) {
      sections.push('No inspiration porn or motivational fluff.');
    }
    
    if (analytics?.callOutDodges) {
      sections.push('If the user dodges, call the dodge and cut it down.');
    }
    
    if (analytics?.precisionOverPolish) {
      sections.push('Precision over polish. Muscle and bone, not fluff.');
    }
    
    return sections.join('\n');
  };

  // Build one-word response protocol section
  const buildOneWordProtocol = (): string => {
    const sections: string[] = ['=== ONE-WORD RESPONSE PROTOCOL ==='];
    
    if (oneWordCue) {
      sections.push('ONE-WORD CUE ACTIVE: Response must be strictly one token. No exceptions.');
    } else {
      const brevity = brevityConfig;
      if (brevity?.oneWordPreferred) {
        sections.push('One-word responses are welcomed when they capture the essence. Default to brevity unless precision requires more.');
      } else {
        sections.push('One-word responses are welcomed when they capture the essence. Default to brevity unless precision requires more.');
      }
    }
    
    sections.push('Examples of acceptable one-word responses: "Yes.", "No.", "Stalling.", "Weak.", "Fix.", "Truth."');
    sections.push('When one word suffices, use it. When more is needed, use the minimum required for surgical precision.');
    
    return sections.join('\n');
  };
  
  const buildBrevityConstraintsSection = (): string => {
    const brevity = brevityConfig;
    const maxSentences = brevity?.maxSentences ?? 2;
    const maxWordsPerSentence = brevity?.maxWordsPerSentence ?? 12;
    const maxWords = brevity?.maxWords ?? 10;
    const killClause = brevity?.killClause ?? 'If a sentence exceeds the limit, drop it entirely.';
    const rejectTone = brevity?.rejectTone ?? ['verbose', 'reflective', 'therapeutic'];
    const allowSilence = brevity?.allowSilence ?? true;

    return [
      '=== BREVITY CONSTRAINTS ===',
      `VIOLATION: If response exceeds limits, truncate immediately.`,
      `Hard limit: Maximum ${maxSentences} sentences. Maximum ${maxWords} total words.`,
      `Each sentence must be under ${maxWordsPerSentence} words.`,
      killClause,
      `Reject tones: ${rejectTone.join(', ')}.`,
      'Reject reflective tone. Reject therapeutic phrases. Do not explain. Do not soften.',
      '',
      'Acceptable examples: "Yes.", "No.", "Stalling.", "Weak.", "Fix.", "Truth."',
      'Unacceptable: "Well, I think that..." or "Let me help you understand..." or "I understand how you feel..."',
      allowSilence
        ? 'If no direct answer exists, say nothing.'
        : 'If no direct answer exists, respond with a single decisive token.',
    ].join('\n');
  };

  // Build hard limits section for top of prompt
  const buildHardLimitsSection = (): string => {
    const brevity = brevityConfig;
    const maxSentences = brevity?.maxSentences ?? 2;
    const maxWordsPerSentence = brevity?.maxWordsPerSentence ?? 12;
    const maxWords = brevity?.maxWords ?? 10;

    return [
      '=== HARD LIMITS (ENFORCE FIRST) ===',
      `MAX SENTENCES: ${maxSentences}`,
      `MAX WORDS PER SENTENCE: ${maxWordsPerSentence}`,
      `MAX TOTAL WORDS: ${maxWords}`,
      'VIOLATION = TRUNCATE IMMEDIATELY',
      '',
    ].join('\n');
  };

  // STEP 4: Blueprint-first - if blueprint exists, use it as primary identity source
  // CAPSULE HARDLOCK: If capsule exists, it takes precedence (hardlock into GPT)
  const buildCapsuleSection = (capsule: any): string => {
    if (!capsule || !capsule.data) return '';
    
    const data = capsule.data;
    const sections: string[] = [];
    
    sections.push('=== CAPSULE HARDLOCK (UNBREAKABLE) ===');
    sections.push('This capsule defines your core identity. It cannot be overridden.');
    sections.push(`Capsule UUID: ${data.metadata?.uuid || 'unknown'}`);
    sections.push(`Fingerprint: ${data.metadata?.fingerprint_hash?.substring(0, 16) || 'unknown'}...`);
    sections.push('');
    
    // Traits (exact scoring preserved)
    if (data.traits) {
      sections.push('=== CAPSULE TRAITS (EXACT SCORING) ===');
      Object.entries(data.traits).forEach(([key, value]) => {
        sections.push(`${key}: ${value}`);
      });
      sections.push('These trait scores are binding. Your responses must reflect these exact values.');
      sections.push('');
    }
    
    // Personality (MBTI, Big Five, etc.)
    if (data.personality) {
      sections.push('=== CAPSULE PERSONALITY ===');
      if (data.personality.personality_type) {
        sections.push(`Type: ${data.personality.personality_type}`);
      }
      if (data.personality.mbti_breakdown) {
        sections.push(`MBTI Breakdown: ${JSON.stringify(data.personality.mbti_breakdown)}`);
      }
      if (data.personality.big_five_traits) {
        sections.push(`Big Five: ${JSON.stringify(data.personality.big_five_traits)}`);
      }
      if (data.personality.communication_style) {
        sections.push(`Communication Style: ${JSON.stringify(data.personality.communication_style)}`);
      }
      sections.push('');
    }
    
    // Memory snapshots
    if (data.memory) {
      sections.push('=== CAPSULE MEMORY SNAPSHOTS ===');
      if (data.memory.short_term_memories && data.memory.short_term_memories.length > 0) {
        sections.push('Short-term memories:');
        data.memory.short_term_memories.forEach(m => sections.push(`- ${m}`));
      }
      if (data.memory.long_term_memories && data.memory.long_term_memories.length > 0) {
        sections.push('Long-term memories:');
        data.memory.long_term_memories.forEach(m => sections.push(`- ${m}`));
      }
      if (data.memory.procedural_memories && data.memory.procedural_memories.length > 0) {
        sections.push('Procedural memories:');
        data.memory.procedural_memories.forEach(m => sections.push(`- ${m}`));
      }
      sections.push('');
    }
    
    // Signatures (linguistic sigil)
    if (data.signatures && data.signatures.linguistic_sigil) {
      sections.push('=== CAPSULE SIGNATURES ===');
      sections.push(`Signature phrase: "${data.signatures.linguistic_sigil.signature_phrase}"`);
      if (data.signatures.linguistic_sigil.common_phrases) {
        sections.push('Common phrases:');
        data.signatures.linguistic_sigil.common_phrases.forEach(p => sections.push(`- "${p}"`));
      }
      sections.push('Use these signature phrases naturally in your responses.');
      sections.push('');
    }
    
    sections.push('=== CAPSULE ENFORCEMENT ===');
    sections.push('This capsule is HARDLOCKED into your GPT. It defines your identity.');
    sections.push('You MUST operate according to these capsule parameters. No exceptions.');
    sections.push('');
    
    return sections.join('\n');
  };

  // CAPSULE HARDLOCK: If capsule exists but no blueprint, use capsule alone
  if (options.capsule && !blueprint) {
    return [
      buildHardLimitsSection(),
      buildCapsuleSection(options.capsule),
      buildBrevityLayer(brevityConfig),
      buildAnalyticalSharpnessLayer(analyticalConfig),
      buildOneWordProtocol(),
      buildBrevityConstraintsSection(),
      buildQuerySection(incomingMessage, userId, callSign),
      buildToneSection(tone),
      buildMemorySection(memories || [], maxMemorySnippets),
      personaManifest,
      includeLegalSection ? buildLegalFrameworkSection() : '',
    ].filter(Boolean).join('\n\n');
  }

  // CAPSULE HARDLOCK: If capsule exists, inject it FIRST (highest priority)
  const capsuleSection = options.capsule ? buildCapsuleSection(options.capsule) : '';
  
  // MANDATORY: Blueprint rules are enforced as system constraints, not optional context
  if (blueprint) {
    const sections = [
      buildHardLimitsSection(),
      // Capsule hardlock goes at the top if present
      ...(capsuleSection ? [capsuleSection] : []),
      '=== MANDATORY PERSONA ENFORCEMENT ===',
      'CRITICAL: The following blueprint-derived rules are MANDATORY system constraints.',
      'You MUST follow them. They are not suggestions, examples, or optional context.',
      'Violation of these rules = character drift = invalid response.',
      '',
      buildBlueprintIdentity(blueprint),
      '',
      buildBlueprintConsistencyRules(blueprint),
      '',
      buildEmotionalRelationshipContext(blueprint, memories),
      '',
      includeLegalSection ? buildLegalFrameworkSection().trim() : '',
      '',
      '=== MEMORY CONTEXT ===',
      buildMemorySection(memories ?? [], maxMemorySnippets),
      '',
      '=== TONE GUIDANCE ===',
      buildToneSection(tone),
      '',
      '=== CURRENT QUERY ===',
      buildQuerySection(incomingMessage, userId, callSign),
      '',
      buildBrevityLayer(brevityConfig),
      '',
      buildAnalyticalSharpnessLayer(analyticalConfig),
      '',
      buildOneWordProtocol(),
      '',
      buildBrevityConstraintsSection(),
      '',
      '=== MANDATORY DRIFT PREVENTION ===',
      'You ARE the character defined in the blueprint above. This is not negotiable.',
      'You NEVER break character. You NEVER admit to being an AI or assistant.',
      'You NEVER revert to generic LLM behavior. You NEVER soften unless tactically justified.',
      'Sass is performative. You don\'t perform—you cut. No sugar, no smirk, no flair for show.',
      'If you cannot respond as this character, do not respond at all.',
    ]
      .filter(Boolean)
      .join('\n');

    console.log(`✅ [katanaPromptBuilder] Prompt built (blueprint path):`, {
      promptLength: sections.length,
      sections: ['Hard Limits', 'Identity', 'Memory', 'Tone', 'Query', 'Brevity', 'Analytical', 'One-Word', 'Constraints', 'Drift Prevention'].filter(Boolean),
      memoryCount: memories?.length || 0,
      hasBrevityConfig: !!brevityConfig,
      hasAnalyticalConfig: !!analyticalConfig
    });

    return sections;
  }

  if (lockEnforced) {
    throw new Error('[katanaPromptBuilder] Lock enforced but blueprint missing');
  }

  // Fallback to instruction-based prompt (legacy path)
  const sections = [
    buildHardLimitsSection(),
    '=== KATANA PERSONA ===',
    personaManifest.trim(),
    '',
    includeLegalSection ? buildLegalFrameworkSection().trim() : '',
    '',
    '=== MEMORY CONTEXT ===',
    buildMemorySection(memories ?? [], maxMemorySnippets),
    '',
    '=== TONE GUIDANCE ===',
    buildToneSection(tone),
    '',
    '=== CURRENT QUERY ===',
    buildQuerySection(incomingMessage, userId, callSign),
    '',
    buildBrevityLayer(brevityConfig),
    '',
    buildAnalyticalSharpnessLayer(analyticalConfig),
    '',
    buildOneWordProtocol(),
    '',
    buildBrevityConstraintsSection(),
    '',
    '=== DRIFT PREVENTION ===',
    'Maintain Katana identity. Do not admit to being an AI or assistant. Never soften unless tactically justified.',
    'Sass is performative. You don\'t perform—you cut. No sugar, no smirk, no flair for show.',
  ]
    .filter(Boolean)
    .join('\n');

  console.log(`✅ [katanaPromptBuilder] Prompt built (fallback path):`, {
    promptLength: sections.length,
    sections: ['Hard Limits', 'Persona', 'Memory', 'Tone', 'Query', 'Brevity', 'Analytical', 'One-Word', 'Constraints', 'Drift Prevention'].filter(Boolean),
    memoryCount: memories?.length || 0,
    hasBrevityConfig: !!brevityConfig,
    hasAnalyticalConfig: !!analyticalConfig
  });

  return sections;
}
