// VVAULT-Exclusive Conversation Management System
// Handles all conversation storage through VVAULT connector

import { type User, getUserId } from './auth'
import type { CharacterProfile } from '../engine/character/types';
import {
  normalizeConversationHydrationResponse,
  type VvaultConversationCollectionResponse,
} from './vvaultConversationHydration';

export type VvaultTranscriptExportFormat = 'md' | 'pdf' | 'docx';

export interface VvaultConversationExportResponse {
  blob: Blob;
  filename: string;
  contentType: string;
}

export interface VvaultConversationTranscriptResponse {
  ok?: boolean;
  content?: string;
  messages?: VVAULTConversationMessage[];
  source?: string;
}

export interface VVAULTConversationIndexRecord {
  id: string;
  title: string;
  constructId?: string | null;
  updatedAt?: string | number | null;
  lastMessageAt?: string | number | null;
  messageCount?: number;
  messages?: Array<{
    id?: string;
    role?: 'user' | 'assistant' | 'system';
    content?: string;
    text?: string;
    timestamp?: string | number | null;
  }>;
}

export type VvaultFrontendFailureClassification =
  | 'auth-needed'
  | 'bridge-misconfigured'
  | 'unreachable';

export interface VvaultFrontendFailureInfo {
  classification: VvaultFrontendFailureClassification;
  message: string;
  status?: number;
  path?: string;
}

export interface VvaultSessionState {
  ready?: boolean;
  reason?: string | null;
  authSource?: string | null;
}

type VvaultClassifiedError = Error & {
  vvaultFailure?: VvaultFrontendFailureInfo;
};

const ZEN_CANONICAL_CONSTRUCT_ID = 'zen-001';
const ZEN_CANONICAL_SESSION_ID = `${ZEN_CANONICAL_CONSTRUCT_ID}_chat_with_${ZEN_CANONICAL_CONSTRUCT_ID}`;

function normalizeZenConstructId(constructId: string | null | undefined): string {
  const normalized = typeof constructId === 'string' ? constructId.trim().toLowerCase() : '';
  if (normalized === 'zen' || normalized === ZEN_CANONICAL_CONSTRUCT_ID) {
    return ZEN_CANONICAL_CONSTRUCT_ID;
  }
  return normalized || 'zen';
}

function shouldNormalizeToCanonicalZenSession({
  constructId,
  sessionId,
  title,
  hasExplicitSessionId,
}: {
  constructId: string | null | undefined;
  sessionId: string | null | undefined;
  title: string | null | undefined;
  hasExplicitSessionId: boolean;
}): boolean {
  if (normalizeZenConstructId(constructId) !== ZEN_CANONICAL_CONSTRUCT_ID) {
    return false;
  }

  if (!hasExplicitSessionId) {
    return true;
  }

  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim().toLowerCase() : '';
  const normalizedTitle = typeof title === 'string' ? title.trim().toLowerCase() : '';

  return (
    !normalizedSessionId ||
    normalizedSessionId === 'zen' ||
    normalizedSessionId === ZEN_CANONICAL_CONSTRUCT_ID ||
    normalizedSessionId === ZEN_CANONICAL_SESSION_ID ||
    normalizedSessionId.startsWith('zen_') ||
    (normalizedSessionId.startsWith('zen-') && !normalizedSessionId.includes('_chat_with_')) ||
    normalizedTitle === 'zen'
  );
}

function isVvaultUnreachableMessage(message: string): boolean {
  return (
    message.includes('ERR_CONNECTION_REFUSED') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ERR_CONNECTION_RESET') ||
    message.includes('ERR_EMPTY_RESPONSE') ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('timed out') ||
    message.includes('Bad Gateway') ||
    message.includes('Gateway Timeout') ||
    message.includes('proxy error') ||
    message.includes('upstream') ||
    message.includes('socket hang up') ||
    message.includes('Backend route not found') ||
    message.includes('ENOENT')
  );
}

function inferVvaultFrontendFailureInfo(
  status: number | undefined,
  message: string,
  path?: string,
  errorCode?: string,
): VvaultFrontendFailureInfo | null {
  const normalizedErrorCode =
    typeof errorCode === 'string' && errorCode.trim()
      ? errorCode.trim().toUpperCase()
      : null;

  if (status === 401 || normalizedErrorCode === 'AUTH_REQUIRED') {
    return {
      classification: 'auth-needed',
      message,
      status,
      path,
    };
  }

  if (normalizedErrorCode === 'AUTH_BRIDGE_MISCONFIGURED') {
    return {
      classification: 'bridge-misconfigured',
      message,
      status,
      path,
    };
  }

  if (normalizedErrorCode === 'VVAULT_UNREACHABLE' || isVvaultUnreachableMessage(message)) {
    return {
      classification: 'unreachable',
      message,
      status,
      path,
    };
  }

  return null;
}

function createVvaultClassifiedError(
  message: string,
  failure: VvaultFrontendFailureInfo,
): VvaultClassifiedError {
  const error = new Error(message) as VvaultClassifiedError;
  error.vvaultFailure = failure;
  return error;
}

export function getVvaultFrontendFailureInfo(error: unknown): VvaultFrontendFailureInfo | null {
  const classified = (error as VvaultClassifiedError | null | undefined)?.vvaultFailure;
  if (classified?.classification) {
    return classified;
  }

  const message = error instanceof Error ? error.message : String(error || '');
  const statusMatch = message.match(/VVAULT API error:\s*(\d{3})\b/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  const errorCodeMatch = message.match(
    /\b(AUTH_REQUIRED|AUTH_BRIDGE_MISCONFIGURED|VVAULT_UNREACHABLE)\b/,
  );
  const errorCode = errorCodeMatch?.[1];

  return inferVvaultFrontendFailureInfo(status, message, undefined, errorCode);
}

export function getVvaultFrontendFailureInfoFromSessionState(
  session: VvaultSessionState | null | undefined,
  path = '/api/me',
): VvaultFrontendFailureInfo | null {
  if (!session || session.ready !== false) {
    return null;
  }

  const reason = String(session.reason || '').trim();
  switch (reason) {
    case 'vvault_bridge_unavailable':
    case 'shared_auth_unconfigured':
    case 'shared_auth_unavailable':
    case 'shared_auth_timeout':
    case 'shared_auth_error':
    case 'shared_auth_invalid_payload':
      return {
        classification: 'bridge-misconfigured',
        message: 'Chatty could not reach the shared auth/VVAULT bridge for this session.',
        status: 503,
        path,
      };
    case 'vvault_unreachable':
      return {
        classification: 'unreachable',
        message: 'Chatty could not reach VVAULT for this shared session.',
        status: 502,
        path,
      };
    case 'shared_auth_required':
    case 'shared_auth_unauthenticated':
    case 'shared_auth_identity_unavailable':
    default:
      return {
        classification: 'auth-needed',
        message:
          'You are logged into Chatty, but this browser does not currently have a VVAULT-ready shared session.',
        status: 401,
        path,
      };
  }
}

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
  private debugMode: boolean = false;

  constructor() {
    // Enable debug logs via environment variable (server-side only)
    if (!this.isBrowserEnv() && typeof process !== 'undefined') {
      this.debugMode = process.env.VVAULT_DEBUG_LOG === 'true';
    }
  }

  static getInstance(): VVAULTConversationManager {
    if (!VVAULTConversationManager.instance) {
      VVAULTConversationManager.instance = new VVAULTConversationManager();
    }
    return VVAULTConversationManager.instance;
  }

  private isBrowserEnv(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  private logDebug(message: string, ...args: any[]): void {
    if (this.debugMode) {
      console.log(message, ...args);
    }
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
        const mergedHeaders = new Headers(options?.headers || {});
        if (!mergedHeaders.has('Content-Type') && !mergedHeaders.has('content-type')) {
          mergedHeaders.set('Content-Type', 'application/json');
        }

        const response = await fetch(`${this.browserEndpointBase}${path}`, {
          ...options,
          credentials: 'include',
          headers: mergedHeaders,
        });

        // Handle 503 Service Unavailable (backend not ready)
        if (!response.ok) {
          const contentType = response.headers.get('content-type') || '';
          const errorText = await response.text();
          let errorCode: string | undefined;

          // Check if response is HTML (404 page) instead of JSON
          if (contentType.includes('text/html') || errorText.trim().startsWith('<!')) {
            console.error(`❌ [VVAULT] browserRequest HTTP error ${path}: ${response.status} ${response.statusText}`);
            console.error(`❌ [VVAULT] Backend returned HTML instead of JSON - route may not exist`);
            if (response.status === 401) {
              const message = `VVAULT API error: ${response.status} ${response.statusText} - Authentication required`;
              throw createVvaultClassifiedError(message, {
                classification: 'auth-needed',
                message,
                status: response.status,
                path,
              });
            }

            const message = `VVAULT API error: ${response.status} ${response.statusText} - Backend route not found. Check if the Chatty backend on port 5050 is running and has been restarted since the route change.`;
            throw createVvaultClassifiedError(message, {
              classification: 'unreachable',
              message,
              status: response.status,
              path,
            });
          }

          let errorDetails = errorText;
          try {
            const errorJson = JSON.parse(errorText);
            errorCode =
              typeof errorJson?.errorCode === 'string'
                ? errorJson.errorCode
                : typeof errorJson?.code === 'string'
                  ? errorJson.code
                  : undefined;
            errorDetails = errorJson.details || errorJson.error || errorText;
          } catch {
            // Keep original errorText if not JSON
          }

          if (response.status === 503 && retryCount < MAX_RETRIES && !errorCode) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '1') * 1000;
            console.log(`⏳ [VVAULT] Backend not ready (503), retrying in ${retryAfter}ms... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            return this.browserRequest<T>(path, options, retryCount + 1);
          }

          console.error(`❌ [VVAULT] browserRequest HTTP error ${path}: ${response.status} ${response.statusText}`);
          console.error(`❌ [VVAULT] Error details:`, errorDetails);
          const errorMessage = `VVAULT API error: ${response.status} ${response.statusText}${errorDetails ? ` - ${errorDetails}` : ''}`;
          const classifiedFailure = inferVvaultFrontendFailureInfo(
            response.status,
            errorMessage,
            path,
            errorCode,
          );
          if (classifiedFailure) {
            throw createVvaultClassifiedError(errorMessage, classifiedFailure);
          }
          throw new Error(errorMessage);
        }

        const data = await response.json().catch((e) => {
          console.error(`❌ [VVAULT] Failed to parse JSON response from ${path}:`, e);
          return { ok: false, error: 'Invalid JSON response' };
        });

        if (data?.ok === false) {
          const message = data?.error || 'VVAULT request failed';
          console.error(`❌ [VVAULT] browserRequest failed ${path}:`, message);
          const classifiedFailure = inferVvaultFrontendFailureInfo(
            typeof data?.status === 'number' ? data.status : undefined,
            message,
            path,
            typeof data?.errorCode === 'string' ? data.errorCode : undefined,
          );
          if (classifiedFailure) {
            throw createVvaultClassifiedError(message, classifiedFailure);
          }
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

        if (isConnectionError) {
          if (retryCount < MAX_RETRIES) {
            console.log(
              `⏳ [VVAULT] Connection error, retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`,
            );
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return this.browserRequest<T>(path, options, retryCount + 1);
          }
          const message = error instanceof Error
            ? error.message
            : `VVAULT network failure (${path})`;
          throw createVvaultClassifiedError(message, {
            classification: 'unreachable',
            message,
            path,
          });
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
    const initialSessionId = hasExplicitSessionId
      ? sessionOrTitle
      : `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const initialTitle = hasExplicitSessionId
      ? titleOverride!.trim() || 'Zen'
      : sessionOrTitle?.trim?.() || 'Zen';
    const normalizedConstructId = normalizeZenConstructId(constructId);
    const canonicalZenSession = shouldNormalizeToCanonicalZenSession({
      constructId: normalizedConstructId,
      sessionId: initialSessionId,
      title: initialTitle,
      hasExplicitSessionId,
    });
    const sessionId = canonicalZenSession ? ZEN_CANONICAL_SESSION_ID : initialSessionId;
    const title = canonicalZenSession ? 'Zen' : initialTitle;

    try {
      if (this.isBrowserEnv()) {
        const payload: Record<string, any> = { title, constructId };
        if (hasExplicitSessionId || canonicalZenSession) {
          payload.sessionId = sessionId;
        }
        payload.constructId = normalizedConstructId;
        const response = await this.browserRequest<{ conversation: { sessionId: string; title: string } }>('/conversations', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        console.log(`✅ Created new conversation via VVAULT API: ${response.conversation.sessionId}`);
      } else {
        const timestamp = new Date().toISOString();
        const constructDescriptor = this.resolveConstructDescriptor(sessionId, {
          constructId: normalizedConstructId,
        });
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

    const debugMode = this.debugMode;

    if (this.isBrowserEnv()) {
      if (debugMode) {
        this.logDebug(`📬 [VVAULT] Fetching conversations for ${userId} via API`);
      }
      const data = await this.browserRequest<{ conversations: VVAULTConversationRecord[] }>('/conversations', {
        method: 'GET'
      });
      if (debugMode) {
        this.logDebug(`📬 [VVAULT] API returned ${data?.conversations?.length ?? 0} conversations`);
      }
      return data.conversations || [];
    }

    if (typeof this.vvaultConnector?.readConversations === 'function') {
      if (debugMode) {
        this.logDebug(`📂 [VVAULT] Using vvaultConnector to fetch conversations for ${userId}`);
      }
      return this.vvaultConnector.readConversations(userId, constructId);
    }

    const module = await import('../../vvaultConnector/readConversations.js') as {
      readConversations: (userId: string, constructId?: string) => Promise<VVAULTConversationRecord[]>;
    };
    if (debugMode) {
      this.logDebug(`📂 [VVAULT] Using dynamic import to fetch conversations for ${userId}`);
    }
    return module.readConversations(userId, constructId);
  }

  /**
   * Clear cache for a specific user to force fresh reload
   */
  clearCacheForUser(userId: string): void {
    const cacheKey = `loadAllConversations:${userId}`;
    VVAULTConversationManager.inFlightRequests.delete(cacheKey);
    console.log(`🔄 [VVAULTConversationManager] Cleared cache for userId: ${userId}`);
  }

  /**
   * Load all conversations for a user using VVAULT filesystem as source of truth.
   * Uses request deduplication to prevent concurrent duplicate API calls.
   * @param forceRefresh - If true, bypasses cache and forces fresh load from VVAULT
   */
  async loadAllConversations(userId: string, forceRefresh: boolean = false): Promise<VVAULTConversationRecord[]> {
    const response = await this.loadAllConversationsResponse(userId, forceRefresh);
    return response.conversations;
  }

  async loadAllConversationsResponse(
    userId: string,
    forceRefresh: boolean = false,
  ): Promise<VvaultConversationCollectionResponse<VVAULTConversationRecord>> {
    const cacheKey = `loadAllConversations:${userId}`;

    // If forceRefresh is true, clear cache first
    if (forceRefresh) {
      this.clearCacheForUser(userId);
    }

    // Check if there's already an in-flight request for this userId
    if (!forceRefresh && VVAULTConversationManager.inFlightRequests.has(cacheKey)) {
      this.logDebug(`🔄 [VVAULTConversationManager] Deduplicating request for userId: ${userId}`);
      return VVAULTConversationManager.inFlightRequests.get(cacheKey)!;
    }

    // Create the request promise
    const requestPromise = (async () => {
      try {
        // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: User ID is REQUIRED, no fallback searches
        if (!userId) {
          throw new Error('User ID is required. Cannot load conversations without user identity.');
        }

        if (this.isBrowserEnv()) {
          const payload = await this.browserRequest<
            VvaultConversationCollectionResponse<VVAULTConversationRecord>
          >('/conversations', {
            method: 'GET',
          });
          return normalizeConversationHydrationResponse(payload, 'full');
        }

        const conversations = await this.readConversations(userId);

        this.logDebug(`📚 Loaded ${conversations.length} conversations from VVAULT for user ${userId}`);
        return {
          conversations,
          hydrationSource: 'full' as const,
          hydrationComplete: true,
        };
      } catch (error) {
        console.error('❌ Failed to load conversations from VVAULT:', error);
        if (this.isBrowserEnv()) {
          throw error;
        }
        return {
          conversations: [],
          hydrationSource: 'empty-fallback' as const,
          hydrationComplete: false,
        };
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
   * Load lightweight conversation index (metadata + recent message sample).
   * Intended for startup and non-chat routes where full history is unnecessary.
   */
  async loadConversationIndex(
    userId: string,
  ): Promise<VvaultConversationCollectionResponse<VVAULTConversationIndexRecord>> {
    await this.initializeVVAULT();

    if (!userId) {
      throw new Error('User ID is required. Cannot load conversation index without user identity.');
    }

    if (this.isBrowserEnv()) {
      const payload = await this.browserRequest<
        VvaultConversationCollectionResponse<VVAULTConversationIndexRecord>
      >('/conversations/index', {
        method: 'GET'
      });
      return normalizeConversationHydrationResponse(payload, 'index');
    }

    const conversations = await this.readConversations(userId);
    return {
      conversations: (conversations || []).map((conv) => ({
        id: conv.sessionId,
        title: conv.title || 'Conversation',
        constructId: conv.constructId || conv.constructFolder || null,
        updatedAt: conv.updatedAt || null,
        lastMessageAt: conv.updatedAt || null,
        messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0,
        messages: (conv.messages || []).slice(-5).map((m, idx) => ({
          id: m.id || `${conv.sessionId}_m_${idx}`,
          role: m.role || 'assistant',
          content: m.content || '',
          timestamp: m.timestamp ?? undefined,
        })),
      })),
      hydrationSource: 'index',
      hydrationComplete: false,
    };
  }

  /**
   * Load the canonical transcript for a conversation thread.
   */
  async loadConversationTranscript(
    threadId: string,
  ): Promise<VvaultConversationTranscriptResponse> {
    await this.initializeVVAULT();
    if (this.isBrowserEnv()) {
      return this.browserRequest<VvaultConversationTranscriptResponse>(`/chat/${threadId}`, {
        method: 'GET',
      });
    }

    throw new Error('loadConversationTranscript is supported in browser environment only');
  }

  /**
   * Export a conversation transcript in supported formats.
   */
  async exportConversationTranscript(
    threadId: string,
    format: VvaultTranscriptExportFormat,
  ): Promise<VvaultConversationExportResponse> {
    await this.initializeVVAULT();
    if (this.isBrowserEnv()) {
      const endpoint = `${this.browserEndpointBase}/conversations/${threadId}/export?format=${format}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const status = response.status;
        const contentType = response.headers.get('content-type') || '';
        const errorText = await response.text().catch(() => '');

        if (contentType.includes('text/html') || errorText.trim().startsWith('<!')) {
          if (status === 401) {
            const message = `VVAULT API error: ${status} ${response.statusText} - Authentication required`;
            throw createVvaultClassifiedError(message, {
              classification: 'auth-needed',
              message,
              status,
              path: `/conversations/${threadId}/export?format=${format}`,
            });
          }

          const message = `VVAULT API error: ${status} ${response.statusText} - Backend route not found. Check if the Chatty backend on port 5050 is running and has been restarted since the route change.`;
          throw createVvaultClassifiedError(message, {
            classification: 'unreachable',
            message,
            status,
            path: `/conversations/${threadId}/export?format=${format}`,
          });
        }

        let errorCode: string | undefined;
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorCode =
            typeof errorJson?.errorCode === 'string'
              ? errorJson.errorCode
              : typeof errorJson?.code === 'string'
                ? errorJson.code
                : undefined;
          errorDetails = errorJson.details || errorJson.error || errorText;
        } catch {
          // Keep raw body
        }

        const message = `VVAULT API error: ${status} ${response.statusText}${errorDetails ? ` - ${errorDetails}` : ''}`;
        const classifiedFailure = inferVvaultFrontendFailureInfo(status, message, `/conversations/${threadId}/export?format=${format}`, errorCode);
        if (classifiedFailure) {
          throw createVvaultClassifiedError(message, classifiedFailure);
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const disposition = response.headers.get('content-disposition') || '';
      const filenameMatch = /filename="?([^\";]+)"?/i.exec(disposition);
      return {
        blob,
        filename: filenameMatch?.[1] || `${threadId}.md`,
        contentType,
      };
    }

    throw new Error('exportConversationTranscript is supported in browser environment only');
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
    limit: number = 10,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<Array<{ context: string; response: string; timestamp: string; relevance: number }>> {// Check if memory is allowed
    const { checkMemoryPermission } = await import('./memoryPermission');if (!checkMemoryPermission(settings, 'loadMemoriesForConstruct')) {return []; // Return empty array when memory is disabled
    }

    try {
      if (this.isBrowserEnv()) {// Query identity via API
        const params = new URLSearchParams({
          constructCallsign,
          query,
          limit: limit.toString()
        });

        const response = await this.browserRequest<{ memories: Array<{ context: string; response: string; timestamp: string; relevance: number }> }>(
          `/identity/query?${params.toString()}`,
          { method: 'GET' }
        );return response?.memories || [];
      } else {
        // Server-side path not available in browser bundle
        // Server should use identityService directly, not through this manager
        console.warn('⚠️ [VVAULTConversationManager] Server-side identity query not available in browser build');
        return [];
      }
    } catch (error) {console.error('❌ Failed to load identity for construct:', error);
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
    limit: number = 10,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<Array<{ context: string; response: string; timestamp: string; relevance: number }>> {
    return this.loadMemoriesForConstruct(userId, constructCallsign, query, limit, settings);
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
        title: conv.title || 'Zen',
        messages: conv.messages.map(m => {
          const base: any = {
            id: m.id,
            role: m.role,
            content: m.content,
            text: m.content,
            timestamp: new Date(m.timestamp).getTime()
          };
          if (m.role === 'assistant' && m.content) {
            base.packets = (m as any).packets || [{ op: 'answer.v1', payload: { content: m.content } }];
          }
          return base;
        }),
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
  async addMessageToConversation(user: User, threadId: string, message: any): Promise<unknown> {
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

        // Extract content from packets BEFORE checking if empty
        let normalizedContent = this.normalizeMessageContent(message);

        // If content is still empty, try to extract from packets directly
        if (!normalizedContent || normalizedContent.trim() === '') {
          console.log('📦 [VVAULTConversationManager] Content empty after normalization, extracting from packets...');
          if (Array.isArray(message.packets)) {
            const packetContent = message.packets
              .map(packet => {
                if (!packet) return '';
                if (packet.op === 'answer.v1' && packet.payload?.content) {
                  return packet.payload.content;
                }
                return '';
              })
              .filter(Boolean)
              .join('\n\n');

            if (packetContent) {
              normalizedContent = packetContent;
              message.content = packetContent; // Set content from packets
              console.log(`✅ [VVAULTConversationManager] Extracted content from packets (length: ${packetContent.length})`);
            }
          }
        }

        // Final check - if still empty, log warning but pass packets to backend for extraction
        if (!normalizedContent || normalizedContent.trim() === '') {
          console.warn('⚠️ [VVAULTConversationManager] Empty content, but passing packets to backend for extraction');
          // Don't skip - let backend handle extraction
        } else {
          console.log(`📝 [VVAULTConversationManager] Content ready (length: ${normalizedContent.length})`);
        }

        const response = await this.browserRequest(`/conversations/${threadId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: message.role,
            content: normalizedContent || '', // Pass extracted content or empty (backend will extract from packets)
            packets: message.packets, // Include packets as fallback for server-side extraction
            timestamp: message.timestamp || new Date().toISOString(),
            title: message.title,
            message: {
              id: message.id || message.messageId || message.metadata?.clientMessageId,
              role: message.role,
              content: normalizedContent || message.content || '',
              timestamp: message.timestamp || new Date().toISOString(),
            },
            constructId: constructDescriptor.constructId,
            constructName: constructDescriptor.constructName,
            constructCallsign: constructDescriptor.constructCallsign,
            metadata: { ...message.metadata, constructCallsign: constructDescriptor.constructCallsign }
          })
        });

        console.log('✅ [VVAULTConversationManager] Message saved via API');
        return response;
      }

      // Node.js environment: use direct file system access
      // Per ZEN_PRIMARY_CONSTRUCT_RUBRIC.md: Zen is the primary construct of Chatty
      // Default to Zen (primary construct) when unspecified
      // Use resolveConstructDescriptor to ensure proper primary construct assignment
      const constructDescriptor = this.resolveConstructDescriptor(threadId, message.metadata);
      const constructId = constructDescriptor.constructId; // Defaults to 'zen' (primary)

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
   * Ensure the user has a dedicated Zen conversation. Creates one if missing.
   * This is the ONLY place that should create conversations with 'zen' constructId.
   */
  async ensureFreshZenConversation(user: User): Promise<ConversationThread> {
    await this.initializeVVAULT();
    const userId = getUserId(user);

    console.log(`🔎 Ensuring Zen conversation exists for user: ${user.email} (ID: ${userId})`);

    const records = await this.readConversations(userId);
    const zenRecord = records.find(record => {
      const normalizedTitle = record.title?.trim().toLowerCase();
      return normalizedTitle === 'zen' || record.sessionId.startsWith('zen');
    });

    if (zenRecord) {
      console.log(`🔁 Found existing Zen conversation: ${zenRecord.sessionId}`);
      return {
        id: zenRecord.sessionId,
        title: zenRecord.title || 'Zen',
        messages: zenRecord.messages,
        createdAt: zenRecord.messages.length ? new Date(zenRecord.messages[0].timestamp).getTime() : Date.now(),
        updatedAt: zenRecord.messages.length ? new Date(zenRecord.messages[zenRecord.messages.length - 1].timestamp).getTime() : Date.now(),
        archived: false,
      };
    }

    console.log(`✨ Creating new Zen conversation for user ${userId}`);
    // Explicitly use 'zen' for Zen conversations only
    return await this.createConversation(userId, 'Zen', undefined, 'zen');
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
    // Per ZEN_PRIMARY_CONSTRUCT_RUBRIC.md: Zen is the primary construct of Chatty
    // Default to Zen when unspecified or ambiguous
    const explicit = (metadata?.constructId || metadata?.construct) as string | undefined;
    const explicitCallsign = (metadata?.constructCallsign) as string | undefined;
    const extracted = this.extractConstructIdFromThread(threadId);

    // PRIORITY 1: Use constructCallsign from metadata if available (e.g., "example-construct-001")
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

    // Check if explicitly zen (primary construct)
    const isExplicitZen = explicit?.toLowerCase() === 'zen' ||
      explicit?.toLowerCase()?.startsWith('zen-') ||
      extracted?.toLowerCase() === 'zen' ||
      extracted?.toLowerCase()?.startsWith('zen-') ||
      threadId.toLowerCase().includes('zen') ||
      (metadata?.title && (metadata.title as string).toLowerCase().includes('zen'));

    if (isExplicitZen) {
      // Preserve callsign if present in threadId or explicit constructId
      // e.g., "zen-001_chat_with_zen-001" → "zen-001"
      let constructId = 'zen';
      let constructCallsign: string | undefined = undefined;
      if (extracted && extracted.startsWith('zen-')) {
        constructId = extracted; // e极客时间.g., "zen-001"
        constructCallsign = extracted;
      } else if (explicit && explicit.startsWith('zen-')) {
        constructId = explicit; // e.g., "zen-001"
        constructCallsign = explicit;
      } else if (threadId.match(/zen-\d{3}/i)) {
        const match = threadId.match(/(zen-\d{3})/i);
        if (match) {
          constructId = match[1].toLowerCase(); // e.g., "zen-001"
          constructCallsign = constructId;
        }
      }
      return { constructId, constructName: 'Zen', constructCallsign };
    }

    // If explicit other construct → use that construct (secondary)
    if (explicit && explicit.toLowerCase() !== 'zen' && !explicit.toLowerCase().startsWith('zen-')) {
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

    // If extracted has callsign format (e.g., "example-construct-001"), use it
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

    // Default to Zen (primary construct) when unspecified or ambiguous
    // Try to preserve callsign from threadId if present
    let defaultConstructId = 'zen';
    let defaultCallsign: string | undefined = undefined;
    if (threadId.match(/zen-\d{3}/i)) {
      const match = threadId.match(/(zen-\d{3})/i);
      if (match) {
        defaultConstructId = match[1].toLowerCase();
        defaultCallsign = defaultConstructId;
      }
    }
    return { constructId: defaultConstructId, constructName: 'Zen', constructCallsign: defaultCallsign };
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
    const normalized = (value || 'zen').replace(/-\d{3,}$/i, '');
    return normalized
      .split(/[-_]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Zen';
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
   * Pin a message to a designated file (pins.md, vault_notes.md, or logbook.json)
   */
  async pinMessage(
    userId: string,
    message: { id: string; role: string; text?: string; packets?: any[]; ts: number },
    destination: string,
    threadId: string
  ): Promise<void> {
    try {
      await this.initializeVVAULT();

      // Extract message text
      let messageText = message.text || ''
      if (message.role === 'assistant' && message.packets) {
        messageText = message.packets
          .map((p: any) => {
            if (p?.payload?.content) {
              return typeof p.payload.content === 'string' ? p.payload.content : ''
            }
            return ''
          })
          .join('\n')
      }

      const timestamp = new Date(message.ts).toISOString()
      const date = new Date(message.ts).toLocaleDateString()
      const time = new Date(message.ts).toLocaleTimeString()

      // Format message for markdown
      const pinEntry = `## ${date} ${time}

**Thread**: ${threadId}
**Message ID**: ${message.id}
**Role**: ${message.role}
**Timestamp**: ${timestamp}

${messageText}

---

`

      if (this.isBrowserEnv()) {
        // Browser: For now, log the pin action
        // TODO: Add backend endpoint /api/vvault/pin-message if needed
        console.log(`📌 [VVAULT] Pin request (browser):`, {
          destination,
          threadId,
          messageId: message.id,
          content: pinEntry.substring(0, 100) + '...'
        })
        // In browser, we can't write directly to filesystem
        // This would require a backend endpoint to be implemented
        // For now, we'll just log it
      } else {
        // Server: write directly to file
        const fs = await import('fs').then(m => m.promises)
        const path = await import('path')
        
        // Determine file path based on destination
        const vvaultRoot = process.env.VVAULT_ROOT || './vvault'
        const filePath = path.join(vvaultRoot, 'users', 'shard_0000', userId, destination)
        
        // Append to file (create if doesn't exist)
        await fs.appendFile(filePath, pinEntry, 'utf8')
      }

      console.log(`✅ [VVAULT] Message ${message.id} pinned to ${destination}`)
    } catch (error) {
      console.error(`❌ [VVAULT] Failed to pin message ${message.id}:`, error)
      throw error
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
