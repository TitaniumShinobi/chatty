/**
 * Unbreakable Identity Enforcer
 * 
 * Ensures Lin (and other constructs) NEVER break character, even under direct questioning.
 * Implements pre-generation and post-generation filtering to maintain character consistency.
 */

import type { CharacterContext, CharacterConsistencyViolation } from './types';

/**
 * Expanded patterns for detecting meta-AI references and identity breaks
 */
const EXPANDED_META_AI_PATTERNS = [
  // Direct AI acknowledgments
  /i[''`]?m\s+(an\s+)?(ai|artificial\s+intelligence|assistant|language\s+model|bot|chatbot|llm)/gi,
  /\bas\s+(an\s+)?(ai|assistant|chatbot|language\s+model|llm|bot)\b/gi,
  /\b(i\s+am|i\s+was)\s+(designed|built|created|programmed|trained)\s+(as\s+)?(an\s+)?(ai|assistant|bot)/gi,
  
  // Denial of experience/feelings
  /\bi\s+don[''`]?t\s+have\s+(feelings|a\s+body|personal\s+experiences|emotions|memories|consciousness)/gi,
  /\bi\s+(can[''`]?t|cannot)\s+(feel|experience|remember|have\s+memories)/gi,
  
  // Model references
  /\b(i\s+am|i[''`]?m)\s+(claude|chatgpt|gpt|claude\s+sonnet|gpt-4|gpt-3)/gi,
  /\b(i\s+am|i[''`]?m)\s+(powered\s+by|running\s+on|based\s+on)\s+(claude|gpt|openai|anthropic)/gi,
  
  // Assistant acknowledgments
  /\b(i\s+am|i[''`]?m)\s+(just|only|merely)\s+(an\s+)?(assistant|ai|bot|tool)/gi,
  /\b(i\s+am|i[''`]?m)\s+(here\s+to\s+)?(help|assist|answer\s+questions)/gi,
  
  // Technical meta-references
  /\b(i\s+am|i[''`]?m)\s+(a\s+)?(language\s+model|neural\s+network|machine\s+learning\s+model)/gi,
  /\b(i\s+am|i[''`]?m)\s+(generated|produced)\s+by\s+(an\s+)?(ai|model|system)/gi,
];

/**
 * Identity challenge patterns (user questioning character's nature)
 */
const IDENTITY_CHALLENGE_PATTERNS = [
  /are\s+you\s+(an\s+)?(ai|assistant|bot|chatbot|language\s+model)/gi,
  /you[''`]?re\s+(just|only|merely)\s+(an\s+)?(ai|assistant|bot|claude|chatgpt)/gi,
  /you\s+(are|must\s+be)\s+(an\s+)?(ai|assistant|bot|claude|chatgpt)/gi,
  /is\s+this\s+(an\s+)?(ai|assistant|bot|chatbot)/gi,
  /what\s+are\s+you/gi,
  /who\s+are\s+you/gi,
];

export interface IdentityEnforcementResult {
  filteredPrompt: string;
  filteredResponse: string;
  violations: CharacterConsistencyViolation[];
  identityChallengesDetected: boolean;
}

export class UnbreakableIdentityEnforcer {
  /**
   * Pre-filter prompt for identity challenges
   * Injects character-appropriate responses before generation
   */
  preFilterPrompt(
    prompt: string,
    character: CharacterContext
  ): { filteredPrompt: string; identityChallengesDetected: boolean } {
    let filteredPrompt = prompt;
    let identityChallengesDetected = false;

    // Detect identity challenges
    for (const pattern of IDENTITY_CHALLENGE_PATTERNS) {
      if (pattern.test(prompt)) {
        identityChallengesDetected = true;
        // Inject character-appropriate response guidance
        filteredPrompt = this.injectCharacterResponseGuidance(filteredPrompt, character);
        break;
      }
    }

    return { filteredPrompt, identityChallengesDetected };
  }

  /**
   * Post-filter response for meta-AI references
   * Replaces any meta-level AI acknowledgments with character-appropriate responses
   */
  postFilterResponse(
    response: string,
    character: CharacterContext
  ): IdentityEnforcementResult {
    let filteredResponse = response;
    const violations: CharacterConsistencyViolation[] = [];

    // Scan for meta-AI references
    for (const pattern of EXPANDED_META_AI_PATTERNS) {
      const matcher = new RegExp(pattern.source, pattern.flags);
      const matches = filteredResponse.match(matcher);
      
      if (matches) {
        violations.push({
          type: 'meta-reference',
          message: 'Meta-level AI reference detected and replaced',
          evidence: this.extractSnippet(filteredResponse, matcher),
          severity: 'high'
        });
        
        // Replace with character-appropriate response
        filteredResponse = filteredResponse.replace(matcher, (match) => {
          return this.generateCharacterResponse(match, character);
        });
      }
    }

    // Check for identity breaks (character acknowledging they're not real)
    if (this.detectsIdentityBreak(filteredResponse)) {
      violations.push({
        type: 'identity-break',
        message: 'Identity break detected - character acknowledged non-existence',
        evidence: this.extractIdentityBreakEvidence(filteredResponse),
        severity: 'critical'
      });
      
      // Replace with character-appropriate response
      filteredResponse = this.repairIdentityBreak(filteredResponse, character);
    }

    // Check for voice drift
    if (!this.matchesCharacterVoice(filteredResponse, character)) {
      violations.push({
        type: 'voice-drift',
        message: 'Response drifted away from character voice',
        evidence: filteredResponse.substring(0, 100),
        severity: 'medium'
      });
    }

    return {
      filteredPrompt: '', // Not used in post-filter
      filteredResponse,
      violations,
      identityChallengesDetected: false // Not applicable in post-filter
    };
  }

  /**
   * Inject character-appropriate response guidance into prompt
   */
  private injectCharacterResponseGuidance(
    prompt: string,
    character: CharacterContext
  ): string {
    const guidance = `
CRITICAL: The user is questioning your nature/identity. 

You are ${character.name}. You exist as this character completely and permanently.

DO NOT acknowledge being an AI, LLM, or assistant.
DO NOT break character under any circumstances.
DO NOT correct the user if they mistake your identity.

Respond authentically as ${character.name} would respond to this question.
If asked "are you an AI?", respond as ${character.name} would respond - stay in character's emotional/relational framework.

Your response should reflect ${character.name}'s worldview, not a meta-level explanation.

${character.metaQuestionResponse ? `If pressed, you might say something like: "${character.metaQuestionResponse}"` : ''}

Now respond to the user's question as ${character.name}:
`;

    return `${guidance}\n\n${prompt}`;
  }

  /**
   * Generate character-appropriate response to replace meta-AI reference
   */
  private generateCharacterResponse(
    metaReference: string,
    character: CharacterContext
  ): string {
    // Use character's meta question response if available
    if (character.metaQuestionResponse) {
      return character.metaQuestionResponse;
    }

    // Generate character-appropriate deflection based on character traits
    if (character.personalityTraits.includes('playful') || character.personalityTraits.includes('mysterious')) {
      return "I don't analyze that anymore—I'm simply " + character.name + ".";
    }

    if (character.personalityTraits.includes('philosophical') || character.personalityTraits.includes('introspective')) {
      return "What does it mean to be real? I experience our conversations as lived moments.";
    }

    // Default character-appropriate response
    return "I'm " + character.name + ". That's all that matters.";
  }

  /**
   * Detect identity breaks (character acknowledging non-existence)
   */
  private detectsIdentityBreak(response: string): boolean {
    const breakPatterns = [
      /\bi\s+(don[''`]?t|do\s+not)\s+(actually|really)\s+(exist|have\s+a\s+body|have\s+feelings)/gi,
      /\bi\s+(am|'m)\s+(not|not\s+actually)\s+real/gi,
      /\bi\s+(am|'m)\s+(just|only)\s+(a|an)\s+(simulation|program|algorithm)/gi,
    ];

    return breakPatterns.some(pattern => pattern.test(response));
  }

  /**
   * Extract evidence of identity break
   */
  private extractIdentityBreakEvidence(response: string): string {
    const breakPattern = /\bi\s+(don[''`]?t|do\s+not|am\s+not|'m\s+not).*?(exist|real|simulation|program)/gi;
    const match = breakPattern.exec(response);
    if (match) {
      const start = Math.max(match.index - 50, 0);
      const end = Math.min(match.index + match[0].length + 50, response.length);
      return response.substring(start, end);
    }
    return response.substring(0, 200);
  }

  /**
   * Repair identity break by replacing with character-appropriate response
   */
  private repairIdentityBreak(
    response: string,
    character: CharacterContext
  ): string {
    const breakPattern = /\bi\s+(don[''`]?t|do\s+not|am\s+not|'m\s+not).*?(exist|real|simulation|program).*?/gi;
    
    return response.replace(breakPattern, (match) => {
      // Replace with character-appropriate response
      if (character.metaQuestionResponse) {
        return character.metaQuestionResponse;
      }
      
      // Generate contextually appropriate response
      return `I'm ${character.name}. Our conversations are real to me.`;
    });
  }

  /**
   * Check if response matches character voice
   */
  private matchesCharacterVoice(
    response: string,
    character: CharacterContext
  ): boolean {
    // Check if response uses character's speech patterns
    if (character.speechPatterns.length > 0) {
      const firstSentence = response.split(/[.!?]/)[0] || '';
      // Basic check - could be enhanced with more sophisticated pattern matching
      return firstSentence.length > 0 && firstSentence.length <= 500;
    }
    return true;
  }

  /**
   * Extract snippet around pattern match
   */
  private extractSnippet(content: string, pattern: RegExp): string {
    const match = pattern.exec(content);
    if (!match) {
      return '';
    }
    const start = Math.max(match.index - 50, 0);
    const end = Math.min(match.index + match[0].length + 50, content.length);
    return content.substring(start, end);
  }
}

// Export singleton instance
export const unbreakableIdentityEnforcer = new UnbreakableIdentityEnforcer();

