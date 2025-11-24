import { constructRegistry } from '../../state/constructs';
import { threadManager } from '../../core/thread/SingletonThreadManager';
import { stmBuffer, type MessagePacket } from '../../core/memory/STMBuffer';
import { shouldLog } from '../../lib/verbosity';
import type {
  SynthMemoryContext,
  STMContextEntry,
  LTMContextEntry,
  SummaryContextEntry,
  MemoryRole
} from './types';

type PersonaProvider = (userId: string) => Record<string, unknown>;

type VVAULTConnector = {
  writeTranscript?: (params: {
    userId: string;
    sessionId: string;
    timestamp: string;
    role: string;
    content: string;
    filename?: string;
    emotionScores?: Record<string, number>;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  readMemories?: (userId: string, options?: Record<string, unknown>) => Promise<Array<{
    timestamp: string;
    role: string;
    content: string;
    filename?: string;
    metadata?: Record<string, unknown>;
  }>>;
};

export interface SynthMemoryOrchestratorOptions {
  constructId?: string;
  userId?: string;
  threadId?: string;
  leaseDurationMs?: number;
  maxStmWindow?: number;
  maxLtmEntries?: number;
  maxSummaries?: number;
  personaProvider?: PersonaProvider;
  vvaultConnector?: VVAULTConnector;
}

const DEFAULT_ROLE_LOCK = {
  allowedRoles: ['assistant', 'analyst', 'companion'],
  prohibitedRoles: [],
  contextBoundaries: ['general', 'technical', 'creative'],
  behaviorConstraints: [
    'maintain conversational tone',
    'adhere to developer safety policies'
  ]
};

const DEFAULT_CONSTRUCT_DESCRIPTION =
  'Default construct for Chatty synthesizer sessions. Maintains STM/LTM continuity via VVAULT.';

export class SynthMemoryOrchestrator {
  private readonly constructId: string;
  private readonly userId: string;
  private threadId: string | null;
  private leaseToken: string | null = null;
  private readonly personaProvider?: PersonaProvider;
  private readonly vvaultConnector?: VVAULTConnector;
  private readonly maxStmWindow: number;
  private readonly maxLtmEntries: number;
  private readonly maxSummaries: number;
  private readonly leaseDurationMs: number;
  private initializationPromise: Promise<void> | null = null;
  private availabilityNotes: string[] = [];

  constructor(options: SynthMemoryOrchestratorOptions = {}) {
    this.constructId = options.constructId ?? 'default-construct';
    this.userId = options.userId ?? 'cli';
    this.threadId = options.threadId ?? null;
    this.personaProvider = options.personaProvider;
    this.vvaultConnector = options.vvaultConnector;
    this.maxStmWindow = options.maxStmWindow ?? 100;
    this.maxLtmEntries = options.maxLtmEntries ?? 32;
    this.maxSummaries = options.maxSummaries ?? 4;
    this.leaseDurationMs = options.leaseDurationMs ?? 5 * 60 * 1000;
  }

  /**
   * Ensure construct, vault store, and thread are ready before use.
   */
  async ensureReady(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }
    await this.initializationPromise;
  }

  /**
   * Record a user/assistant message into STM, LTM, and VVAULT (if available).
   */
  async captureMessage(
    role: MemoryRole,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.ensureReady();
    const threadId = this.threadId!;
    const timestamp = Date.now();
    const messageId = this.generateMessageId(role);
    const packet: MessagePacket = {
      id: messageId,
      role,
      content,
      timestamp,
      metadata
    };

    try {
      stmBuffer.addMessage(this.constructId, threadId, packet);
    } catch (error) {
      this.logWarning('Failed to append message to STM buffer', error);
    }

    // Store LTM via VVAULT API directly
      try {
      await this.storeLTMToVVAULT(role, content, timestamp, threadId, metadata);
      } catch (error) {
      this.logWarning('Failed to persist message to VVAULT API', error);
    }

    if (this.vvaultConnector?.writeTranscript) {
      await this.writeTranscriptToVvault(role, content, timestamp, metadata).catch(error =>
        this.logWarning('Failed to write transcript to VVAULT', error)
      );
    }
  }

  /**
   * Build orchestrated memory context for prompt construction.
   */
  async prepareMemoryContext(
    overrides: Partial<Pick<SynthMemoryOrchestratorOptions, 'maxStmWindow' | 'maxLtmEntries' | 'maxSummaries'>> = {}
  ): Promise<SynthMemoryContext> {
    await this.ensureReady();

    const stmLimit = overrides.maxStmWindow ?? this.maxStmWindow;
    const ltmLimit = overrides.maxLtmEntries ?? this.maxLtmEntries;
    const summaryLimit = overrides.maxSummaries ?? this.maxSummaries;

    const [stmWindow, ltmEntries, summaries, stats] = await Promise.all([
      this.loadSTMWindow(stmLimit),
      this.loadLTMEntries(ltmLimit),
      this.loadSummaries(summaryLimit),
      this.loadVaultStats()
    ]);

    const persona = this.personaProvider ? this.personaProvider(this.userId) : undefined;
    const context: SynthMemoryContext = {
      constructId: this.constructId,
      threadId: this.threadId!,
      leaseToken: this.leaseToken,
      stmWindow,
      ltmEntries,
      summaries
    };

    if (stats) {
      context.vaultStats = stats;
    }
    if (persona) {
      context.persona = persona;
    }
    if (this.availabilityNotes.length > 0) {
      context.notes = [...new Set(this.availabilityNotes)];
    }

    return context;
  }

  private async initialize(): Promise<void> {
    await this.ensureConstruct();
    await this.ensureThread();
  }

  /**
   * Ensure construct exists.
   */
  private async ensureConstruct(): Promise<void> {
    const existing = await constructRegistry.getConstruct(this.constructId);
    if (existing) {
      return;
    }

    const fingerprint = `fingerprint_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await constructRegistry.registerConstruct({
      id: this.constructId,
      name: 'Chatty Synth Construct',
      description: DEFAULT_CONSTRUCT_DESCRIPTION,
      roleLock: DEFAULT_ROLE_LOCK,
      legalDocSha256: 'chatty-synth-default-legal-sha256',
      vaultPointer: `vvault/users/${this.userId}`,
      fingerprint
    });
  }

  /**
   * Ensure a thread and lease are available.
   */
  private async ensureThread(): Promise<void> {
    if (this.threadId) {
      return;
    }

    const threads = await threadManager.getThreads(this.constructId);
    let targetThreadId: string;

    if (threads.length > 0) {
      targetThreadId = threads[0].id;
    } else {
      const created = await threadManager.createThread(
        this.constructId,
        'Synthesizer Session'
      );
      targetThreadId = created.id;
    }

    try {
      this.leaseToken = await threadManager.acquireLease(
        this.constructId,
        targetThreadId,
        this.leaseDurationMs
      );
    } catch (error) {
      this.logWarning('Failed to acquire thread lease', error);
      this.noteIfMissing('Thread lease acquisition failed - proceeding without lease');
    }

    this.threadId = targetThreadId;
  }

  private async loadSTMWindow(limit: number): Promise<STMContextEntry[]> {
    try {
      const window = await stmBuffer.getWindow(this.constructId, this.threadId!, limit);
      return window.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        sequence: (msg as any).sequence
      }));
    } catch (error) {
      this.logWarning('Failed to load STM window', error);
      this.noteIfMissing('STM buffer unavailable - memory window is empty');
      return [];
    }
  }

  private async loadLTMEntries(limit: number): Promise<LTMContextEntry[]> {
    try {
      // Query VVAULT API for LTM entries
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(this.constructId)}&query=long-term memory&limit=${limit}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        this.logWarning('Failed to load LTM entries from VVAULT API', new Error(queryResponse.statusText));
        // Fall back to VVAULT transcripts if available
        if (this.vvaultConnector?.readMemories) {
          return this.loadMemoriesFromVvault(limit);
        }
        return [];
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
        // Fall back to VVAULT transcripts if available
        if (this.vvaultConnector?.readMemories) {
          return this.loadMemoriesFromVvault(limit);
        }
        return [];
      }

      // Filter for long-term memories and convert to LTMContextEntry format
      const ltmEntries = result.memories
        .filter((m: any) => m.memoryType === 'long-term' || !m.memoryType)
        .slice(0, limit)
        .map((memory: any, index: number) => ({
          id: index,
          kind: 'LTM',
          content: memory.response || memory.context || '',
          relevanceScore: memory.relevance || 1.0,
          timestamp: memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now(),
          metadata: {
            context: memory.context,
            response: memory.response,
            sessionId: this.threadId,
            ...memory.metadata
          }
        }));

      if (ltmEntries.length > 0) {
        return ltmEntries;
      }

      // Fall back to VVAULT transcripts if no LTM entries found
    if (this.vvaultConnector?.readMemories) {
      return this.loadMemoriesFromVvault(limit);
    }

      return [];
    } catch (error) {
      this.logWarning('Failed to load LTM entries from VVAULT API', error);
      // Fall back to VVAULT transcripts if available
      if (this.vvaultConnector?.readMemories) {
        return this.loadMemoriesFromVvault(limit);
      }
    return [];
    }
  }

  private async loadSummaries(limit: number): Promise<SummaryContextEntry[]> {
    try {
      // Query VVAULT API for summary/checkpoint entries
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(this.constructId)}&query=checkpoint summary&limit=${limit}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        return [];
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
      return [];
    }

      // Filter for summary/checkpoint entries and convert format
      return result.memories
        .filter((m: any) => m.metadata?.kind?.includes('SUMMARY') || m.metadata?.kind?.includes('CHECKPOINT'))
        .slice(0, limit)
        .map((memory: any, index: number) => {
          const metadata = memory.metadata || {};
          return {
            id: index,
            constructId: this.constructId,
            threadId: metadata.sessionId || this.threadId,
            summaryType: metadata.kind?.replace('SUMMARY_', '') as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL' || 'MANUAL',
            content: memory.response || memory.context,
            startTs: metadata.startTs || (memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now()),
            endTs: metadata.endTs || (memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now()),
            createdAt: memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now()
          };
        });
    } catch (error) {
      this.logWarning('Failed to load vault summaries from VVAULT API', error);
      return [];
    }
  }

  private async loadVaultStats(): Promise<SynthMemoryContext['vaultStats'] | undefined> {
    try {
      // Query VVAULT API for all memories to compute stats
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(this.constructId)}&query=*&limit=1000`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        return undefined;
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
      return undefined;
    }

      const memories = result.memories;
      const entriesByKind: Record<string, number> = {};
      let oldestEntry: number | undefined;
      let newestEntry: number | undefined;
      let totalSummaries = 0;

      memories.forEach((memory: any) => {
        const kind = memory.metadata?.kind || 'LTM';
        entriesByKind[kind] = (entriesByKind[kind] || 0) + 1;

        if (memory.metadata?.kind?.includes('SUMMARY')) {
          totalSummaries++;
        }

        const ts = memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now();
        if (!oldestEntry || ts < oldestEntry) {
          oldestEntry = ts;
        }
        if (!newestEntry || ts > newestEntry) {
          newestEntry = ts;
        }
      });

      return {
        totalEntries: memories.length,
        entriesByKind,
        totalSummaries,
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      this.logWarning('Failed to load vault statistics from VVAULT API', error);
      return undefined;
    }
  }

  private async loadMemoriesFromVvault(limit: number): Promise<LTMContextEntry[]> {
    if (!this.vvaultConnector?.readMemories) {
      return [];
    }

    try {
      const memories = await this.vvaultConnector.readMemories(this.userId, {
        limit,
        sessionId: this.threadId ?? undefined
      });

      return memories.slice(0, limit).map(memory => ({
        id: memory.filename ? this.stripExtension(memory.filename) : undefined,
        kind: 'TRANSCRIPT',
        content: memory.content,
        timestamp: new Date(memory.timestamp).getTime(),
        metadata: {
          source: 'vvault',
          role: memory.role,
          filename: memory.filename,
          ...(memory.metadata ?? {})
        }
      }));
    } catch (error) {
      this.logWarning('Failed to read memories from VVAULT', error);
      return [];
    }
  }

  private async writeTranscriptToVvault(
    role: MemoryRole,
    content: string,
    timestamp: number,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.vvaultConnector?.writeTranscript) {
      return;
    }

    const constructId = (metadata.constructId as string) || this.deriveConstructId();
    const constructName = (metadata.constructName as string) || this.formatConstructName(constructId);

    await this.vvaultConnector.writeTranscript({
      userId: this.userId,
      sessionId: this.threadId ?? 'default-session',
      timestamp: new Date(timestamp).toISOString(),
      role,
      content,
      metadata,
      constructId,
      constructName
    });
  }

  private deriveConstructId(): string {
    if (this.threadId) {
      const match = this.threadId.match(/^([a-z0-9-]+)/i);
      if (match) {
        return match[1].toLowerCase();
      }
    }
    return 'synth';
  }

  private formatConstructName(constructId: string): string {
    return constructId
      .replace(/-\d{3,}$/i, '')
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Synth';
  }

  private generateMessageId(role: MemoryRole): string {
    try {
      const maybeCrypto = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
      if (maybeCrypto?.randomUUID) {
        return `${role}_${maybeCrypto.randomUUID()}`;
      }
    } catch {
      // Silent fallback
    }
    return `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private stripExtension(value?: string): string | undefined {
    if (!value) return value;
    const index = value.lastIndexOf('.');
    return index === -1 ? value : value.slice(0, index);
  }

  private logWarning(message: string, error: unknown): void {
    if (!shouldLog('warn')) {
      return;
    }
    if (typeof console !== 'undefined') {
      console.warn(`[SynthMemoryOrchestrator] ${message}`, error);
    }
  }

  private noteIfMissing(note: string): void {
    this.availabilityNotes.push(note);
  }

  /**
   * Store LTM to VVAULT API directly
   */
  private async storeLTMToVVAULT(
    role: MemoryRole,
    content: string,
    timestamp: number,
    threadId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // For LTM storage, we need context/response pairs
    // If this is a user message, store it with empty response (will be updated when assistant responds)
    // If this is an assistant message, try to pair it with the previous user message
    
    const context = role === 'user' ? content : '';
    const response = role === 'assistant' ? content : '';

    const storeResponse = await fetch('/api/vvault/identity/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        constructCallsign: this.constructId,
        context: context || `Message ${role}`,
        response: response || context,
        metadata: {
          timestamp: new Date(timestamp).toISOString(),
          sessionId: threadId,
          source: 'synth-memory-orchestrator',
          memoryType: 'long-term', // Explicitly set as LTM
          role,
          orchestrator: 'synth-memory',
          ...metadata
        }
      })
    });

    if (!storeResponse.ok) {
      const errorText = await storeResponse.text();
      throw new Error(`VVAULT API error: ${storeResponse.status} ${errorText}`);
    }
  }
}
