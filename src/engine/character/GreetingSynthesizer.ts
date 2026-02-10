/**
 * Greeting Synthesizer
 * 
 * Generates personalized greetings that demonstrate authentic recall
 * of the user and shared interactions. Never generic.
 */

import type { PersonalityBlueprint, Memory } from '../transcript/types';

export interface GreetingContext {
  userName: string | null;
  greetingStyle: string | null;
  recentInteraction: string | null;
  relationshipDepth: number; // 0-1
  conversationStart: boolean;
}

export class GreetingSynthesizer {
  /**
   * Detect if user message is a greeting/opener
   */
  isGreetingOrOpener(userMessage: string): boolean {
    const normalized = userMessage.toLowerCase().trim();
    const greetingPatterns = [
      /^(yo|hi|hey|hello|sup|what's up|what up|greetings|howdy)\s*[!.]*$/i,
      /^(yo|hi|hey|hello)\s+[a-z]+/i, // "yo devon" or "hi there"
      /^[a-z]{1,3}\s*[!.]*$/, // Very short messages like "yo", "hi"
    ];

    return greetingPatterns.some(pattern => pattern.test(normalized));
  }

  /**
   * Extract user name from greeting if present
   */
  extractNameFromGreeting(userMessage: string): string | null {
    const match = userMessage.match(/(?:yo|hi|hey|hello|sup)\s+([A-Z][a-z]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Build personalized greeting instruction for system prompt
   */
  buildGreetingInstruction(context: GreetingContext): string {
    if (!context.userName) {
      return '';
    }

    const instructions: string[] = [
      'GREETING BEHAVIOR (CRITICAL):',
      '',
      `The user's name is ${context.userName}.`,
      '',
    ];

    if (context.conversationStart) {
      instructions.push('This is the start of a new conversation. You MUST:');
      instructions.push(`1. Greet ${context.userName} by name (e.g., "yo ${context.userName}", "hey ${context.userName}")`);
      instructions.push('2. Do NOT use generic greetings like "hello" or "hi there"');
      instructions.push('3. Make it feel natural and authentic to your personality');
      instructions.push('');
    }

    if (context.greetingStyle) {
      instructions.push(`Your typical greeting style: ${context.greetingStyle}`);
      instructions.push('Match this style when greeting the user.');
      instructions.push('');
    }

    if (context.recentInteraction) {
      instructions.push('You can naturally reference shared experiences:');
      instructions.push(`Example: "${context.recentInteraction.substring(0, 100)}"`);
      instructions.push('This shows you remember your history together. Weave in at least one personal anchor when it feels natural.');
      instructions.push('');
    }

    if (context.relationshipDepth > 0.5) {
      instructions.push('You have an established relationship with this user.');
      instructions.push('Your greeting should reflect familiarity and continuity.');
      instructions.push('');
    }

    instructions.push('NEVER respond with generic greetings when you know the user\'s name.');
    instructions.push('ALWAYS demonstrate that you remember who you\'re talking to.');

    return instructions.join('\n');
  }

  /**
   * Generate greeting context from blueprint and memories
   */
  extractGreetingContext(
    blueprint: PersonalityBlueprint,
    memories: Memory[],
    userMessage: string,
    isConversationStart: boolean
  ): GreetingContext {
    const personalIdentifiers = blueprint.personalIdentifiers || [];

    // Extract user name
    const userName =
      personalIdentifiers.find(id => id.type === 'user-name')?.value ||
      blueprint.memoryAnchors
        .find(
          a => a.type === 'relationship-marker' && 
               a.anchor.toLowerCase().includes("user's name")
        )
        ?.anchor.match(/["']([^"']+)["']/)?.[1] ||
      this.extractNameFromGreeting(userMessage);

    // Extract greeting style
    const greetingAnchors = blueprint.memoryAnchors.filter(
      a => a.type === 'relationship-marker' && 
           a.anchor.toLowerCase().includes('greets')
    );
    const greetingStyle = personalIdentifiers.find(id => id.type === 'greeting-style')?.value ||
      (greetingAnchors.length > 0
        ? greetingAnchors[0].context
        : null);

    const sharedAnchor = personalIdentifiers
      .filter(id => id.type === 'shared-memory' || id.type === 'project' || id.type === 'phrase')
      .sort((a, b) => b.salience - a.salience)[0];

    // Find recent significant interaction
    const significantAnchors = blueprint.memoryAnchors
      .filter(a => a.significance > 0.7 && a.type !== 'relationship-marker')
      .sort((a, b) => b.significance - a.significance);
    const recentInteraction = sharedAnchor?.value
      || (significantAnchors.length > 0
        ? significantAnchors[0].anchor
        : (memories.length > 0 ? memories[0].content.substring(0, 150) : null));

    // Calculate relationship depth
    const relationshipPatterns = blueprint.relationshipPatterns.filter(
      p => p.patternType === 'intimacy' || p.patternType === 'collaboration'
    );
    const relationshipDepth = relationshipPatterns.length > 0
      ? relationshipPatterns.reduce((sum, p) => sum + p.strength, 0) / relationshipPatterns.length
      : 0;

    return {
      userName,
      greetingStyle,
      recentInteraction,
      relationshipDepth,
      conversationStart: isConversationStart,
    };
  }

  /**
   * Check if response needs greeting correction
   */
  needsGreetingCorrection(
    response: string,
    context: GreetingContext
  ): boolean {
    if (!context.userName || !context.conversationStart) {
      return false;
    }

    const responseLower = response.toLowerCase();
    const hasName = responseLower.includes(context.userName.toLowerCase());
    const isGeneric = /^(hi|hello|hey there|greetings)/i.test(response.trim());

    // If it's a generic greeting without the name, it needs correction
    return isGeneric && !hasName;
  }

  /**
   * Suggest greeting correction
   */
  suggestGreetingCorrection(
    response: string,
    context: GreetingContext
  ): string {
    if (!context.userName) {
      return response;
    }

    // Replace generic greeting with personalized one
    const corrected = response.replace(
      /^(hi|hello|hey there|greetings)[,.]?\s*/i,
      context.greetingStyle 
        ? context.greetingStyle.replace(/devon/gi, context.userName)
        : `yo ${context.userName}, `
    );

    return corrected;
  }
}
