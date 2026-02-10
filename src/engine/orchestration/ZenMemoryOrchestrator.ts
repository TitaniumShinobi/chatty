import { constructRegistry } from '../../state/constructs';
import { threadManager } from '../../core/thread/SingletonThreadManager';
import { stmBuffer, type MessagePacket } from '../../core/memory/STMBuffer';
import { shouldLog } from '../../lib/verbosity';
import { VaultStore, createVaultStore } from '../../core/vault/VaultStore';
import type {
  ZenMemoryContext,
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

export interface ZenMemoryOrchestratorOptions {
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
  'Default construct for Chatty zen sessions. Maintains STM/LTM continuity via VVAULT.';

export class ZenMemoryOrchestrator {
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
  private readonly vaultStore: VaultStore;

  constructor(options: ZenMemoryOrchestratorOptions = {}) {
    this.constructId = options.constructId ?? 'default-construct';
    this.userId = options.userId ?? 'cli';
    this.threadId = options.threadId ?? null;
    this.personaProvider = options.personaProvider;
    this.vvaultConnector = options.vvaultConnector;
    this.maxStmWindow = options.maxStmWindow ?? 100;
    this.maxLtmEntries = options.maxLtmEntries ?? 32;
    this.maxSummaries = options.maxSummaries ?? 4;
    this.leaseDurationMs = options.leaseDurationMs ?? 5 * 60 * 1000;
    this.vaultStore = createVaultStore(this.constructId);
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

    // Store LTM via VaultStore
    try {
      await this.vaultStore.saveMessage(threadId, {
        role,
        content,
        timestamp,
        metadata: {
          source: 'zen-memory-orchestrator',
          memoryType: 'long-term',
          orchestrator: 'zen-memory',
          ...metadata
        }
      });
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
    overrides: Partial<Pick<ZenMemoryOrchestratorOptions, 'maxStmWindow' | 'maxLtmEntries' | 'maxSummaries'>> & { query?: string } = {}
  ): Promise<ZenMemoryContext> {
    await this.ensureReady();

    const stmLimit = overrides.maxStmWindow ?? this.maxStmWindow;
    const ltmLimit = overrides.maxLtmEntries ?? this.maxLtmEntries;
    const summaryLimit = overrides.maxSummaries ?? this.maxSummaries;

    const [stmWindow, ltmEntries, summaries, stats] = await Promise.all([
      this.loadSTMWindow(stmLimit),
      this.loadLTMEntries(ltmLimit, overrides.query),
      this.loadSummaries(summaryLimit),
      this.loadVaultStats()
    ]);

    const persona = this.personaProvider ? this.personaProvider(this.userId) : undefined;
    const context: ZenMemoryContext = {
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
      name: 'Chatty Zen Construct',
      description: DEFAULT_CONSTRUCT_DESCRIPTION.replace('synthesizer', 'zen'),
      roleLock: DEFAULT_ROLE_LOCK,
      legalDocSha256: 'chatty-zen-default-legal-sha256',
      vaultPointer: `vvault/users/${this.userId}`,
      fingerprint,
      isSystemShell: false
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
        this.constructId, // Fixed typo: this.construct极客Id -> this.constructId
        'Zen Session'
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

  private async loadLTMEntries(limit: number, query?: string): Promise<LTMContextEntry[]> {
    try {
      // Query VaultStore for LTM entries
      const entries = await this.vaultStore.search({
        constructId: this.constructId,
        threadId: query ? undefined : (this.threadId || undefined), // If query provided, search global
        kind: 'LTM',
        limit,
        query
      });

      // Map VaultEntry[] to LTMContextEntry[]
      const ltmEntries: LTMContextEntry[] = entries.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        content: entry.payload?.response || entry.payload?.context || (typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload)),
        relevanceScore: entry.relevanceScore,
        timestamp: entry.timestamp,
        metadata: {
          context: entry.payload?.context,
          response: entry.payload?.response,
          sessionId: this.threadId,
          ...entry.metadata
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
      this.logWarning('Failed to load LTM entries from VaultStore', error);
      // Fall back to VVAULT transcripts if available
      if (this.vvaultConnector?.readMemories) {
        return this.loadMemoriesFromVvault(limit);
      }
      return [];
    }
  }

  private async loadSummaries(limit: number): Promise<SummaryContextEntry[]> {
    try {
      // Query VaultStore for summary metadata
      const summaries = await this.vaultStore.getVaultSummaryMeta();

      // Map VaultSummary[] to SummaryContextEntry[] and apply limit
      return summaries
        .slice(0, limit)
        .map((summary) => ({
          id: summary.id,
          summaryType: summary.summaryType,
          content: summary.content,
          startTs: summary.startTs,
          endTs: summary.endTs,
          createdAt: summary.createdAt
        }));
    } catch (error) {
      this.logWarning('Failed to load vault summaries from VaultStore', error);
      return [];
    }
  }

  private async loadVaultStats(): Promise<ZenMemoryContext['vaultStats'] | undefined> {
    try {
      // Query VaultStore for statistics
      const stats = await this.vaultStore.getStats();

      // VaultStore.getStats() returns the exact format needed
      return stats;
    } catch (error) {
      this.logWarning('Failed to load vault statistics from VaultStore', error);
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
    return 'zen';
  }

  private formatConstructName(constructId: string): string {
    return constructId
      .replace(/-\d{3,}$/i, '')
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Zen';
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
      console.warn(`[ZenMemoryOrchestrator] ${message}`, error);
    }
  }

  private noteIfMissing(note: string): void {
    this.availabilityNotes.push(note);
  }
}
