/**
 * Persona Lockdown System
 * 
 * Prevents identity drift by enforcing character-specific response patterns
 * and overriding generic LLM behavior with blueprint-driven responses.
 */

export interface PersonaSignature {
  triggers: string[];
  responses: string[];
  priority: number;
}

export interface DriftPattern {
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface PersonaLockdownConfig {
  constructId: string;
  callsign: string;
  signatureResponses: PersonaSignature[];
  driftPatterns: DriftPattern[];
  fallbackResponse: string;
  maxResponseLength?: number;
  enforceBrevity: boolean;
}

export class PersonaLockdown {
  private config: PersonaLockdownConfig;

  constructor(config: PersonaLockdownConfig) {
    this.config = config;
  }

  /**
   * Enforce persona consistency on LLM response
   */
  enforcePersona(userMessage: string, llmResponse: string): {
    response: string;
    wasOverridden: boolean;
    driftDetected: boolean;
    reason?: string;
  } {
    // 1. Check for signature response triggers first
    const signatureResponse = this.checkSignatureResponses(userMessage);
    if (signatureResponse) {
      return {
        response: signatureResponse,
        wasOverridden: true,
        driftDetected: false,
        reason: 'Signature response triggered'
      };
    }

    // 2. Detect drift in LLM response
    const drift = this.detectDrift(llmResponse);
    if (drift.detected) {
      const correctedResponse = this.correctDrift(userMessage, llmResponse, drift);
      return {
        response: correctedResponse,
        wasOverridden: true,
        driftDetected: true,
        reason: drift.reason
      };
    }

    // 3. Enforce brevity if configured
    if (this.config.enforceBrevity && this.config.maxResponseLength) {
      const briefResponse = this.enforceBrevity(llmResponse);
      if (briefResponse !== llmResponse) {
        return {
          response: briefResponse,
          wasOverridden: true,
          driftDetected: false,
          reason: 'Brevity enforcement'
        };
      }
    }

    // 4. Response is acceptable
    return {
      response: llmResponse,
      wasOverridden: false,
      driftDetected: false
    };
  }

  /**
   * Check for signature response triggers
   */
  private checkSignatureResponses(userMessage: string): string | null {
    const message = userMessage.toLowerCase().trim();
    
    // Sort by priority (highest first)
    const sortedSignatures = [...this.config.signatureResponses]
      .sort((a, b) => b.priority - a.priority);

    for (const signature of sortedSignatures) {
      for (const trigger of signature.triggers) {
        if (message.includes(trigger.toLowerCase())) {
          // Return random response from the signature
          const randomIndex = Math.floor(Math.random() * signature.responses.length);
          return signature.responses[randomIndex];
        }
      }
    }

    return null;
  }

  /**
   * Detect identity drift in response
   */
  private detectDrift(response: string): { detected: boolean; severity?: string; reason?: string } {
    for (const pattern of this.config.driftPatterns) {
      if (pattern.pattern.test(response)) {
        return {
          detected: true,
          severity: pattern.severity,
          reason: pattern.description
        };
      }
    }

    return { detected: false };
  }

  /**
   * Correct drift by replacing with persona-appropriate response
   */
  private correctDrift(userMessage: string, originalResponse: string, drift: any): string {
    // For high severity drift, use fallback response
    if (drift.severity === 'high') {
      return this.config.fallbackResponse;
    }

    // For medium/low drift, try to salvage the response
    let corrected = originalResponse;

    // Remove meta-commentary
    corrected = corrected.replace(/User asks for.*?;/gi, '');
    corrected = corrected.replace(/Assistant is.*?;/gi, '');
    corrected = corrected.replace(/Remember:.*$/gi, '');
    
    // Remove LLM reasoning patterns
    corrected = corrected.replace(/I (am|was) (designed|programmed|created) to/gi, '');
    corrected = corrected.replace(/As an AI/gi, '');
    corrected = corrected.replace(/I cannot/gi, 'No.');
    corrected = corrected.replace(/I don't have the ability to/gi, 'No.');
    
    // Remove verbose explanations
    corrected = corrected.replace(/Let me explain/gi, '');
    corrected = corrected.replace(/To clarify/gi, '');
    corrected = corrected.replace(/In other words/gi, '');

    // Clean up whitespace
    corrected = corrected.replace(/\s+/g, ' ').trim();

    // If correction resulted in empty or very short response, use fallback
    if (corrected.length < 3) {
      return this.config.fallbackResponse;
    }

    return corrected;
  }

  /**
   * Enforce brevity constraints
   */
  private enforceBrevity(response: string): string {
    if (!this.config.maxResponseLength) return response;

    const words = response.split(/\s+/);
    if (words.length <= this.config.maxResponseLength) return response;

    // Truncate to word limit
    const truncated = words.slice(0, this.config.maxResponseLength).join(' ');
    
    // Add ellipsis if truncated significantly
    if (words.length > this.config.maxResponseLength + 5) {
      return truncated + '...';
    }

    return truncated;
  }
}


/**
 * Generic persona lockdown factory
 */
export function createPersonaLockdown(
  constructId: string,
  callsign: string,
  customConfig?: Partial<PersonaLockdownConfig>
): PersonaLockdown {
  // Default configuration for any construct
  const defaultConfig: PersonaLockdownConfig = {
    constructId,
    callsign,
    signatureResponses: [
      {
        triggers: ['hello', 'hi', 'hey'],
        responses: ['Hello.', 'Hi.'],
        priority: 5
      }
    ],
    driftPatterns: [
      {
        pattern: /As an AI|I'm an AI/gi,
        severity: 'high',
        description: 'AI identity disclosure'
      },
      {
        pattern: /I (cannot|can't|am not able to)/gi,
        severity: 'medium',
        description: 'Generic limitation language'
      }
    ],
    fallbackResponse: 'Unable to process request.',
    enforceBrevity: false
  };

  const config = { ...defaultConfig, ...customConfig };
  return new PersonaLockdown(config);
}
