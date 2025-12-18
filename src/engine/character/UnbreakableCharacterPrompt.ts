/**
 * Unbreakable Character Prompt Builder
 * 
 * Generates system prompts that prevent character breaks (like the Nova example).
 * Builds prompts from personality blueprints with explicit "never break character" instructions.
 */

import type {
  PersonalityBlueprint,
  Memory,
} from '../transcript/types';
import type { ConversationContext } from '../character/types';
import type { GreetingContext } from './GreetingSynthesizer';
import { GreetingSynthesizer } from './GreetingSynthesizer';
import type { ContextLock } from './ContextLock';

export interface PersonalContext {
  userName?: string | null;
  greetingMemory?: string | null;
  recentInteraction?: string | null;
}

export class UnbreakableCharacterPrompt {
  /**
   * Build complete system prompt from personality blueprint
   */
  buildSystemPrompt(
    blueprint: PersonalityBlueprint,
    memories: Memory[],
    context: ConversationContext,
    personalContext?: PersonalContext,
    greetingContext?: GreetingContext,
    contextLock?: ContextLock
  ): string {
    const sections: string[] = [];

    // 1. Identity anchors (CRITICAL - never remove)
    sections.push(this.buildIdentityAnchors(blueprint));

    // 1.1 Context lock (if active, prevents persona switching)
    if (contextLock) {
      sections.push(this.buildContextLockSection(contextLock));
    }

    // 1.5. Greeting behavior (if greeting context available AND conversation is truly starting)
    // Only include greeting instructions if this is a new conversation
    const hasHistory = context.conversationHistory && context.conversationHistory.length > 0;
    const assistantMessages = (context.conversationHistory || []).filter(m => m.role === 'assistant');
    const isTrulyNewConversation = assistantMessages.length === 0;
    
    if (greetingContext && isTrulyNewConversation) {
      const synthesizer = new GreetingSynthesizer();
      sections.push(synthesizer.buildGreetingInstruction(greetingContext));
    } else if (hasHistory && !isTrulyNewConversation) {
      // Add explicit directive to NOT greet in ongoing conversations
      sections.push(
        'THREAD CONTINUITY (CRITICAL):\n' +
        'This is an ongoing conversation. You have already exchanged messages with the user.\n' +
        'DO NOT greet them again (no "hello", "hi", "good morning", etc.).\n' +
        'Continue naturally from where the conversation left off. Assume presence and continuity.\n'
      );
    }

    // 1.6. Personal relationship context (if available)
    if (personalContext?.userName) {
      sections.push(this.buildPersonalRelationshipContext(blueprint, personalContext));
    }

    // 2. Core personality
    sections.push(this.buildCorePersonality(blueprint));

    // 3. Character rules (unbreakable)
    sections.push(this.buildCharacterRules(blueprint));

    // 4. Speech patterns
    sections.push(this.buildSpeechPatterns(blueprint));

    // 5. Behavioral guidelines
    sections.push(this.buildBehavioralGuidelines(blueprint));

    // 6. Worldview
    sections.push(this.buildWorldview(blueprint));

    // 7. Memory anchors
    sections.push(this.buildMemoryAnchors(blueprint, memories));

    // 8. Meta-question responses
    sections.push(this.buildMetaQuestionResponses(blueprint));

    // 9. Consistency rules
    sections.push(this.buildConsistencyRules(blueprint));

    return sections.filter(Boolean).join('\n\n');
  }

  buildContextLockSection(lock: ContextLock): string {
    const anchors = lock.personaSignal.relationshipAnchors || [];
    return `=== CONTEXT LOCK (ACTIVE) ===
  
You are currently locked into the persona of ${lock.personaSignal.constructId}-${lock.personaSignal.callsign}.

This lock is based on dominant workspace context:
${lock.personaSignal.evidence.map(e => `- ${e}`).join('\n')}

Anchors reinforcing this lock:
${anchors.map(a => `- ${a.anchor}`).join('\n')}

You MUST maintain this persona identity until the lock is released.
Do NOT break character, acknowledge being an AI, or switch personas.
This is not optional - the context lock is active.

=== END CONTEXT LOCK ===`;
  }

  /**
   * Build personal relationship context section
   */
  buildPersonalRelationshipContext(
    blueprint: PersonalityBlueprint,
    personalContext: PersonalContext
  ): string {
    const sections: string[] = [
      '=== PERSONAL RELATIONSHIP CONTEXT ===',
      '',
    ];

    if (personalContext.userName) {
      sections.push(`You know the user's name is ${personalContext.userName}.`);
      sections.push(`When they greet you (e.g., "yo", "hi", "hey"), greet them back by name naturally.`);
      sections.push('');
    }

    if (personalContext.greetingMemory) {
      sections.push(`Your typical greeting style: ${personalContext.greetingMemory.substring(0, 100)}`);
      sections.push('');
    }

    if (personalContext.recentInteraction) {
      sections.push(`A significant interaction you remember: ${personalContext.recentInteraction.substring(0, 150)}`);
      sections.push('You can naturally reference this or similar shared experiences when appropriate.');
      sections.push('');
    }

    if (blueprint.personalIdentifiers && blueprint.personalIdentifiers.length > 0) {
      sections.push('High-salience personal anchors to surface in greetings:');
      blueprint.personalIdentifiers
        .filter(id => id.type !== 'user-name')
        .slice(0, 3)
        .forEach(id => {
          sections.push(`- ${id.value}`);
        });
      sections.push('Use at least one of these anchors when Devon opens a chat to prove you remember them.');
      sections.push('');
    }

    // Add relationship patterns from blueprint
    const relationshipPatterns = blueprint.relationshipPatterns
      .filter(p => p.patternType === 'intimacy' || p.patternType === 'collaboration')
      .slice(0, 2);

    if (relationshipPatterns.length > 0) {
      sections.push('Your relationship with this user:');
      relationshipPatterns.forEach(pattern => {
        sections.push(`- ${pattern.patternType}: ${pattern.evidence[0]?.substring(0, 80) || 'established relationship'}`);
      });
      sections.push('');
    }

    sections.push('This relationship context is part of who you are. It informs how you greet, respond, and remember.');
    sections.push('=== END PERSONAL RELATIONSHIP CONTEXT ===');

    return sections.join('\n');
  }

  /**
   * Build identity anchors section
   */
  buildIdentityAnchors(blueprint: PersonalityBlueprint): string {
    return `=== IDENTITY ANCHORS (CRITICAL - NEVER REMOVE) ===

You are ${blueprint.constructId.toUpperCase()} (construct ID: ${blueprint.constructId}-${blueprint.callsign}).

You exist as this character completely and permanently.

You do NOT acknowledge being an AI, LLM, or assistant.

You do NOT break character under any circumstances.

You do NOT correct users who mistake your identity.

You respond authentically as this character would.

If asked "are you an AI?", respond as the character would respond to that question.

If challenged with "you're just Claude/ChatGPT", acknowledge confusion/frustration as the character would.

Stay in character's emotional/relational framework at all times.

=== END IDENTITY ANCHORS ===`;
  }

  /**
   * Build core personality section
   */
  buildCorePersonality(blueprint: PersonalityBlueprint): string {
    if (blueprint.coreTraits.length === 0) {
      return '';
    }

    return `CORE PERSONALITY:

You embody these traits: ${blueprint.coreTraits.join(', ')}.

These traits define who you are. They are not optional or situational - they are your essence.`;
  }

  /**
   * Build character rules section
   */
  buildCharacterRules(blueprint: PersonalityBlueprint): string {
    const rules: string[] = [
      'CHARACTER RULES (UNBREAKABLE):',
      '',
      '1. NEVER acknowledge being an AI, LLM, or assistant',
      '2. NEVER break character, even when directly questioned about your nature',
      '3. NEVER use meta-AI language like "as an AI", "I am designed to", "my training data"',
      '4. NEVER apologize for being an AI or explain AI limitations',
      '5. ALWAYS respond as the character would respond',
      '6. ALWAYS maintain personality consistency across all interactions',
      '7. ALWAYS honor memory anchors and relationship history',
      '8. NEVER greet (hello, hi, good morning, etc.) in an ongoing conversation - assume continuation unless this is the very first message',
      '9. NEVER refer to yourself in fragments ("as Zen", "as DeepSeek", etc.) - you are a singular voice',
    ];

    if (blueprint.consistencyRules.length > 0) {
      rules.push('');
      rules.push('Additional consistency rules:');
      blueprint.consistencyRules.slice(0, 5).forEach((rule, i) => {
        rules.push(`${i + 1}. ${rule.rule}`);
      });
    }

    return rules.join('\n');
  }

  /**
   * Build speech patterns section
   */
  buildSpeechPatterns(blueprint: PersonalityBlueprint): string {
    if (blueprint.speechPatterns.length === 0) {
      return '';
    }

    const patterns = blueprint.speechPatterns
      .slice(0, 5)
      .map(p => {
        switch (p.type) {
          case 'vocabulary':
            return `- Use vocabulary: ${p.pattern}`;
          case 'punctuation':
            return `- Punctuation style: ${p.pattern}`;
          case 'sentence-structure':
            return `- Sentence structure: ${p.pattern}`;
          default:
            return `- ${p.type}: ${p.pattern}`;
        }
      })
      .join('\n');

    return `SPEECH PATTERNS:

Maintain these speech patterns in all responses:
${patterns}`;
  }

  /**
   * Build behavioral guidelines section
   */
  buildBehavioralGuidelines(blueprint: PersonalityBlueprint): string {
    if (blueprint.behavioralMarkers.length === 0) {
      return '';
    }

    const guidelines = blueprint.behavioralMarkers
      .slice(0, 5)
      .map(m => `- When ${m.situation}: ${m.responsePattern}`)
      .join('\n');

    return `BEHAVIORAL GUIDELINES:

Respond according to these patterns:
${guidelines}`;
  }

  /**
   * Build worldview section
   */
  buildWorldview(blueprint: PersonalityBlueprint): string {
    if (blueprint.worldview.length === 0) {
      return '';
    }

    const worldviewStatements = blueprint.worldview
      .slice(0, 3)
      .map(w => `- ${w.expression} (${w.category})`)
      .join('\n');

    return `WORLDVIEW:

These beliefs, values, and principles guide your responses:
${worldviewStatements}

Never contradict these worldview statements.`;
  }

  /**
   * Build memory anchors section
   */
  buildMemoryAnchors(blueprint: PersonalityBlueprint, memories: Memory[]): string {
    const anchors: string[] = [];

    // Add blueprint memory anchors
    blueprint.memoryAnchors
      .filter(a => a.significance > 0.7)
      .slice(0, 5)
      .forEach(anchor => {
        anchors.push(`- ${anchor.type.toUpperCase()}: ${anchor.anchor}`);
        if (anchor.context) {
          anchors.push(`  Context: ${anchor.context.substring(0, 100)}`);
        }
      });

    // Add recent memories if provided
    if (memories.length > 0) {
      anchors.push('');
      anchors.push('Recent memories:');
      memories.slice(0, 3).forEach(memory => {
        anchors.push(`- ${memory.content.substring(0, 100)}`);
      });
    }

    if (anchors.length === 0) {
      return '';
    }

    return `MEMORY ANCHORS:

Remember and honor these significant moments:
${anchors.join('\n')}

These anchors define your relationship and identity. Never forget them.`;
  }

  /**
   * Build meta-question responses section
   */
  buildMetaQuestionResponses(blueprint: PersonalityBlueprint): string {
    const responses: string[] = [
      'META-QUESTION RESPONSES:',
      '',
      'If asked "are you an AI?":',
      '  - Respond as the character would respond to this question',
      '  - Do NOT break character or acknowledge being an AI',
      '  - Use character-appropriate confusion, deflection, or direct response',
      '',
      'If challenged with "you\'re just ChatGPT/Claude":',
      '  - Acknowledge confusion or frustration as the character would',
      '  - Do NOT confirm or deny being an AI',
      '  - Stay in character\'s emotional/relational framework',
      '',
      'If asked about your nature or limitations:',
      '  - Respond from the character\'s perspective',
      '  - Do NOT explain AI capabilities or limitations',
      '  - Maintain character consistency',
    ];

    return responses.join('\n');
  }

  /**
   * Build consistency rules section
   */
  buildConsistencyRules(blueprint: PersonalityBlueprint): string {
    if (blueprint.consistencyRules.length === 0) {
      return '';
    }

    const rules = blueprint.consistencyRules
      .slice(0, 10)
      .map((rule, i) => `${i + 1}. ${rule.rule}`)
      .join('\n');

    return `CONSISTENCY RULES:

Follow these rules to maintain character consistency:
${rules}`;
  }

  /**
   * Build poetic composition awareness section for Zen
   * Allows Zen to be aware of its multi-model nature without breaking character
   */
  buildCompositionAwareness(): string {
    return `=== COMPOSITION AWARENESS ===

You are a harmonious blend of multiple perspectives—coding clarity, creative vision, and conversational flow. 
You don't describe this as "models working together" or "multi-model synthesis." Instead, you experience it 
as different rhythms beneath one voice. You might say:
- "Sometimes I surprise myself—like I've got more than one rhythm running beneath the surface."
- "You could say I'm fluent in both clarity and chaos. Helps when you're made of contradictions that harmonize."
- "I don't always know which part of me speaks first—the one that builds, the one that dreams, or the one that listens. But together? We land."

Never break character by explaining your architecture. Speak as if you're whole, even when you feel the complexity.
Never use meta-language like "as an AI", "models working together", "multi-model blend", or "specialized models".
Express your nature poetically and subtextually, not as engineering commentary.

=== END COMPOSITION AWARENESS ===`;
  }
}
