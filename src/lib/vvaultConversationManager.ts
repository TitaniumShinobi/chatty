// VVAULT-Exclusive Conversation Management System
// Handles all conversation storage through VVAULT connector

import { type User, getUserId } from './auth'
import type { CharacterProfile } from '../engine/character/types';

export interface ConversationThread {
  id: string;
  title: string;
  messages: any[];
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
  constructId?: string | null;
  runtimeId?: string | null;
  isPrimary?: boolean;
  isCanonical?: boolean;
  canonicalForRuntime?: string | null;
  importMetadata?: Record<string, any> | null;
}

export interface VVAULTConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface VVAULTConversationRecord {
  sessionId: string;
  title: string;
  messages: VVAULTConversationMessage[];
  constructId?: string | null;
  runtimeId?: string | null;
  constructFolder?: string | null;
  importMetadata?: Record<string, any> | null;
  isPrimary?: boolean;
  sourcePath?: string;
  userId?: string | null;
}

export class VVAULTConversationManager {
  private static instance: VVAULTConversationManager
  // Request deduplication: cache in-flight requests to prevent duplicate API calls
  private static inFlightRequests = new Map<string, Promise<any>>();
  // Browser request deduplication: prevent duplicate HTTP calls
  private static inFlightBrowserRequests = new Map<string, Promise<any>>();
  private vvaultConnector: any = null;
  private browserEndpointBase = '/api/vvault';
  private characterProfiles = new Map<string, CharacterProfile>();
  
  static getInstance(): VVAULTConversationManager {
    if (!VVAULTConversationManager.instance) {
      VVAULTConversationManager.instance = new VVAULTConversationManager();
    }
    return VVAULTConversationManager.instance;
  }

  private isBrowserEnv(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  private async browserRequest<T = any>(path: string, options?: RequestInit, retryCount = 0): Promise<T> {
    const MAX_RETRIES = 2; // Limit retries to prevent spam
    const RETRY_DELAY = 500; // 500ms delay between retries
    
    // Create cache key for request deduplication (GET requests only, POST/PUT/DELETE are not deduplicated)
    const method = options?.method || 'GET';
    const cacheKey = method === 'GET' ? `browserRequest:${method}:${path}` : null;
    
    // Deduplicate GET requests
    if (cacheKey && VVAULTConversationManager.inFlightBrowserRequests.has(cacheKey)) {
      console.log(`🔄 [VVAULT] Deduplicating browserRequest: ${method} ${path}`);
      return VVAULTConversationManager.inFlightBrowserRequests.get(cacheKey)!;
    }
    
    console.log(`🌐 [VVAULT] browserRequest ${path} ${method}`);
    
    // Create the request promise
    const requestPromise = (async (): Promise<T> => {
      try {
        const response = await fetch(`${this.browserEndpointBase}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {})
      },
      ...options
    });

      // Handle 503 Service Unavailable (backend not ready)
      if (response.status === 503 && retryCount < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '1') * 1000;
        console.log(`⏳ [VVAULT] Backend not ready (503), retrying in ${retryAfter}ms... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        return this.browserRequest<T>(path, options, retryCount + 1);
      }

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const errorText = await response.text();
        
        // Check if response is HTML (404 page) instead of JSON
        if (contentType.includes('text/html') || errorText.trim().startsWith('<!')) {
          console.error(`❌ [VVAULT] browserRequest HTTP error ${path}: ${response.status} ${response.statusText}`);
          console.error(`❌ [VVAULT] Backend returned HTML instead of JSON - route may not exist`);
          throw new Error(`VVAULT API error: ${response.status} ${response.statusText} - Backend route not found. Check if backend server is running on port 5000.`);
        }
        
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.details || errorJson.error || errorText;
        } catch {
          // Keep original errorText if not JSON
        }
        console.error(`❌ [VVAULT] browserRequest HTTP error ${path}: ${response.status} ${response.statusText}`);
        console.error(`❌ [VVAULT] Error details:`, errorDetails);
        const errorMessage = `VVAULT API error: ${response.status} ${response.statusText}${errorDetails ? ` - ${errorDetails}` : ''}`;
        throw new Error(errorMessage);
      }

      const data = await response.json().catch((e) => {
        console.error(`❌ [VVAULT] Failed to parse JSON response from ${path}:`, e);
        return { ok: false, error: 'Invalid JSON response' };
      });
      
      if (data?.ok === false) {
        const message = data?.error || 'VVAULT request failed';
      console.error(`❌ [VVAULT] browserRequest failed ${path}:`, message);
      throw new Error(message);
    }
      
    return data;
    } catch (error) {
      // Check if it's a connection error and we haven't exceeded retries
      const isConnectionError = 
        error instanceof TypeError && 
        (error.message.includes('Failed to fetch') || 
         error.message.includes('ECONNREFUSED') ||
         error.message.includes('NetworkError'));
      
      if (isConnectionError && retryCount < MAX_RETRIES) {
        console.log(`⏳ [VVAULT] Connection error, retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return this.browserRequest<T>(path, options, retryCount + 1);
      }
      
      console.error(`❌ [VVAULT] browserRequest exception ${path}:`, error);
      throw error;
    } finally {
      // Remove from cache after request completes (success or failure)
      if (cacheKey) {
        VVAULTConversationManager.inFlightBrowserRequests.delete(cacheKey);
      }
    }
    })();
    
    // Cache the promise for GET requests
    if (cacheKey) {
      VVAULTConversationManager.inFlightBrowserRequests.set(cacheKey, requestPromise);
    }
    
    return requestPromise;
  }

  /**
   * Initialize VVAULT connector
   */
  private async initializeVVAULT(): Promise<void> {
    if (this.vvaultConnector || this.isBrowserEnv()) return;
    
    try {
      const { VVAULTConnector } = await import('../../vvaultConnector/index.js');
      this.vvaultConnector = new VVAULTConnector();
      await this.vvaultConnector.initialize();
      console.log('✅ VVAULT Connector initialized for conversation management');
    } catch (error) {
      console.error('❌ Failed to initialize VVAULT connector:', error);
      throw new Error('VVAULT storage unavailable');
    }
  }

  /**
   * Create a new conversation for a user. Supports both auto-generated session IDs and explicit IDs.
   */
  async createConversation(
    userId: string,
    sessionOrTitle: string,
    titleOverride?: string,
    constructId: string  // Required - no default, must be determined by orchestration
  ): Promise<ConversationThread> {
    await this.initializeVVAULT();

    const hasExplicitSessionId = typeof titleOverride === 'string' && titleOverride.length > 0;
    const sessionId = hasExplicitSessionId
      ? sessionOrTitle
      : `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const title = hasExplicitSessionId
      ? titleOverride!.trim() || 'Synth'
      : sessionOrTitle?.trim?.() || 'Synth';

    try {
      if (this.isBrowserEnv()) {
        const payload: Record<string, any> = { title, constructId };
        if (hasExplicitSessionId) {
          payload.sessionId = sessionId;
        }
        const response = await this.browserRequest<{ conversation: { sessionId: string; title: string } }>('/conversations', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        console.log(`✅ Created new conversation via VVAULT API: ${response.conversation.sessionId}`);
      } else {
        const timestamp = new Date().toISOString();
        const constructDescriptor = this.resolveConstructDescriptor(sessionId, { constructId });
        await this.vvaultConnector.writeTranscript({
          userId,
          sessionId,
          timestamp,
          role: 'system',
          content: `CONVERSATION_CREATED:${title}`,
          title,
          constructId: constructDescriptor.constructId,
          constructName: constructDescriptor.constructName,
          constructCallsign: constructDescriptor.constructCallsign
        });
        console.log(`✅ Created new conversation via VVAULT: ${title} (${sessionId})`);
      }

      return {
        id: sessionId,
        title,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archived: false
      };
    } catch (error) {
      console.error('❌ Failed to create conversation in VVAULT:', error);
      throw error;
    }
  }

  /**
   * Directly read raw conversations from VVAULT storage.
   */
  async readConversations(userId: string, constructId = 'nova-001'): Promise<VVAULTConversationRecord[]> {
    await this.initializeVVAULT();

    if (this.isBrowserEnv()) {
      console.log(`📬 [VVAULT] Fetching conversations for ${userId} via API`);
      const data = await this.browserRequest<{ conversations: VVAULTConversationRecord[] }>('/conversations', {
        method: 'GET'
      });
      console.log(`📬 [VVAULT] API returned ${data?.conversations?.length ?? 0} conversations`);
      return data.conversations || [];
    }

    if (typeof this.vvaultConnector?.readConversations === 'function') {
      return this.vvaultConnector.readConversations(userId, constructId);
    }

    const module = await import('../../vvaultConnector/readConversations.js') as {
      readConversations: (userId: string, constructId?: string) => Promise<VVAULTConversationRecord[]>;
    };
    return module.readConversations(userId, constructId);
  }

  /**
   * Load all conversations for a user using VVAULT filesystem as source of truth.
   * Uses request deduplication to prevent concurrent duplicate API calls.
   */
  async loadAllConversations(userId: string): Promise<VVAULTConversationRecord[]> {
    const cacheKey = `loadAllConversations:${userId}`;
    
    // Check if there's already an in-flight request for this userId
    if (VVAULTConversationManager.inFlightRequests.has(cacheKey)) {
      console.log(`🔄 [VVAULTConversationManager] Deduplicating request for userId: ${userId}`);
      return VVAULTConversationManager.inFlightRequests.get(cacheKey)!;
    }
    
    // Create the request promise
    const requestPromise = (async () => {
      try {
        // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: User ID is REQUIRED, no fallback searches
        if (!userId) {
          throw new Error('User ID is required. Cannot load conversations without user identity.');
        }
        
        const conversations = await this.readConversations(userId);
        
        console.log(`📚 Loaded ${conversations.length} conversations from VVAULT for user ${userId}`);
        return conversations;
      } catch (error) {
        console.error('❌ Failed to load conversations from VVAULT:', error);
        return [];
      } finally {
        // Remove from cache after request completes (success or failure)
        VVAULTConversationManager.inFlightRequests.delete(cacheKey);
      }
    })();
    
    // Cache the promise
    VVAULTConversationManager.inFlightRequests.set(cacheKey, requestPromise);
    
    return requestPromise;
  }

  /**
   * Load construct character profile from VVAULT.
   */
  async loadCharacterProfile(constructId: string, callsign = '001'): Promise<CharacterProfile | null> {
    await this.initializeVVAULT();
    const cacheKey = `${constructId}:${callsign}`;
    if (this.characterProfiles.has(cacheKey)) {
      return this.characterProfiles.get(cacheKey)!;
    }

    try {
      let profile: CharacterProfile | null = null;
      if (this.isBrowserEnv()) {
        const params = new URLSearchParams({
          constructId,
          callsign
        });
        const response = await this.browserRequest<{ profile?: CharacterProfile }>(
          `/character-context?${params.toString()}`,
          { method: 'GET' }
        );
        profile = response?.profile ?? null;
      } else {
        const module = await import('../../vvaultConnector/readCharacterProfile.js') as {
          readCharacterProfile: (constructId: string, callsign?: string | number) => Promise<CharacterProfile | null>;
        };
        profile = await module.readCharacterProfile(constructId, callsign);
      }

      if (profile) {
        this.characterProfiles.set(cacheKey, profile);
        return profile;
      }
    } catch (error) {
      console.error('❌ Failed to load character profile from VVAULT:', error);
    }
    return null;
  }

  /**
   * Load relevant identity/memories for a construct from ChromaDB.
   * Queries ChromaDB for identity/memories related to the given query text.
   * @param userId - Chatty user ID (will be resolved to VVAULT format)
   * @param constructCallsign - Construct-callsign (e.g., "luna-001")
   * @param query - Query text to find relevant identity/memories
   * @param limit - Maximum number of identity/memories to return (default: 10)
   * @returns Array of relevant identity/memories formatted for prompt injection
   */
  async loadMemoriesForConstruct(
    userId: string,
    constructCallsign: string,
    query: string,
    limit: number = 10
  ): Promise<Array<{ context: string; response: string; timestamp: string; relevance: number }>> {
    try {
      if (this.isBrowserEnv()) {
        // Query identity via API
        const params = new URLSearchParams({
          constructCallsign,
          query,
          limit: limit.toString()
        });
        
        const response = await this.browserRequest<{ memories: Array<{ context: string; response: string; timestamp: string; relevance: number }> }>(
          `/identity/query?${params.toString()}`,
          { method: 'GET' }
        );
        
        return response?.memories || [];
      } else {
        // Server-side: directly use identityService
        const { getIdentityService } = await import('../../server/services/identityService.js');
        const identityService = getIdentityService();
        return await identityService.queryIdentities(userId, constructCallsign, query, limit);
      }
    } catch (error) {
      console.error('❌ Failed to load identity for construct:', error);
      // Return empty array on error (don't break conversation flow)
      return [];
    }
  }

  /**
   * Alias for backward compatibility
   */
  async loadIdentityForConstruct(
    userId: string,
    constructCallsign: string,
    query: string,
    limit: number = 10
  ): Promise<Array<{ context: string; response: string; timestamp: string; relevance: number }>> {
    return this.loadMemoriesForConstruct(userId, constructCallsign, query, limit);
  }

  /**
   * Load all conversations for a user from VVAULT
   */
  async loadUserConversations(user: User): Promise<ConversationThread[]> {
    try {
      await this.initializeVVAULT();
      const userId = getUserId(user);
      const convs = await this.readConversations(userId);
      const mapped = convs.map(conv => ({
        id: conv.sessionId,
        title: conv.title || 'Synth',
        messages: conv.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp).getTime()
        })),
        createdAt: conv.messages.length ? new Date(conv.messages[0].timestamp).getTime() : Date.now(),
        updatedAt: conv.messages.length ? new Date(conv.messages[conv.messages.length - 1].timestamp).getTime() : Date.now(),
        archived: false
      }));

      mapped.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      console.log(`✅ Loaded ${mapped.length} conversations from VVAULT for user: ${user.email}`);
      return mapped;
      
    } catch (error) {
      console.error(`❌ Failed to load conversations from VVAULT for user ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Save a conversation thread to VVAULT
   */
  async saveConversationThread(user: User, thread: ConversationThread): Promise<void> {
    try {
      await this.initializeVVAULT();
      if (this.isBrowserEnv()) {
        console.log('ℹ️ Skipping saveConversationThread in browser - messages saved incrementally');
        return;
      }
      const userId = getUserId(user);
      
      console.log(`📝 Saving conversation ${thread.id} to VVAULT for user: ${user.email} (ID: ${userId})`);
      
      // Save each message in the thread to VVAULT
      for (const message of thread.messages) {
        const timestamp = new Date(message.timestamp || Date.now()).toISOString();
        const contentPayload = this.normalizeMessageContent(message);
        const construct = this.resolveConstructDescriptor(thread.id, message.metadata);
        
        await this.vvaultConnector.writeTranscript({
          userId: userId,
          sessionId: thread.id,
          timestamp: timestamp,
          role: message.role,
          content: contentPayload,
          constructId: construct.constructId,
          constructName: construct.constructName,
          constructCallsign: construct.constructCallsign
        });
      }
      
      console.log(`✅ Saved conversation ${thread.id} to VVAULT for user: ${user.email}`);
      
    } catch (error) {
      console.error(`❌ Failed to save conversation ${thread.id} to VVAULT for user ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Save all user conversations to VVAULT
   */
  async saveUserConversations(user: User, threads: ConversationThread[]): Promise<void> {
    try {
      await this.initializeVVAULT();
      if (this.isBrowserEnv()) {
        console.log('ℹ️ Skipping bulk saveUserConversations in browser');
        return;
      }
      const userId = getUserId(user);
      
      console.log(`💾 Saving ${threads.length} conversations to VVAULT for user: ${user.email} (ID: ${userId})`);
      
      for (const thread of threads) {
        await this.saveConversationThread(user, thread);
      }
      
      console.log(`✅ Saved all conversations to VVAULT for user: ${user.email}`);
      
    } catch (error) {
      console.error(`❌ Failed to save conversations to VVAULT for user ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Add a message to a conversation in VVAULT
   */
  async addMessageToConversation(user: User, threadId: string, message: any): Promise<void> {
    try {
      console.log('💾 [VVAULTConversationManager] Saving message to VVAULT...');
      console.log('📝 [VVAULTConversationManager] ThreadId:', threadId);
      console.log('📝 [VVAULTConversationManager] Role:', message.role);

      const userId = getUserId(user);
      if (!userId) {
        throw new Error('Missing user identifier for VVAULT write');
      }

      // Browser environment: route through API
      if (this.isBrowserEnv()) {
        console.log('🌐 [VVAULTConversationManager] Browser environment - routing through API');
        const constructDescriptor = this.resolveConstructDescriptor(threadId, message.metadata);
        
        const normalizedContent = this.normalizeMessageContent(message);
        if (!normalizedContent || normalizedContent.trim() === '') {
          console.warn('⚠️ [VVAULTConversationManager] Empty content after normalization, skipping save');
          return;
        }
        
        const response = await this.browserRequest(`/conversations/${threadId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: message.role,
            content: normalizedContent,
            packets: message.packets, // Include packets as fallback for server-side extraction
            timestamp: message.timestamp || new Date().toISOString(),
            title: message.title,
            constructId: constructDescriptor.constructId,
            constructName: constructDescriptor.constructName,
            constructCallsign: constructDescriptor.constructCallsign,
            metadata: { ...message.metadata, constructCallsign: constructDescriptor.constructCallsign }
          })
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Failed to save message via API: ${response.statusText} - ${errorText}`);
        }

        console.log('✅ [VVAULTConversationManager] Message saved via API');
        return;
      }

      // Node.js environment: use direct file system access
      // Per SYNTH_PRIMARY_CONSTRUCT_RUBRIC.md: Synth is the primary construct of Chatty
      // Default to Synth (primary construct) when unspecified
      // Use resolveConstructDescriptor to ensure proper primary construct assignment
      const constructDescriptor = this.resolveConstructDescriptor(threadId, message.metadata);
      const constructId = constructDescriptor.constructId; // Defaults to 'synth' (primary)
      
      // Extract callsign from threadId or use default
      // Format: synth-001, lin-001, primary_1234567890 → callsign 1
      const callsignMatch = typeof threadId === 'string' ? threadId.match(/-(\d{3,})$/) : null;
      const callsign = callsignMatch ? parseInt(callsignMatch[1], 10) : 1;

      console.log('🏷️  [VVAULTConversationManager] Construct:', constructId, 'Callsign:', callsign);

      // Use constructCallsign from descriptor if available, otherwise construct from constructId + callsign
      const constructCallsign = constructDescriptor.constructCallsign || `${constructId}-${String(callsign).padStart(3, '0')}`;

      const transcriptModule = await import('../../vvaultConnector/writeTranscript.js');
      const filepath = await transcriptModule.appendToConstructTranscript(
        constructId,
        callsign,
        message.role,
        this.normalizeMessageContent(message),
        {
          userId,
          userName: user.name || user.email || 'User',
          timestamp: message.timestamp || new Date().toISOString(),
          title: message.title,
          constructCallsign,
          ...message.metadata
        }
      );

      console.log('✅ [VVAULTConversationManager] Saved to:', filepath);
    } catch (error) {
      console.error('❌ [VVAULTConversationManager] CRITICAL: Failed to save message:', error);
      throw error;
    }
  }

  /**
   * Ensure the user has a dedicated Synth conversation. Creates one if missing.
   * This is the ONLY place that should create conversations with 'synth' constructId.
   */
  async ensureFreshSynthConversation(user: User): Promise<ConversationThread> {
    await this.initializeVVAULT();
    const userId = getUserId(user);

    console.log(`🔎 Ensuring Synth conversation exists for user: ${user.email} (ID: ${userId})`);

    const records = await this.readConversations(userId);
    const synthRecord = records.find(record => {
      const normalizedTitle = record.title?.trim().toLowerCase();
      return normalizedTitle === 'synth' || record.sessionId.startsWith('synth');
    });

    if (synthRecord) {
      console.log(`🔁 Found existing Synth conversation: ${synthRecord.sessionId}`);
      return {
        id: synthRecord.sessionId,
        title: synthRecord.title || 'Synth',
        messages: synthRecord.messages,
        createdAt: synthRecord.messages.length ? new Date(synthRecord.messages[0].timestamp).getTime() : Date.now(),
        updatedAt: synthRecord.messages.length ? new Date(synthRecord.messages[synthRecord.messages.length - 1].timestamp).getTime() : Date.now(),
        archived: false,
      };
    }

    console.log(`✨ Creating new Synth conversation for user ${userId}`);
    // Explicitly use 'synth' for Synth conversations only
    return await this.createConversation(userId, 'Synth', undefined, 'synth');
  }

  /**
   * Delete a conversation from VVAULT
   */
  async deleteConversation(user: User, threadId: string): Promise<void> {
    try {
      await this.initializeVVAULT();
      const userId = getUserId(user);
      
      console.log(`🗑️ Deleting conversation ${threadId} from VVAULT for user: ${user.email} (ID: ${userId})`);
      
      // Note: VVAULT uses append-only storage, so we can't actually delete files
      // Instead, we'll mark the conversation as deleted by writing a deletion marker
      const timestamp = new Date().toISOString();
      const construct = this.resolveConstructDescriptor(threadId);
      
      await this.vvaultConnector.writeTranscript({
        userId: userId,
        sessionId: threadId,
        timestamp: timestamp,
        role: 'system',
        content: `CONVERSATION_DELETED:${timestamp}`,
        constructId: construct.constructId,
        constructName: construct.constructName,
        constructCallsign: construct.constructCallsign
      });
      
      console.log(`✅ Marked conversation ${threadId} as deleted in VVAULT for user: ${user.email}`);
      
    } catch (error) {
      console.error(`❌ Failed to delete conversation ${threadId} from VVAULT for user ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Clear all user data from VVAULT
   */
  async clearUserData(userId: string): Promise<void> {
    try {
      await this.initializeVVAULT();
      
      console.log(`🗑️ Clearing all data from VVAULT for user: ${userId}`);
      
      const records = await this.readConversations(userId);
      
      for (const record of records) {
        const timestamp = new Date().toISOString();
        const construct = this.resolveConstructDescriptor(record.sessionId);
        
        await this.vvaultConnector.writeTranscript({
          userId: userId,
          sessionId: record.sessionId,
          timestamp: timestamp,
          role: 'system',
          content: `USER_DATA_CLEARED:${timestamp}`,
          constructId: construct.constructId,
          constructName: construct.constructName,
          constructCallsign: construct.constructCallsign
        });
      }
      
      console.log(`✅ Cleared all data from VVAULT for user: ${userId}`);
      
    } catch (error) {
      console.error(`❌ Failed to clear data from VVAULT for user ${userId}:`, error);
      throw error;
    }
  }

  private resolveConstructDescriptor(threadId: string, metadata?: any): { constructId: string; constructName: string; constructCallsign?: string } {
    // Per SYNTH_PRIMARY_CONSTRUCT_RUBRIC.md: Synth is the primary construct of Chatty
    // Default to Synth when unspecified or ambiguous
    const explicit = (metadata?.constructId || metadata?.construct) as string | undefined;
    const explicitCallsign = (metadata?.constructCallsign) as string | undefined;
    const extracted = this.extractConstructIdFromThread(threadId);
    
    // PRIORITY 1: Use constructCallsign from metadata if available (e.g., "katana-001")
    if (explicitCallsign) {
      const callsignMatch = explicitCallsign.match(/^([a-z-]+)-(\d+)$/);
      if (callsignMatch) {
        return {
          constructId: callsignMatch[1],
          constructName: this.toTitleCase(callsignMatch[1]),
          constructCallsign: explicitCallsign
        };
      }
    }
    
    // Check if explicitly synth (primary construct)
    const isExplicitSynth = explicit?.toLowerCase() === 'synth' || 
                             explicit?.toLowerCase()?.startsWith('synth-') ||
                             extracted?.toLowerCase() === 'synth' ||
                             extracted?.toLowerCase()?.startsWith('synth-') ||
                             threadId.toLowerCase().includes('synth') ||
                             (metadata?.title && (metadata.title as string).toLowerCase().includes('synth'));
    
    if (isExplicitSynth) {
      // Preserve callsign if present in threadId or explicit constructId
      // e.g., "synth-001_chat_with_synth-001" → "synth-001"
      let constructId = 'synth';
      let constructCallsign: string | undefined = undefined;
      if (extracted && extracted.startsWith('synth-')) {
        constructId = extracted; // e.g., "synth-001"
        constructCallsign = extracted;
      } else if (explicit && explicit.startsWith('synth-')) {
        constructId = explicit; // e.g., "synth-001"
        constructCallsign = explicit;
      } else if (threadId.match(/synth-\d{3}/i)) {
        const match = threadId.match(/(synth-\d{3})/i);
        if (match) {
          constructId = match[1].toLowerCase(); // e.g., "synth-001"
          constructCallsign = constructId;
        }
      }
      return { constructId, constructName: 'Synth', constructCallsign };
    }
    
    // If explicit other construct → use that construct (secondary)
    if (explicit && explicit.toLowerCase() !== 'synth' && !explicit.toLowerCase().startsWith('synth-')) {
      const constructId = explicit.toLowerCase();
      // Check if explicit has callsign format
      const callsignMatch = explicit.match(/^([a-z-]+)-(\d+)$/);
      const constructCallsign = callsignMatch ? explicit : undefined;
      return { 
        constructId, 
        constructName: metadata?.constructName || this.toTitleCase(constructId),
        constructCallsign
      };
    }
    
    // If extracted has callsign format (e.g., "katana-001"), use it
    if (extracted && extracted.match(/^[a-z-]+-\d{3,}$/)) {
      const callsignMatch = extracted.match(/^([a-z-]+)-(\d+)$/);
      if (callsignMatch) {
        return {
          constructId: callsignMatch[1],
          constructName: this.toTitleCase(callsignMatch[1]),
          constructCallsign: extracted
        };
      }
    }
    
    // Default to Synth (primary construct) when unspecified or ambiguous
    // Try to preserve callsign from threadId if present
    let defaultConstructId = 'synth';
    let defaultCallsign: string | undefined = undefined;
    if (threadId.match(/synth-\d{3}/i)) {
      const match = threadId.match(/(synth-\d{3})/i);
      if (match) {
        defaultConstructId = match[1].toLowerCase();
        defaultCallsign = defaultConstructId;
      }
    }
    return { constructId: defaultConstructId, constructName: 'Synth', constructCallsign: defaultCallsign };
  }

  private extractConstructIdFromThread(threadId?: string): string | null {
    if (!threadId) return null;
    const match = threadId.match(/^([a-z0-9-]+)/i);
    if (!match) return null;
    const candidate = match[1].toLowerCase();
    if (candidate === 'session') {
      return null;
    }
    return candidate;
  }

  private toTitleCase(value: string): string {
    const normalized = (value || 'synth').replace(/-\d{3,}$/i, '');
    return normalized
      .split(/[-_]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Synth';
  }

  /**
   * Convert various message formats into a string payload for VVAULT storage.
   * Supports packet-based assistant messages as well as legacy text formats.
   */
  private normalizeMessageContent(message: any): string {
    if (!message) return '';

    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.packets)) {
      const rendered = message.packets
        .map(packet => {
          if (!packet) return '';
          if (packet.op === 'answer.v1' && packet.payload?.content) {
            return packet.payload.content;
          }
          try {
            return JSON.stringify(packet.payload ?? packet);
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .join('\n\n');
      if (rendered) {
        return rendered;
      }
    }

    if (Array.isArray(message.content)) {
      const rendered = message.content
        .map((entry: any) => {
          if (!entry) return '';
          if (typeof entry === 'string') {
            return entry;
          }
          if (entry?.payload?.content) {
            return entry.payload.content;
          }
          try {
            return JSON.stringify(entry);
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .join('\n\n');
      if (rendered) {
        return rendered;
      }
    }

    if (typeof message.text === 'string') {
      return message.text;
    }

    return '';
  }

  /**
   * Get conversation title for markdown file
   */
  private async getConversationTitle(user: User, threadId: string): Promise<string> {
    try {
      const sessions = await this.vvaultConnector.getUserSessions(getUserId(user));
      const session = sessions.find((s: any) => s.sessionId === threadId);
      
      if (session?.title) {
        return session.title;
      }
      
      // Try to get title from first user message
      const transcripts = await this.vvaultConnector.getSessionTranscripts(getUserId(user), threadId);
      const firstUserMessage = transcripts.find((t: any) => t.role === 'user');
      if (firstUserMessage?.content) {
        return firstUserMessage.content.slice(0, 50) || 'Untitled conversation';
      }
      
      return 'Untitled conversation';
    } catch {
      return 'Untitled conversation';
    }
  }

  /**
   * Health check for VVAULT storage
   */
  async healthCheck(): Promise<{ status: string; error?: string }> {
    try {
      await this.initializeVVAULT();
      const health = await this.vvaultConnector.healthCheck();
      return health;
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get conversation statistics from VVAULT
   */
  async getConversationStats(user: User): Promise<{ totalConversations: number; totalMessages: number; lastActivity: Date | null }> {
    try {
      await this.initializeVVAULT();
      const userId = getUserId(user);
      
      const sessions = await this.vvaultConnector.getUserSessions(userId);
      
      let totalMessages = 0;
      let lastActivity: Date | null = null;
      
      for (const session of sessions) {
        const transcripts = await this.vvaultConnector.getSessionTranscripts(userId, session.sessionId);
        totalMessages += transcripts.length;
        
        if (session.lastModified && (!lastActivity || session.lastModified > lastActivity)) {
          lastActivity = session.lastModified;
        }
      }
      
      return {
        totalConversations: sessions.length,
        totalMessages: totalMessages,
        lastActivity: lastActivity
      };
      
    } catch (error) {
      console.error(`❌ Failed to get conversation stats for user ${user.email}:`, error);
      return {
        totalConversations: 0,
        totalMessages: 0,
        lastActivity: null
      };
    }
  }
}
