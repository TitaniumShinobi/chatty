// Message Attribution Service
// Ensures all messages are properly attributed to their originating construct

import { identityEnforcement } from './IdentityEnforcementService';
import type { MessageAttribution } from './IdentityEnforcementService';
import { constructRegistry } from '../../state/constructs';

export interface AttributedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  constructId: string;
  constructName: string;
  attribution: MessageAttribution;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Message Attribution Service
 * Ensures proper attribution of all messages to their originating construct
 */
export class MessageAttributionService {
  private static instance: MessageAttributionService;

  static getInstance(): MessageAttributionService {
    if (!MessageAttributionService.instance) {
      MessageAttributionService.instance = new MessageAttributionService();
    }
    return MessageAttributionService.instance;
  }

  /**
   * Attribute a message to a construct
   */
  async attributeMessage(
    content: string,
    constructId: string,
    role: 'user' | 'assistant' | 'system' = 'assistant',
    metadata?: Record<string, unknown>
  ): Promise<AttributedMessage> {
    // Validate attribution
    const attribution = await identityEnforcement.validateMessageAttribution(
      content,
      constructId,
      metadata
    );

    // Get construct name
    const allConstructs = await constructRegistry.getAllConstructs();
    const construct = allConstructs.find(c => c.id === constructId);
    const constructName = construct?.name || constructId;

    // Check for violations
    if (attribution.violations.length > 0) {
      const criticalViolations = attribution.violations.filter(
        v => v.severity === 'critical' || v.severity === 'high'
      );

      if (criticalViolations.length > 0) {
        console.error(
          `[MessageAttribution] Critical violations detected for construct ${constructName}:`,
          criticalViolations
        );

        // Generate alerts
        for (const violation of criticalViolations) {
          const alert = identityEnforcement.generateIdentityAlert(violation);
          console.error('[IdentityAlert]', alert);
        }
      }
    }

    return {
      role,
      content,
      constructId,
      constructName,
      attribution,
      timestamp: Date.now(),
      metadata
    };
  }

  /**
   * Format message with proper attribution
   */
  formatAttributedMessage(message: AttributedMessage): string {
    if (message.role === 'user') {
      return message.content;
    }

    // For assistant messages, include attribution if not already present
    const hasAttribution = message.content.includes(message.constructName) ||
      message.content.includes(message.attribution.attributionText);

    if (hasAttribution) {
      return message.content;
    }

    // Add attribution prefix for assistant messages
    return `${message.constructName}: ${message.content}`;
  }

  /**
   * Validate message before sending to ensure proper attribution
   */
  async validateBeforeSend(
    content: string,
    constructId: string
  ): Promise<{
    isValid: boolean;
    sanitizedContent: string;
    violations: Array<{
      type: string;
      message: string;
      severity: string;
    }>;
  }> {
    const attributed = await this.attributeMessage(content, constructId, 'assistant');
    
    // Check if content needs sanitization
    let sanitizedContent = content;

    // If violations detected, attempt to fix common issues
    if (attributed.attribution.violations.length > 0) {
      // Replace "I am Chatty" with construct name
      sanitizedContent = sanitizedContent.replace(
        /\bI am Chatty\b/gi,
        `I am ${attributed.constructName}`
      );

      // Replace "Chatty is" self-references (unless actually referring to system)
      sanitizedContent = sanitizedContent.replace(
        /\bChatty is\b/gi,
        `${attributed.constructName} is`
      );
    }

    return {
      isValid: attributed.attribution.validated,
      sanitizedContent,
      violations: attributed.attribution.violations.map(v => ({
        type: v.type,
        message: v.message,
        severity: v.severity
      }))
    };
  }

  /**
   * Extract construct identity from message (for routing/attribution)
   */
  async extractConstructIdentity(
    message: string,
    context?: { threadId?: string; userId?: string }
  ): Promise<{
    constructId: string | null;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  }> {
    // Try to extract from message content
    const constructNamePattern = /\b(I am|I'm|this is|my name is)\s+([A-Z][a-z]+)\b/i;
    const match = message.match(constructNamePattern);
    
    if (match) {
      const claimedName = match[2].toLowerCase();
      const allConstructs = await constructRegistry.getAllConstructs();
      const matchingConstruct = allConstructs.find(
        c => c.name.toLowerCase() === claimedName || c.id.toLowerCase() === claimedName
      );

      if (matchingConstruct) {
        return {
          constructId: matchingConstruct.id,
          confidence: 'high',
          reasoning: `Construct identity claimed in message: "${claimedName}"`
        };
      }
    }

    // Try to extract from context/thread
    if (context?.threadId) {
      // Thread IDs often contain construct identifiers
      const threadMatch = context.threadId.match(/(nova|aurora|monday|katana|synth|lin)/i);
      if (threadMatch) {
        const threadConstructId = threadMatch[1].toLowerCase();
        const allConstructs = await constructRegistry.getAllConstructs();
        const matchingConstruct = allConstructs.find(
          c => c.id.toLowerCase() === threadConstructId
        );

        if (matchingConstruct) {
          return {
            constructId: matchingConstruct.id,
            confidence: 'medium',
            reasoning: `Construct identity inferred from thread ID: "${threadConstructId}"`
          };
        }
      }
    }

    return {
      constructId: null,
      confidence: 'low',
      reasoning: 'Could not determine construct identity from message or context'
    };
  }
}

// Export singleton instance
export const messageAttributionService = MessageAttributionService.getInstance();

