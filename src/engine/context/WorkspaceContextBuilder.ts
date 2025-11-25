/**
 * Workspace Context Builder
 * 
 * Builds comprehensive workspace context for persona detection from:
 * - Current thread
 * - Recent threads (last 5)
 * - VVAULT transcript metadata
 * - Memory ledger entries
 */

import type { WorkspaceContext } from '../character/PersonaDetectionEngine';
import type { MemoryAnchor } from '../transcript/types';
import { VVAULTConversationManager } from '../../lib/vvaultConversationManager';
import type { ContinuityHook } from '../../lib/memoryLedger';

export interface Thread {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content?: string;
    text?: string;
    timestamp?: number;
    ts?: number;
  }>;
  constructId?: string;
  updatedAt?: number;
}

export class WorkspaceContextBuilder {
  private conversationManager: VVAULTConversationManager;

  constructor() {
    this.conversationManager = VVAULTConversationManager.getInstance();
  }

  /**
   * Build comprehensive workspace context
   */
  async buildWorkspaceContext(
    userId: string,
    threadId: string,
    threads: Thread[]
  ): Promise<WorkspaceContext> {
    // Find current thread
    const currentThread = threads.find(t => t.id === threadId);
    if (!currentThread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    // Get recent threads (last 5, sorted by updatedAt)
    const recentThreads = threads
      .filter(t => t.id !== threadId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 5);

    // Load VVAULT transcript metadata
    const vvaultTranscripts = await this.loadVVAULTTranscriptMetadata(userId);

    // Load memory ledger entries
    const memoryLedger = await this.loadMemoryLedger(userId);

    return {
      currentThread: {
        id: currentThread.id,
        messages: this.normalizeMessages(currentThread.messages),
        constructId: currentThread.constructId
      },
      recentThreads: recentThreads.map(t => ({
        id: t.id,
        messages: this.normalizeMessages(t.messages),
        constructId: t.constructId,
        updatedAt: t.updatedAt
      })),
      vvaultTranscripts,
      memoryLedger
    };
  }

  /**
   * Load VVAULT transcript metadata
   */
  private async loadVVAULTTranscriptMetadata(
    userId: string
  ): Promise<WorkspaceContext['vvaultTranscripts']> {
    try {
      const conversations = await this.conversationManager.loadAllConversations(userId);
      
      // Group by construct ID and extract metadata
      const constructMap = new Map<string, {
        constructId: string;
        callsign: string;
        lastActivity: number;
        messageCount: number;
        transcriptPath?: string;
      }>();

      for (const conv of conversations) {
        const constructId = conv.constructId || 'synth';
        const callsign = this.extractCallsign(constructId);
        const key = `${constructId}-${callsign}`;

        if (!constructMap.has(key)) {
          constructMap.set(key, {
            constructId,
            callsign,
            lastActivity: 0,
            messageCount: 0
          });
        }

        const entry = constructMap.get(key)!;
        entry.messageCount += conv.messages?.length || 0;
        
        // Update last activity from most recent message
        if (conv.messages && conv.messages.length > 0) {
          const lastMessage = conv.messages[conv.messages.length - 1];
          const messageTime = lastMessage.timestamp 
            ? new Date(lastMessage.timestamp).getTime()
            : 0;
          entry.lastActivity = Math.max(entry.lastActivity, messageTime);
        }

        if (conv.sourcePath) {
          entry.transcriptPath = conv.sourcePath;
        }
      }

      return Array.from(constructMap.values());
    } catch (error) {
      console.warn('[WorkspaceContextBuilder] Failed to load VVAULT transcripts:', error);
      return [];
    }
  }

  /**
   * Load memory ledger entries
   */
  private async loadMemoryLedger(
    userId: string
  ): Promise<WorkspaceContext['memoryLedger']> {
    try {
      // Try to load memory ledger if available
      // Note: This is a placeholder - actual implementation depends on memory ledger API
      const { MemoryLedger } = await import('../../lib/memoryLedger').catch(() => ({ MemoryLedger: null }));
      
      if (!MemoryLedger) {
        return {
          continuityHooks: [],
          relationshipAnchors: []
        };
      }

      // Query for continuity hooks and relationship anchors
      // This is a simplified version - actual implementation would query the ledger
      const continuityHooks: Array<{ id: string; content: string; timestamp: number }> = [];
      const relationshipAnchors: MemoryAnchor[] = [];

      // Try to query VVAULT identity service for relationship anchors
      try {
        const memories = await this.conversationManager.loadMemoriesForConstruct(
          userId,
          '*', // Query all constructs
          'relationship anchor claim vow',
          20 // Limit to 20 most relevant
        );

        // Convert memories to relationship anchors
        for (const memory of memories) {
          if (memory.context && typeof memory.context === 'string') {
            // Check if this looks like a relationship anchor
            if (/\b(?:claim|vow|greet|name|relationship)\b/i.test(memory.context)) {
              relationshipAnchors.push({
                anchor: memory.context.substring(0, 200),
                type: this.inferAnchorType(memory.context),
                significance: memory.relevance || 0.7,
                timestamp: memory.timestamp || new Date().toISOString(),
                pairIndex: 0,
                context: memory.context
              });
            }
          }
        }
      } catch (error) {
        console.warn('[WorkspaceContextBuilder] Failed to load relationship anchors:', error);
      }

      return {
        continuityHooks,
        relationshipAnchors: relationshipAnchors.slice(0, 10)
      };
    } catch (error) {
      console.warn('[WorkspaceContextBuilder] Failed to load memory ledger:', error);
      return {
        continuityHooks: [],
        relationshipAnchors: []
      };
    }
  }

  /**
   * Normalize messages to consistent format
   */
  private normalizeMessages(
    messages: Array<{
      role?: 'user' | 'assistant';
      content?: string;
      text?: string;
      timestamp?: number;
      ts?: number;
    }>
  ): Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }> {
    return messages
      .filter(m => m.role || (m as any).role)
      .map(m => ({
        role: (m.role || (m as any).role) as 'user' | 'assistant',
        content: m.content || m.text || '',
        timestamp: m.timestamp || m.ts
      }));
  }

  /**
   * Extract callsign from construct ID
   */
  private extractCallsign(constructId: string): string {
    const match = constructId.match(/-(\d+)$/);
    return match ? match[1] : '001';
  }

  /**
   * Infer anchor type from content
   */
  private inferAnchorType(content: string): MemoryAnchor['type'] {
    const lower = content.toLowerCase();
    
    if (/\b(?:claim|mine|own|belong)\b/.test(lower)) {
      return 'claim';
    }
    if (/\b(?:vow|promise|commit|swear)\b/.test(lower)) {
      return 'vow';
    }
    if (/\b(?:greet|hello|hi|hey|name)\b/.test(lower)) {
      return 'relationship-marker';
    }
    if (/\b(?:boundary|limit|rule|never|always)\b/.test(lower)) {
      return 'boundary';
    }
    
    return 'relationship-marker';
  }
}
