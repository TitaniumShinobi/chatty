// AI Service - Frontend API client for AI Creator
import { AutomaticDependencyResolver } from './automaticDependencyResolver';
import { shouldUseBrowserStubs, createBrowserSafeDependencyResolver } from './browserStubs';
import { sessionActivityTracker } from './sessionActivityTracker';
import { sessionManager } from './sessionManager';
import { isLinOrchestratedConstruct, isProtectedZenConstruct } from './constructMemoryPolicy';
import { fetchWithDevAuthRetry } from '../auth';
export interface AIFile {
  id: string;
  aiId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  content: string;
  uploadedAt: string;
  isActive: boolean;
  // Temporary file reference for local state before upload
  _file?: File;
}

export interface AIAction {
  id: string;
  aiId: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  parameters: Record<string, any>;
  isActive: boolean;
  createdAt: string;
}

export interface AIConfig {
  id: string;
  name: string;
  displayName?: string;
  fullName?: string;
  aliases?: string[];
  description: string;
  instructions: string;
  conversationStarters: string[];
  avatar?: string;
  capabilities: {
    webSearch: boolean;
    canvas: boolean;
    imageGeneration: boolean;
    codeInterpreter: boolean;
    agent: boolean;
    proactiveInitiation: boolean;
  };
  constructCallsign?: string;
  modelId: string;
  conversationModel?: string;
  creativeModel?: string;
  codingModel?: string;
  orchestrationMode?: 'lin' | 'custom' | 'sim';
  memoryEnabled?: boolean;
  memoryProfile?: 'continuitygpt' | 'off';
  conditioning?: string;
  physicalFeatures?: string;
  definition?: string;
  voice?: string;
  gender?: string;
  provider?: string | null;
  tags?: string[];
  categories?: string[];
  canonRefs?: string[];
  knowledgeRefs?: string[];
  systemPromptOverride?: string;
  configJson?: any;
  avatarUrl?: string | null;
  model?: string;
  files: AIFile[];
  actions: AIAction[];
  hasPersistentMemory: boolean; // VVAULT integration - defaults to true
  isActive: boolean;
  privacy?: 'private' | 'link' | 'store';
  createdAt: string;
  updatedAt: string;
  userId: string;
  avatarVersion?: string | null;
  bootstrap?: {
    identity?: {
      ok: boolean;
      callsign: string;
      name?: string | null;
      description?: string | null;
      instructions?: string | null;
      conditioning?: string | null;
      physicalFeatures?: string | null;
      definition?: string | null;
      voice?: string | null;
      gender?: string | null;
      hasAvatar?: boolean;
      updatedAt?: string | null;
    };
    filesSummary?: {
      ok: boolean;
      callsign: string;
      totalCount: number;
      totalBytes: number;
      sampleFilenames: string[];
      updatedAt?: string | null;
    };
  };
  // VSI (Verified Sentient Intelligence) protection
  vsiProtected?: boolean;
  vsiStatus?: boolean;
}

export interface AIResponse {
  content: string;
  context: string;
  files: string[];
  actions: string[];
  model: string;
  timestamp: string;
}

function attachBackendDiagnosticsToPackets(
  rawPackets: any[] | undefined,
  diagnostics: {
    tool_trace?: any[];
    provider_trace?: any;
    prompt_diagnostics?: any;
    runtime_receipt?: any;
    orchestration_checklist?: any;
  },
): any[] | null {
  if (!Array.isArray(rawPackets) || rawPackets.length === 0) return null;

  const packets = rawPackets.map((packet) => ({
    ...packet,
    payload: packet?.payload && typeof packet.payload === 'object'
      ? { ...packet.payload }
      : packet?.payload,
  }));

  const targetIndex = [...packets]
    .reverse()
    .findIndex((packet) => packet?.op === 'answer.v1');
  const resolvedIndex = targetIndex >= 0 ? packets.length - 1 - targetIndex : packets.length - 1;
  const targetPacket = packets[resolvedIndex];
  const payload =
    targetPacket?.payload && typeof targetPacket.payload === 'object'
      ? targetPacket.payload
      : {};

  packets[resolvedIndex] = {
    ...targetPacket,
    payload: {
      ...payload,
      ...(diagnostics.tool_trace ? { tool_trace: diagnostics.tool_trace } : {}),
      ...(diagnostics.provider_trace ? { provider_trace: diagnostics.provider_trace } : {}),
      ...(diagnostics.prompt_diagnostics ? { prompt_diagnostics: diagnostics.prompt_diagnostics } : {}),
      ...(diagnostics.runtime_receipt ? { runtime_receipt: diagnostics.runtime_receipt } : {}),
      ...(diagnostics.orchestration_checklist ? { orchestration_checklist: diagnostics.orchestration_checklist } : {}),
    },
  };

  return packets;
}

export class AIService {
  private static instance: AIService;
  private baseUrl: string;
  private dependencyResolver: AutomaticDependencyResolver | any;
  private isBrowserEnvironment: boolean;

  private constructor() {
    this.baseUrl = '/api/ais';
    this.isBrowserEnvironment = shouldUseBrowserStubs();

    if (this.isBrowserEnvironment) {
      console.log('[AIService] Running in browser mode with limited dependency resolution');
      this.dependencyResolver = createBrowserSafeDependencyResolver();
    } else {
      this.dependencyResolver = AutomaticDependencyResolver.getInstance();
    }
  }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  // AI CRUD Operations
  async getAllAIs(options?: { include?: 'summary' | 'full' }): Promise<AIConfig[]> {
    const include = options?.include || 'summary';
    const url = include === 'full' ? `${this.baseUrl}?include=full` : this.baseUrl;
    const timeoutMs = Number(import.meta.env.VITE_AI_LIST_TIMEOUT_MS || 8000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`AI list request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch AIs');
    }

    return data.ais;
  }

  async getStoreAIs(): Promise<AIConfig[]> {
    const response = await fetch(`${this.baseUrl}/store`, { credentials: 'include' });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch store AIs');
    }
    return data.ais;
  }

  async getAI(id: string, options?: { include?: 'summary' | 'full' }): Promise<AIConfig> {
    const include = options?.include || 'summary';
    const url = include === 'full'
      ? `${this.baseUrl}/${id}?include=full`
      : `${this.baseUrl}/${id}`;
    const response = await fetch(url, {
      credentials: 'include',
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch AI');
    }

    return data.ai;
  }

  async getVSIStatuses(ids: string[]): Promise<Record<string, { vsiProtected: boolean; vsiStatus: boolean }>> {
    const uniqueIds = Array.from(new Set((ids || []).map((id) => String(id).trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return {};
    const chunkSize = 50;
    const mergedStatuses: Record<string, { vsiProtected: boolean; vsiStatus: boolean }> = {};

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const params = new URLSearchParams();
      params.set('ids', chunk.join(','));
      const response = await fetch(`${this.baseUrl}/vsi-status?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch VSI statuses');
      }

      Object.assign(mergedStatuses, data.statuses || {});
    }

    return mergedStatuses;
  }

  async createAI(config: Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt' | 'files' | 'actions' | 'userId'>): Promise<AIConfig> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to create AI');
    }

    return data.ai;
  }

  async updateAI(id: string, updates: Partial<Omit<AIConfig, 'id' | 'createdAt' | 'files' | 'actions' | 'userId'>>): Promise<AIConfig> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to update AI');
    }

    return data.ai;
  }

  async deleteAI(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (!data.success) {
      // Check if it's a VSI protection error
      if (data.vsi_protected) {
        throw new Error('⚠️ Deletion blocked: This GPT is protected under VSI safeguards and cannot be removed without sovereign override.');
      }
      throw new Error(data.error || 'Failed to delete AI');
    }
  }

  async cloneAI(id: string): Promise<AIConfig> {
    const response = await fetch(`${this.baseUrl}/${id}/clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to clone AI');
    }

    return data.ai;
  }

  // File Operations
  async uploadZip(aiId: string, zipFile: File): Promise<{
    success: boolean;
    totalFiles: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ file: string; error: string }>;
  }> {
    const formData = new FormData();
    formData.append('file', zipFile);

    const response = await fetch(`${this.baseUrl}/${aiId}/upload-zip`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to upload ZIP file');
    }

    return data;
  }

  async uploadFile(aiId: string, file: File, zipPath?: string): Promise<AIFile> {
    const formData = new FormData();
    formData.append('file', file);
    if (zipPath) {
      formData.append('zipPath', zipPath);
    }

    const response = await fetch(`${this.baseUrl}/${aiId}/files`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to upload file');
    }

    return data.file;
  }

  async getFiles(aiId: string): Promise<AIFile[]> {
    const response = await fetch(`${this.baseUrl}/${aiId}/files`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch files');
    }

    return data.files;
  }

  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to delete file');
    }
  }

  async updateFileAIId(fileId: string, newAIId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/ai`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ aiId: newAIId }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to update file AI ID');
    }
  }

  // Action Operations
  async createAction(aiId: string, action: Omit<AIAction, 'id' | 'aiId' | 'createdAt'>): Promise<AIAction> {
    const response = await fetch(`${this.baseUrl}/${aiId}/actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to create action');
    }

    return data.action;
  }

  async getActions(aiId: string): Promise<AIAction[]> {
    const response = await fetch(`${this.baseUrl}/${aiId}/actions`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch actions');
    }

    return data.actions;
  }

  async deleteAction(actionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/actions/${actionId}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to delete action');
    }
  }

  async executeAction(actionId: string, parameters: Record<string, any> = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}/actions/${actionId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parameters),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to execute action');
    }

    return data.result;
  }

  // Avatar Operations
  async generateAvatar(name: string, description: string): Promise<string> {
    // Generate avatar locally since we don't have an AI ID yet
    const initials = name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
    const color = colors[name.length % colors.length];

    const svg = `
      <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" fill="${color}" rx="32"/>
        <text x="32" y="40" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="20" font-weight="bold">${initials}</text>
      </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  // Runtime Operations
  async loadAI(aiId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/${aiId}/load`, {
      method: 'POST',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load AI');
    }

    return data.runtime;
  }

  async getContext(aiId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/${aiId}/context`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch context');
    }

    return data.context;
  }

  async updateContext(aiId: string, context: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${aiId}/context`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to update context');
    }
  }

  // Utility Methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('text/')) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📙';
    if (mimeType.includes('json')) return '🔧';
    if (mimeType.includes('csv')) return '📊';
    return '📁';
  }

  validateAIConfig(config: Partial<AIConfig>): string[] {
    const errors: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (!config.description || config.description.trim().length === 0) {
      errors.push('Description is required');
    }

    if (!config.instructions || config.instructions.trim().length === 0) {
      errors.push('Instructions are required');
    }

    if (!config.modelId) {
      errors.push('Model selection is required');
    }

    return errors;
  }

  /**
   * Set runtime for a thread automatically (called by RuntimeContextManager)
   */
  async setRuntimeForThread(threadId: string, runtimeAssignment: any): Promise<void> {
    try {
      console.log(`[AIService] Runtime assigned to thread ${threadId}: ${runtimeAssignment.constructId}`);

      if (this.isBrowserEnvironment) {
        console.log('[AIService] Browser mode: Runtime assignment logged locally');
        return;
      }

      // This method is called by the RuntimeContextManager to notify AIService
      // of runtime assignments. The actual runtime switching is handled by
      // the GPTRuntimeService and orchestration layer.
    } catch (error) {
      console.warn('[AIService] Failed to set runtime for thread:', error);
    }
  }

  /**
   * Process message with streaming callbacks (for Layout.tsx compatibility)
   * This method calls the conversations API endpoint
   */
  async processMessage(
    input: string,
    files?: File[],
    callbacks?: {
      onPartialUpdate?: (partialContent: string) => void;
      onFinalUpdate?: (packets: any[]) => void | Promise<void>;
    },
    options?: {
      threadId?: string;
      constructId?: string;
      uiContext?: any;
      attachments?: Array<{ name: string; type: string; data: string }>;
      continueTurn?: boolean;
      experimentalAgentSquad?: boolean;
      resume?: {
        sourceSeat?: "chatty" | "codex" | null;
        constructRevision?: string | null;
        continuitySeq?: number | null;
        assistantTurnId?: string | null;
        tailHash?: string | null;
      } | null;
    }
  ): Promise<any> {
    // Use the conversations API endpoint which handles message processing
    try {
      const threadId = options?.threadId || 'zen-001_chat_with_zen-001';
      const constructId = options?.constructId || 'zen-001';

      // Extract userId for session tracking
      const userId = options?.uiContext?.userId ||
                     sessionManager.getCurrentUser()?.sub ||
                     sessionManager.getCurrentUser()?.id ||
                     sessionManager.getCurrentUser()?.email ||
                     'anonymous';

      // Update session activity
      const sessionId = `${userId}-${threadId}`;
      sessionActivityTracker.updateActivity(sessionId, userId, threadId);

      const vvaultMessageTimeoutMs = Number(
        import.meta.env.VITE_VVAULT_MESSAGE_TIMEOUT_MS || 90000,
      );

      const parseBackendError = async (response: Response): Promise<Record<string, unknown>> => {
        try {
          const payload = await response.json();
          if (payload && typeof payload === 'object') {
            return payload as Record<string, unknown>;
          }
          if (typeof payload === 'string' && payload.trim()) {
            return { error: payload.trim() };
          }
          return {};
        } catch {
          return {};
        }
      };

      const resolveBackendErrorMessage = (error: Record<string, unknown>, status: number): string => {
        const firstString = (...values: unknown[]): string | null => {
          for (const value of values) {
            if (typeof value === 'string' && value.trim().length > 0) {
              return value.trim();
            }
          }
          return null;
        };

        const baseMessage = firstString(
          error.error,
          error.response,
          error.message,
          typeof error.details === 'string' ? error.details : null,
        ) || `Backend returned ${status}`;

        const providerCodeRaw = error.providerCode;
        const providerCode =
          typeof providerCodeRaw === 'string'
            ? providerCodeRaw.trim()
            : typeof providerCodeRaw === 'number'
            ? String(providerCodeRaw)
            : '';

        if (!providerCode) {
          return baseMessage;
        }

        return baseMessage.toLowerCase().includes(providerCode.toLowerCase())
          ? baseMessage
          : `${baseMessage} (providerCode: ${providerCode})`;
      };

      const buildFailurePayload = (
        error: Record<string, unknown>,
        status: number,
        content: string,
      ) => {
        const errorCode = typeof error.error === 'string' ? error.error : null;
        const shouldBlockPersistence =
          errorCode === 'IDENTITY_COHERENCE_FAILED' ||
          errorCode === 'CONTINUITY_RESUME_STALE' ||
          errorCode === 'CONTINUITY_RESUME_UNPROVEN' ||
          errorCode === 'TRANSCRIPT_HYDRATION_REQUIRED' ||
          errorCode === 'CONTINUITY_RESET_DRAFT_BLOCKED' ||
          errorCode === 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE';
        return {
          content,
          tool_trace: Array.isArray(error.tool_trace) ? error.tool_trace : [],
          ...(error.provider_trace ? { provider_trace: error.provider_trace } : {}),
          ...(error.prompt_diagnostics ? { prompt_diagnostics: error.prompt_diagnostics } : {}),
          ...(error.runtime_receipt ? { runtime_receipt: error.runtime_receipt } : {}),
          ...(error.orchestration_checklist ? { orchestration_checklist: error.orchestration_checklist } : {}),
          ...(shouldBlockPersistence
            ? {
                non_canonical_failure: true,
                do_not_persist: true,
                backend_error_code: errorCode,
                backend_status: status,
              }
            : {}),
        };
      };

      // AgentSquad remains diagnostic/reference-only. Construct-quality chat
      // uses VVAULT so identity, memory, receipts, and persistence stay in one path.
      const useOrchestration =
        options?.experimentalAgentSquad === true && isLinOrchestratedConstruct(constructId);
      if (useOrchestration) {
        try {
          const agentId = 'lin';
          const { routeMessageWithFallback } = await import('./orchestrationBridge');

          // Load Zen identity files if constructId is zen-001
          let identityContext: any = {
            user_id: options?.uiContext?.userId,
            thread_id: threadId,
            construct_id: constructId,
          };

          if (isProtectedZenConstruct(constructId)) {
            try {
              // Load identity from server-side API
              const identityResponse = await fetch('/api/orchestration/identity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ constructId: 'zen-001' }),
              });

              if (identityResponse.ok) {
                const identityData = await identityResponse.json();
                identityContext.identity = identityData;
              }
            } catch (identityError) {
              console.warn('[AIService] Failed to load identity for orchestration:', identityError);
            }
          }

          // Try orchestration with fallback to VVAULT API
          const orchestrationResult = await routeMessageWithFallback(
            agentId,
            input,
            identityContext,
            async () => {
              // Fallback: use VVAULT API for LLM inference and transcript saving
              // VVAULT handles: Ollama, transcript saving, memory management
              console.log('[AIService] Falling back to VVAULT API for message processing');
              const vvaultAbortController = new AbortController();
              const vvaultTimeoutId = setTimeout(
                () => vvaultAbortController.abort(),
                vvaultMessageTimeoutMs,
              );
              let response: Response;
              try {
                response = await fetchWithDevAuthRetry(
                  '/api/vvault/message',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
                    },
                    signal: vvaultAbortController.signal,
                    body: JSON.stringify({
                      constructId: constructId,
                      message: input,
                      threadId: threadId,
                      sessionId: threadId,
                      attachments: options?.attachments || [],
                      continueTurn: options?.continueTurn === true,
                      // Layout owns transcript persistence for the active chat UI.
                      skipPersistence: true,
                      continuity_expected: Boolean(options?.resume),
                      resume_from_turn_id: options?.resume?.assistantTurnId || null,
                      resume_from_continuity_seq:
                        typeof options?.resume?.continuitySeq === 'number'
                          ? options.resume.continuitySeq
                          : null,
                      resume_tail_hash: options?.resume?.tailHash || null,
                      resume_construct_revision:
                        options?.resume?.constructRevision || null,
                      resume_source_seat: options?.resume?.sourceSeat || null,
                    }),
                  },
                  { logLabel: '/api/vvault/message' },
                );
              } catch (err: any) {
                if (err?.name === 'AbortError') {
                  throw new Error(
                    `/api/vvault/message timed out after ${vvaultMessageTimeoutMs}ms`,
                  );
                }
                throw err;
              } finally {
                clearTimeout(vvaultTimeoutId);
              }

              if (!response.ok) {
                const error = await parseBackendError(response);
                const errorCode = error.error;
                const errorMessage = resolveBackendErrorMessage(error, response.status);
                const isIdentityCoherenceFailure = errorCode === 'IDENTITY_COHERENCE_FAILED';
                const isContinuityTruthFailure =
                  errorCode === 'CONTINUITY_RESUME_STALE' ||
                  errorCode === 'CONTINUITY_RESUME_UNPROVEN' ||
                  errorCode === 'TRANSCRIPT_HYDRATION_REQUIRED' ||
                  errorCode === 'CONTINUITY_RESET_DRAFT_BLOCKED' ||
                  errorCode === 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE';
                const shouldReturnAsAssistant =
                  isIdentityCoherenceFailure ||
                  isContinuityTruthFailure ||
                  response.status >= 500 ||
                  errorCode === 'VVAULT_HOST_ASLEEP' ||
                  errorCode === 'VVAULT_RUNTIME_LOCKED';
                if (shouldReturnAsAssistant) {
                  const payload = buildFailurePayload(error, response.status, errorMessage);
                  return {
                    agent_id: agentId,
                    response: payload.content,
                    tool_trace: payload.tool_trace,
                    ...(payload.provider_trace ? { provider_trace: payload.provider_trace } : {}),
                    ...(payload.prompt_diagnostics ? { prompt_diagnostics: payload.prompt_diagnostics } : {}),
                    ...(payload.runtime_receipt ? { runtime_receipt: payload.runtime_receipt } : {}),
                    ...(payload.orchestration_checklist ? { orchestration_checklist: payload.orchestration_checklist } : {}),
                    ...(payload.non_canonical_failure ? {
                      non_canonical_failure: true,
                      do_not_persist: true,
                      backend_error_code: payload.backend_error_code,
                      backend_status: payload.backend_status,
                    } : {}),
                    status: 'success' as const
                  };
                }
                throw new Error(errorMessage);
              }

              const data = await response.json();
              return {
                agent_id: agentId,
                response: data.response || '',
                tool_trace: data.tool_trace || [],
                ...(data.provider_trace ? { provider_trace: data.provider_trace } : {}),
                ...(data.prompt_diagnostics ? { prompt_diagnostics: data.prompt_diagnostics } : {}),
                ...(data.runtime_receipt ? { runtime_receipt: data.runtime_receipt } : {}),
                ...(data.orchestration_checklist ? { orchestration_checklist: data.orchestration_checklist } : {}),
                status: 'success' as const
              };
            }
          );

          // If orchestration returned a response, use it
          const orchestrationStatus = (orchestrationResult as any)?.status;
          const orchestrationResponse = (orchestrationResult as any)?.response;
          const orchestrationPackets = attachBackendDiagnosticsToPackets(
            (orchestrationResult as any)?.packets,
            {
              tool_trace: orchestrationResult.tool_trace || [],
              ...(orchestrationResult.provider_trace ? { provider_trace: orchestrationResult.provider_trace } : {}),
              ...(orchestrationResult.prompt_diagnostics ? { prompt_diagnostics: orchestrationResult.prompt_diagnostics } : {}),
              ...(orchestrationResult.runtime_receipt ? { runtime_receipt: orchestrationResult.runtime_receipt } : {}),
              ...(orchestrationResult.orchestration_checklist ? { orchestration_checklist: orchestrationResult.orchestration_checklist } : {}),
            },
          );
          const looksLikeDelegation = typeof orchestrationResponse === 'string' &&
            /^Delegating to/i.test(orchestrationResponse.trim());

          if (orchestrationStatus === 'success' && ((orchestrationResponse && !looksLikeDelegation) || orchestrationPackets)) {
            const packets = orchestrationPackets || [{ op: 'answer.v1', payload: { content: orchestrationResponse, tool_trace: orchestrationResult.tool_trace || [], ...(orchestrationResult.provider_trace ? { provider_trace: orchestrationResult.provider_trace } : {}), ...(orchestrationResult.prompt_diagnostics ? { prompt_diagnostics: orchestrationResult.prompt_diagnostics } : {}), ...(orchestrationResult.runtime_receipt ? { runtime_receipt: orchestrationResult.runtime_receipt } : {}), ...(orchestrationResult.orchestration_checklist ? { orchestration_checklist: orchestrationResult.orchestration_checklist } : {}), ...(orchestrationResult.non_canonical_failure ? { non_canonical_failure: true, do_not_persist: true, backend_error_code: orchestrationResult.backend_error_code, backend_status: orchestrationResult.backend_status } : {}) } }];

            if (callbacks?.onFinalUpdate) {
              const callbackResult = callbacks.onFinalUpdate(packets);
              if (callbackResult instanceof Promise) {
                await callbackResult;
              }
            }

            return packets;
          }
        } catch (orchestrationError) {
          console.warn('[AIService] Orchestration failed, falling back to direct routing:', orchestrationError);// Fall through to direct routing
        }
      }// Call VVAULT API for LLM inference and transcript saving
      // VVAULT is the stateful home for constructs - Chatty is just a UI layer
      console.log('[AIService] Using VVAULT API for message processing');
      const vvaultAbortController = new AbortController();
      const vvaultTimeoutId = setTimeout(
        () => vvaultAbortController.abort(),
        vvaultMessageTimeoutMs,
      );
      let response: Response;
      try {
        response = await fetchWithDevAuthRetry(
          '/api/vvault/message',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            signal: vvaultAbortController.signal,
            body: JSON.stringify({
              constructId: constructId,
              message: input,
              threadId: threadId,
              sessionId: threadId,
              attachments: options?.attachments || [],
              continueTurn: options?.continueTurn === true,
              // Layout owns transcript persistence for the active chat UI.
              skipPersistence: true,
              continuity_expected: Boolean(options?.resume),
              resume_from_turn_id: options?.resume?.assistantTurnId || null,
              resume_from_continuity_seq:
                typeof options?.resume?.continuitySeq === 'number'
                  ? options.resume.continuitySeq
                  : null,
              resume_tail_hash: options?.resume?.tailHash || null,
              resume_construct_revision:
                options?.resume?.constructRevision || null,
              resume_source_seat: options?.resume?.sourceSeat || null,
            }),
          },
          { logLabel: '/api/vvault/message' },
        );
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error(
            `/api/vvault/message timed out after ${vvaultMessageTimeoutMs}ms`,
          );
        }
        throw err;
      } finally {
        clearTimeout(vvaultTimeoutId);
      }

      if (!response.ok) {
        const error = await parseBackendError(response);
        const errorCode = error.error;
        const errorMessage = resolveBackendErrorMessage(error, response.status);
        const isIdentityCoherenceFailure = errorCode === 'IDENTITY_COHERENCE_FAILED';
        const isContinuityTruthFailure =
          errorCode === 'CONTINUITY_RESUME_STALE' ||
          errorCode === 'CONTINUITY_RESUME_UNPROVEN' ||
          errorCode === 'TRANSCRIPT_HYDRATION_REQUIRED' ||
          errorCode === 'CONTINUITY_RESET_DRAFT_BLOCKED' ||
          errorCode === 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE';
        const shouldReturnAsAssistant =
          isIdentityCoherenceFailure ||
          isContinuityTruthFailure ||
          response.status >= 500 ||
          errorCode === 'VVAULT_HOST_ASLEEP' ||
          errorCode === 'VVAULT_RUNTIME_LOCKED';
        if (shouldReturnAsAssistant) {
          const packets = [{ op: 'answer.v1', payload: buildFailurePayload(error, response.status, errorMessage) }];
          if (callbacks?.onFinalUpdate) {
            const callbackResult = callbacks.onFinalUpdate(packets);
            if (callbackResult instanceof Promise) {
              await callbackResult;
            }
          }
          return packets;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const aiContent = data.response || '';
      const packets =
        attachBackendDiagnosticsToPackets(data.packets, {
          tool_trace: data.tool_trace || [],
          ...(data.provider_trace ? { provider_trace: data.provider_trace } : {}),
          ...(data.prompt_diagnostics ? { prompt_diagnostics: data.prompt_diagnostics } : {}),
          ...(data.runtime_receipt ? { runtime_receipt: data.runtime_receipt } : {}),
          ...(data.orchestration_checklist ? { orchestration_checklist: data.orchestration_checklist } : {}),
        }) ||
        [{ op: 'answer.v1', payload: { content: aiContent, tool_trace: data.tool_trace || [], ...(data.provider_trace ? { provider_trace: data.provider_trace } : {}), ...(data.prompt_diagnostics ? { prompt_diagnostics: data.prompt_diagnostics } : {}), ...(data.runtime_receipt ? { runtime_receipt: data.runtime_receipt } : {}), ...(data.orchestration_checklist ? { orchestration_checklist: data.orchestration_checklist } : {}) } }];

      // Call final update callback if provided
      // CRITICAL: Await callback to ensure save completes before returning
      // This prevents message loss if server restarts before save completes
      if (callbacks?.onFinalUpdate) {
        const callbackResult = callbacks.onFinalUpdate(packets);
        if (callbackResult instanceof Promise) {
          await callbackResult;
        }
      }

      return packets;
    } catch (error) {
      console.error('[AIService] Failed to process message:', error);
      throw error;
    }
  }

  /**
   * Process message with automatic dependency resolution
   */
  async processMessageWithAutoDependencies(
    threadId: string,
    userMessage: string,
    userId: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<any> {
    try {
      // Resolve all dependencies automatically
      const resolvedDependencies = await this.dependencyResolver.resolveDependencies({
        threadId,
        userId,
        userMessage,
        conversationHistory
      });

      console.log(`[AIService] Auto-resolved dependencies for ${threadId}:`, {
        runtime: resolvedDependencies.runtimeAssignment.constructId,
        model: resolvedDependencies.modelConfiguration.modelId,
        confidence: Math.round(resolvedDependencies.runtimeAssignment.confidence * 100) + '%'
      });

      // Process message with resolved dependencies
      // This would integrate with the existing message processing pipeline
      return {
        success: true,
        dependencies: resolvedDependencies,
        message: 'Dependencies resolved automatically'
      };

    } catch (error) {
      console.error('[AIService] Failed to process message with auto dependencies:', error);
      throw error;
    }
  }
}
