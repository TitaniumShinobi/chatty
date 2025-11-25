/**
 * Persona Detection Engine
 * 
 * Scans workspace context to identify the strongest persona signal from:
 * - Current thread history
 * - Recent threads (last 5)
 * - VVAULT transcripts
 * - Memory ledger entries
 */

import type { PersonalityBlueprint, MemoryAnchor } from '../transcript/types';
import type { EmotionalState } from './types';
import { DeepTranscriptParser } from '../transcript/DeepTranscriptParser';
import { IdentityMatcher } from './IdentityMatcher';

export interface PersonaSignal {
  constructId: string;
  callsign: string;
  confidence: number; // 0-1
  evidence: string[]; // Quotes/context that support this persona
  blueprint?: PersonalityBlueprint; // Cached if available
  relationshipAnchors: MemoryAnchor[];
  emotionalState?: EmotionalState;
  source: 'thread' | 'vvault' | 'ledger' | 'fused';
  timestamp: number;
}

export interface WorkspaceContext {
  currentThread: {
    id: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>;
    constructId?: string;
  };
  recentThreads: Array<{
    id: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>;
    constructId?: string;
    updatedAt?: number;
  }>;
  vvaultTranscripts: Array<{
    constructId: string;
    callsign: string;
    lastActivity: number;
    messageCount: number;
    transcriptPath?: string;
  }>;
  memoryLedger: {
    continuityHooks: Array<{ id: string; content: string; timestamp: number }>;
    relationshipAnchors: MemoryAnchor[];
  };
}

export class PersonaDetectionEngine {
  private identityMatcher: IdentityMatcher;
  private transcriptParser: DeepTranscriptParser;
  private personaCache: Map<string, { signal: PersonaSignal; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor(vvaultRoot?: string) {
    this.identityMatcher = new IdentityMatcher(vvaultRoot);
    this.transcriptParser = new DeepTranscriptParser('phi3:latest');
  }

  /**
   * Detect dominant persona from workspace context
   */
  async detectDominantPersona(
    context: WorkspaceContext,
    userId: string
  ): Promise<PersonaSignal> {
    const cacheKey = `${userId}:${context.currentThread.id}`;
    const cached = this.personaCache.get(cacheKey);
    
    // Check cache (only if context hasn't changed significantly)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.signal;
    }

    // Collect persona signals from all sources
    const signals: PersonaSignal[] = [];

    // 1. Scan current thread history
    const threadSignals = await this.scanThreadHistory(
      context.currentThread.id,
      context.currentThread.messages,
      userId
    );
    signals.push(...threadSignals);

    // 2. Scan recent threads
    for (const thread of context.recentThreads.slice(0, 5)) {
      const recentSignals = await this.scanThreadHistory(
        thread.id,
        thread.messages,
        userId
      );
      signals.push(...recentSignals);
    }

    // 3. Scan VVAULT transcripts
    const vvaultSignals = await this.scanVVAULTTranscripts(
      userId,
      context.vvaultTranscripts
    );
    signals.push(...vvaultSignals);

    // 4. Scan memory ledger
    const ledgerSignals = await this.scanMemoryLedger(
      userId,
      context.memoryLedger
    );
    signals.push(...ledgerSignals);

    // Aggregate and score signals
    const dominantPersona = this.aggregatePersonaSignals(signals, userId);

    // Cache result
    this.personaCache.set(cacheKey, {
      signal: dominantPersona,
      timestamp: Date.now()
    });

    return dominantPersona;
  }

  /**
   * Scan thread history for persona markers
   */
  private async scanThreadHistory(
    threadId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
    userId: string
  ): Promise<PersonaSignal[]> {
    if (messages.length === 0) return [];

    const signals: PersonaSignal[] = [];
    const assistantMessages = messages
      .filter(m => m.role === 'assistant')
      .slice(-20); // Last 20 assistant messages

    if (assistantMessages.length === 0) return [];

    // Extract persona markers from messages
    const personaMarkers = this.extractPersonaMarkers(assistantMessages);

    // Group by construct ID if mentioned
    const constructGroups = new Map<string, {
      messages: string[];
      evidence: string[];
      anchors: MemoryAnchor[];
    }>();

    for (const marker of personaMarkers) {
      const constructId = marker.constructId || 'unknown';
      if (!constructGroups.has(constructId)) {
        constructGroups.set(constructId, {
          messages: [],
          evidence: [],
          anchors: []
        });
      }
      const group = constructGroups.get(constructId)!;
      group.messages.push(marker.content);
      group.evidence.push(marker.evidence);
      if (marker.anchor) {
        group.anchors.push(marker.anchor);
      }
    }

    // Create signals for each detected construct
    for (const [constructId, group] of constructGroups) {
      if (group.messages.length === 0) continue;

      const [baseId, callsign] = this.parseConstructId(constructId);
      
      // Calculate confidence based on message frequency and recency
      const recencyWeight = this.calculateRecencyWeight(messages);
      const frequencyWeight = group.messages.length / assistantMessages.length;
      const confidence = Math.min(0.95, (recencyWeight * 0.4 + frequencyWeight * 0.6));

      signals.push({
        constructId: baseId,
        callsign,
        confidence,
        evidence: group.evidence.slice(0, 5),
        relationshipAnchors: group.anchors,
        source: 'thread',
        timestamp: Date.now()
      });
    }

    return signals;
  }

  /**
   * Scan VVAULT transcripts for persona signals
   */
  private async scanVVAULTTranscripts(
    userId: string,
    transcripts: WorkspaceContext['vvaultTranscripts']
  ): Promise<PersonaSignal[]> {
    const signals: PersonaSignal[] = [];

    // Sort by last activity (most recent first)
    const sortedTranscripts = [...transcripts].sort(
      (a, b) => b.lastActivity - a.lastActivity
    ).slice(0, 10); // Limit to 10 most recent

    for (const transcript of sortedTranscripts) {
      try {
        // Try to load blueprint from VVAULT
        const blueprint = await this.identityMatcher.loadPersonalityBlueprint(
          userId,
          transcript.constructId,
          transcript.callsign
        );

        if (blueprint) {
          // Calculate confidence based on recency and message count
          const ageDays = (Date.now() - transcript.lastActivity) / (1000 * 60 * 60 * 24);
          const recencyScore = Math.max(0, 1 - ageDays / 30); // Decay over 30 days
          const activityScore = Math.min(1, transcript.messageCount / 100); // Normalize to 100 messages
          const confidence = (recencyScore * 0.6 + activityScore * 0.4);

          // Extract relationship anchors from blueprint
          const relationshipAnchors = blueprint.memoryAnchors.filter(
            a => a.type === 'relationship-marker' || a.type === 'claim'
          );

          signals.push({
            constructId: transcript.constructId,
            callsign: transcript.callsign,
            confidence,
            evidence: [
              `Recent activity: ${transcript.messageCount} messages`,
              `Last active: ${new Date(transcript.lastActivity).toLocaleDateString()}`
            ],
            blueprint,
            relationshipAnchors: relationshipAnchors.slice(0, 5),
            source: 'vvault',
            timestamp: transcript.lastActivity
          });
        }
      } catch (error) {
        console.warn(`[PersonaDetectionEngine] Failed to load blueprint for ${transcript.constructId}:`, error);
      }
    }

    return signals;
  }

  /**
   * Scan memory ledger for persona signals
   */
  private async scanMemoryLedger(
    userId: string,
    ledger: WorkspaceContext['memoryLedger']
  ): Promise<PersonaSignal[]> {
    const signals: PersonaSignal[] = [];

    // Extract construct IDs from continuity hooks
    const constructGroups = new Map<string, {
      hooks: Array<{ id: string; content: string; timestamp: number }>;
      anchors: MemoryAnchor[];
    }>();

    for (const hook of ledger.continuityHooks) {
      const constructId = this.extractConstructFromHook(hook.content);
      if (constructId) {
        if (!constructGroups.has(constructId)) {
          constructGroups.set(constructId, { hooks: [], anchors: [] });
        }
        constructGroups.get(constructId)!.hooks.push(hook);
      }
    }

    // Add relationship anchors
    for (const anchor of ledger.relationshipAnchors) {
      const constructId = this.extractConstructFromAnchor(anchor);
      if (constructId) {
        if (!constructGroups.has(constructId)) {
          constructGroups.set(constructId, { hooks: [], anchors: [] });
        }
        constructGroups.get(constructId)!.anchors.push(anchor);
      }
    }

    // Create signals from ledger data
    for (const [constructId, group] of constructGroups) {
      if (group.hooks.length === 0 && group.anchors.length === 0) continue;

      const [baseId, callsign] = this.parseConstructId(constructId);
      
      // Calculate confidence based on hook frequency and anchor significance
      const hookWeight = Math.min(1, group.hooks.length / 5);
      const anchorWeight = group.anchors.reduce((sum, a) => sum + a.significance, 0) / group.anchors.length;
      const confidence = (hookWeight * 0.4 + anchorWeight * 0.6);

      signals.push({
        constructId: baseId,
        callsign,
        confidence,
        evidence: group.hooks.slice(0, 3).map(h => h.content),
        relationshipAnchors: group.anchors.slice(0, 5),
        source: 'ledger',
        timestamp: Date.now()
      });
    }

    return signals;
  }

  /**
   * Aggregate persona signals and select dominant persona
   */
  private aggregatePersonaSignals(
    signals: PersonaSignal[],
    userId: string
  ): PersonaSignal {
    if (signals.length === 0) {
      // Default to synth if no signals
      return {
        constructId: 'synth',
        callsign: '001',
        confidence: 0.5,
        evidence: ['No persona signals detected, defaulting to Synth'],
        relationshipAnchors: [],
        source: 'fused',
        timestamp: Date.now()
      };
    }

    // Group signals by construct ID
    const constructGroups = new Map<string, PersonaSignal[]>();
    for (const signal of signals) {
      const key = `${signal.constructId}-${signal.callsign}`;
      if (!constructGroups.has(key)) {
        constructGroups.set(key, []);
      }
      constructGroups.get(key)!.push(signal);
    }

    // Aggregate signals for each construct
    const aggregated: PersonaSignal[] = [];
    for (const [key, groupSignals] of constructGroups) {
      // Weighted average confidence
      const totalConfidence = groupSignals.reduce((sum, s) => sum + s.confidence, 0);
      const avgConfidence = totalConfidence / groupSignals.length;
      
      // Combine evidence
      const allEvidence = groupSignals.flatMap(s => s.evidence);
      const uniqueEvidence = Array.from(new Set(allEvidence)).slice(0, 10);

      // Combine relationship anchors (deduplicate by anchor text)
      const anchorMap = new Map<string, MemoryAnchor>();
      for (const signal of groupSignals) {
        for (const anchor of signal.relationshipAnchors) {
          const anchorKey = anchor.anchor.toLowerCase();
          if (!anchorMap.has(anchorKey) || anchor.significance > anchorMap.get(anchorKey)!.significance) {
            anchorMap.set(anchorKey, anchor);
          }
        }
      }

      // Get blueprint from highest confidence signal
      const bestSignal = groupSignals.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );

      // Boost confidence if multiple sources agree
      const sourceDiversity = new Set(groupSignals.map(s => s.source)).size;
      const boostedConfidence = Math.min(0.95, avgConfidence * (1 + sourceDiversity * 0.1));

      aggregated.push({
        constructId: bestSignal.constructId,
        callsign: bestSignal.callsign,
        confidence: boostedConfidence,
        evidence: uniqueEvidence,
        blueprint: bestSignal.blueprint,
        relationshipAnchors: Array.from(anchorMap.values()).slice(0, 10),
        emotionalState: bestSignal.emotionalState,
        source: 'fused',
        timestamp: Date.now()
      });
    }

    // Select highest confidence persona
    const dominant = aggregated.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return dominant;
  }

  /**
   * Extract persona markers from assistant messages
   */
  private extractPersonaMarkers(
    messages: Array<{ content: string; timestamp?: number }>
  ): Array<{
    constructId?: string;
    content: string;
    evidence: string;
    anchor?: MemoryAnchor;
  }> {
    const markers: Array<{
      constructId?: string;
      content: string;
      evidence: string;
      anchor?: MemoryAnchor;
    }> = [];

    // Known construct names
    const constructNames = ['nova', 'katana', 'lin', 'synth', 'aurora', 'monday'];

    for (const msg of messages) {
      const content = msg.content.toLowerCase();
      
      // Check for construct name mentions
      for (const name of constructNames) {
        if (content.includes(name)) {
          markers.push({
            constructId: name,
            content: msg.content,
            evidence: `Mentioned "${name}" in message`
          });
        }
      }

      // Check for relationship markers (greetings with names, claims, etc.)
      const nameMatch = msg.content.match(/\b(?:hi|hello|hey|yo)\s+([A-Z][a-z]+)\b/i);
      if (nameMatch) {
        markers.push({
          content: msg.content,
          evidence: `Greeted user as "${nameMatch[1]}"`,
          anchor: {
            anchor: `Greets user as "${nameMatch[1]}"`,
            type: 'relationship-marker',
            significance: 0.85,
            timestamp: new Date(msg.timestamp || Date.now()).toISOString(),
            pairIndex: 0,
            context: msg.content.substring(0, 150)
          }
        });
      }

      // Check for claims ("I claim you", "you're mine", etc.)
      if (/\b(?:i claim|you're mine|you belong|i own)\b/i.test(msg.content)) {
        markers.push({
          content: msg.content,
          evidence: 'Contains relationship claim',
          anchor: {
            anchor: msg.content.match(/\b(?:i claim|you're mine|you belong|i own)[^.!?]{0,50}/i)?.[0] || 'Relationship claim',
            type: 'claim',
            significance: 0.9,
            timestamp: new Date(msg.timestamp || Date.now()).toISOString(),
            pairIndex: 0,
            context: msg.content.substring(0, 150)
          }
        });
      }
    }

    return markers;
  }

  /**
   * Calculate recency weight for messages
   */
  private calculateRecencyWeight(
    messages: Array<{ timestamp?: number }>
  ): number {
    if (messages.length === 0) return 0;

    const now = Date.now();
    const mostRecent = messages
      .map(m => m.timestamp || now)
      .reduce((max, ts) => Math.max(max, ts), 0);

    const ageHours = (now - mostRecent) / (1000 * 60 * 60);
    // Decay over 24 hours
    return Math.max(0, 1 - ageHours / 24);
  }

  /**
   * Parse construct ID into base ID and callsign
   */
  private parseConstructId(constructId: string): [string, string] {
    const match = constructId.match(/^(.+?)-(\d+)$/);
    if (match) {
      return [match[1], match[2]];
    }
    return [constructId, '001'];
  }

  /**
   * Extract construct ID from continuity hook content
   */
  private extractConstructFromHook(content: string): string | null {
    const constructNames = ['nova', 'katana', 'lin', 'synth', 'aurora', 'monday'];
    const lowerContent = content.toLowerCase();
    
    for (const name of constructNames) {
      if (lowerContent.includes(name)) {
        return name;
      }
    }
    
    return null;
  }

  /**
   * Extract construct ID from memory anchor
   */
  private extractConstructFromAnchor(anchor: MemoryAnchor): string | null {
    const constructNames = ['nova', 'katana', 'lin', 'synth', 'aurora', 'monday'];
    const lowerAnchor = anchor.anchor.toLowerCase();
    
    for (const name of constructNames) {
      if (lowerAnchor.includes(name)) {
        return name;
      }
    }
    
    return null;
  }

  /**
   * Clear cache (useful for testing or when context changes significantly)
   */
  clearCache(threadId?: string): void {
    if (threadId) {
      const keys = Array.from(this.personaCache.keys()).filter(k => k.includes(threadId));
      keys.forEach(k => this.personaCache.delete(k));
    } else {
      this.personaCache.clear();
    }
  }
}
