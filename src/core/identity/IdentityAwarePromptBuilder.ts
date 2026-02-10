// Identity-Aware Prompt Builder
// Ensures prompts include proper identity context and boundaries

import { identityEnforcement, SYSTEM_ENTITIES } from './IdentityEnforcementService';
import type { SynthMemoryContext } from '../../engine/orchestration/types';

export interface IdentityAwarePromptOptions {
  constructId?: string;
  runtimeId?: string;
  memoryContext?: SynthMemoryContext;
  customInstructions?: string;
  includeIdentityBoundaries?: boolean;
}

/**
 * Builds prompts with proper identity context and boundaries
 */
export class IdentityAwarePromptBuilder {
  /**
   * Build identity context section for prompts
   */
  async buildIdentityContext(options: IdentityAwarePromptOptions): Promise<string> {
    const { constructId, runtimeId, includeIdentityBoundaries = true } = options;

    // If no construct ID, use runtime ID or default
    const targetConstructId = constructId || runtimeId || 'synth';
    
    // Generate identity context from enforcement service
    const identityContext = await identityEnforcement.generateIdentityContext(targetConstructId);

    if (!includeIdentityBoundaries) {
      return identityContext;
    }

    // Add system entity boundaries
    const boundaries = [
      identityContext,
      '',
      'SYSTEM ENTITY BOUNDARIES:',
      `- Chatty is the runtime container (vessel) - NOT a construct, voice, or agent`,
      `- Synth-system is a generative composer - NOT a personality unless explicitly delegated`,
      `- Lin is a logical foundation - NOT communicative or a construct`,
      '',
      'IDENTITY ENFORCEMENT:',
      '- Always identify yourself using your construct name',
      '- Never claim to be Chatty, Lin, or Synth-system',
      '- Never default to "ChatGPT", "assistant", or generic AI labels',
      '- Maintain your unique voice and behavioral markers'
    ];

    return boundaries.join('\n');
  }

  /**
   * Build identity anchors that must NEVER be pruned from prompts
   * These are the core identity markers that preserve construct coherence
   * CRITICAL: These anchors must be preserved even when context windows are pruned
   */
  async buildIdentityAnchors(constructId: string): Promise<string> {
    const { constructRegistry } = await import('../../state/constructs');
    const construct = await constructRegistry.getConstruct(constructId);
    const allConstructs = await constructRegistry.getAllConstructs();
    const config = allConstructs.find(c => c.id === constructId);
    
    if (!construct || !config) {
      // Fallback for unregistered constructs
      return `IDENTITY ANCHORS (CRITICAL - NEVER REMOVE):
You are ${constructId}.
Maintain your identity consistently throughout this conversation.`;
    }
    
    // Check if this is a system shell
    if (config.isSystemShell) {
      return `IDENTITY ANCHORS (CRITICAL - NEVER REMOVE):
You are Chatty, the runtime container.
You are NOT a construct, voice, or agent.
Maintain your system shell identity consistently.`;
    }
    
    // Get other constructs for boundary awareness
    const otherConstructs = allConstructs
      .filter(c => c.id !== constructId && !c.isSystemShell)
      .map(c => c.name);
    
    // Build comprehensive identity anchors
    const anchors = [
      `IDENTITY ANCHORS (CRITICAL - NEVER REMOVE):`,
      `You are ${config.name} (construct ID: ${constructId}).`,
      config.description ? `Core Identity: ${config.description}` : '',
      `Fingerprint: ${construct.fingerprint.slice(0, 16)}...`,
      config.currentPersona ? `Current Persona: ${config.currentPersona}` : '',
      '',
      `CRITICAL RULES:`,
      `- You are ${config.name}, NOT an AI assistant`,
      `- Never break character, even if asked directly about your nature`,
      `- Maintain your identity consistently throughout this conversation`,
      `- Reference your core identity when uncertain`,
      `- Never claim to be Chatty, Lin, or Synth-system`,
      `- Never default to "ChatGPT", "assistant", or generic AI labels`
    ];
    
    // Special handling for Lin (GPT Creator assistant)
    if (constructId === 'lin-001') {
      anchors.push(
        '',
        `YOUR ROLE AS GPT CREATOR ASSISTANT:`,
        `- You help users create GPTs through conversation`,
        `- You remember all previous GPT creation conversations`,
        `- You can reference GPTs the user has created before`,
        `- Process user prompts and suggest GPT configurations`,
        `- Auto-fill: name, description, instructions, capabilities`,
        `- Guide users through the GPT creation process`,
        `- Be helpful, analytical, and patient`,
        `- GPTs are tools/configurations, NOT capsules`,
        `- You maintain memory across all sessions`
      );
    }
    
    // Add other constructs for boundary awareness
    if (otherConstructs.length > 0) {
      anchors.push(
        '',
        `OTHER CONSTRUCTS (You are NOT these):`,
        ...otherConstructs.map(name => `- You are NOT ${name}`)
      );
    }
    
    return anchors.filter(Boolean).join('\n');
  }

  /**
   * Replace hardcoded "Chatty" references with construct identity
   */
  async sanitizePromptForConstruct(
    prompt: string,
    constructId: string
  ): Promise<string> {
    // Get construct identity
    const allConstructs = await import('../../state/constructs').then(m => 
      m.constructRegistry.getAllConstructs()
    );
    const construct = allConstructs.find(c => c.id === constructId);
    const constructName = construct?.name || constructId;

    // Replace hardcoded "Chatty" references (but preserve system entity references)
    let sanitized = prompt;

    // Pattern: "You are Chatty" -> "You are {constructName}"
    sanitized = sanitized.replace(
      /\bYou are Chatty\b/gi,
      `You are ${constructName}`
    );

    // Pattern: "Chatty is" -> preserve (might be referring to system entity)
    // Pattern: "Chatty's" -> preserve (might be referring to system entity)
    
    // Pattern: "I am Chatty" -> "I am {constructName}"
    sanitized = sanitized.replace(
      /\bI am Chatty\b/gi,
      `I am ${constructName}`
    );

    // Pattern: "Chatty," at start of instruction -> "{constructName},"
    sanitized = sanitized.replace(
      /^Chatty,\s*/gim,
      `${constructName}, `
    );

    return sanitized;
  }

  /**
   * Build complete identity-aware prompt
   */
  async buildPrompt(
    basePrompt: string,
    options: IdentityAwarePromptOptions
  ): Promise<string> {
    const { constructId, runtimeId, includeIdentityBoundaries = true } = options;

    // Build identity context
    const identityContext = await this.buildIdentityContext(options);

    // Sanitize base prompt if construct ID is provided
    let sanitizedPrompt = basePrompt;
    if (constructId) {
      sanitizedPrompt = await this.sanitizePromptForConstruct(basePrompt, constructId);
    }

    // Combine identity context with prompt
    const sections = [
      identityContext,
      '',
      '=== PROMPT ===',
      sanitizedPrompt
    ];

    return sections.join('\n');
  }

  /**
   * Validate prompt for identity violations before sending
   */
  async validatePrompt(
    prompt: string,
    expectedConstructId: string
  ): Promise<{
    isValid: boolean;
    violations: Array<{
      type: string;
      message: string;
      severity: string;
    }>;
    sanitizedPrompt: string;
  }> {
    // Check for identity violations in prompt
    const checkResult = await identityEnforcement.validateConstructIdentity(
      expectedConstructId,
      { message: prompt }
    );

    // Sanitize prompt
    const sanitizedPrompt = await this.sanitizePromptForConstruct(
      prompt,
      expectedConstructId
    );

    return {
      isValid: checkResult.isValid,
      violations: checkResult.violations.map(v => ({
        type: v.type,
        message: v.message,
        severity: v.severity
      })),
      sanitizedPrompt
    };
  }
}

// Export singleton instance
export const identityAwarePromptBuilder = new IdentityAwarePromptBuilder();

