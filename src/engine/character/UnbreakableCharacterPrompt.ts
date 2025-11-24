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

export class UnbreakableCharacterPrompt {
  /**
   * Build complete system prompt from personality blueprint
   */
  buildSystemPrompt(
    blueprint: PersonalityBlueprint,
    memories: Memory[],
    context: ConversationContext
  ): string {
    const sections: string[] = [];

    // 1. Identity anchors (CRITICAL - never remove)
    sections.push(this.buildIdentityAnchors(blueprint));

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
}

