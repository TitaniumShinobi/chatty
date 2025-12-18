// AI Service - Frontend API client for AI Creator
import { AutomaticDependencyResolver } from './automaticDependencyResolver';
import { shouldUseBrowserStubs, createBrowserSafeDependencyResolver } from './browserStubs';
import { sessionActivityTracker } from './sessionActivityTracker';
import { sessionManager } from './sessionManager';
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
  description: string;
  instructions: string;
  conversationStarters: string[];
  avatar?: string;
  capabilities: {
    webSearch: boolean;
    canvas: boolean;
    imageGeneration: boolean;
    codeInterpreter: boolean;
  };
  constructCallsign?: string;
  modelId: string;
  conversationModel?: string;
  creativeModel?: string;
  codingModel?: string;
  orchestrationMode?: 'lin' | 'custom';
  files: AIFile[];
  actions: AIAction[];
  hasPersistentMemory: boolean; // VVAULT integration - defaults to true
  isActive: boolean;
  privacy?: 'private' | 'link' | 'store';
  createdAt: string;
  updatedAt: string;
  userId: string;
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
  async getAllAIs(): Promise<AIConfig[]> {
    const response = await fetch(this.baseUrl);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch AIs');
    }
    
    return data.ais;
  }

  async getStoreAIs(): Promise<AIConfig[]> {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:106',message:'getStoreAIs entry',data:{baseUrl:this.baseUrl,url:`${this.baseUrl}/store`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    const response = await fetch(`${this.baseUrl}/store`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:108',message:'fetch response',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    const data = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:109',message:'json parsed',data:{success:data.success,aisCount:data.ais?.length,hasError:!!data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    
    if (!data.success) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:111',message:'data.success false',data:{error:data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      throw new Error(data.error || 'Failed to fetch store AIs');
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:115',message:'getStoreAIs success',data:{count:data.ais.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return data.ais;
  }

  async getAI(id: string): Promise<AIConfig> {
    const response = await fetch(`${this.baseUrl}/${id}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch AI');
    }
    
    return data.ai;
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
  async uploadFile(aiId: string, file: File): Promise<AIFile> {
    const formData = new FormData();
    formData.append('file', file);

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
    }
  ): Promise<any> {
    // #region agent log
    const logData = {
      location: 'aiService.ts:439',
      message: 'processMessage: method called',
      data: {
        inputLength: input.length,
        hasFiles: !!files,
        filesCount: files?.length || 0,
        hasOnPartialUpdate: !!callbacks?.onPartialUpdate,
        hasOnFinalUpdate: !!callbacks?.onFinalUpdate,
        threadId: options?.threadId,
        constructId: options?.constructId
      },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'fix-processmessage',
      hypothesisId: 'D'
    };
    try {
      await fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData)
      }).catch(() => {});
    } catch {}
    // #endregion

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
      
      // Optional: Use orchestration if enabled and constructId is zen or lin
      const useOrchestration = options?.useOrchestration !== false && 
                                (constructId === 'zen-001' || constructId === 'zen' || 
                                 constructId === 'lin-001' || constructId === 'lin');
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:486',message:'processMessage: orchestration check',data:{constructId,threadId,useOrchestration,messageLength:input.length},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (useOrchestration) {
        try {
          // Extract agent ID from constructId (zen-001 -> zen, lin-001 -> lin)
          const agentId = constructId.replace(/-001$/, '').replace(/-\d+$/, '') || 'zen';
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:492',message:'processMessage: taking orchestration path',data:{agentId,constructId,threadId},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          const { routeMessageWithFallback } = await import('./orchestrationBridge');
          
          // Load Zen identity files if constructId is zen-001
          let identityContext: any = {
            user_id: options?.uiContext?.userId,
            thread_id: threadId,
            construct_id: constructId,
          };
          
          if (constructId === 'zen-001' || constructId === 'zen') {
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
          
          // Try orchestration with fallback to direct routing
          const orchestrationResult = await routeMessageWithFallback(
            agentId,
            input,
            identityContext,
            async () => {
              // Fallback: use existing routing
              const response = await fetch(`/api/conversations/${threadId}/messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                  message: input,
                  content: input,
                  constructId: constructId,
                  metadata: options?.uiContext
                }),
              });
              
              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to process message');
              }
              
              const data = await response.json();
              return {
                agent_id: agentId,
                response: data.aiResponse?.content || data.content || data.aiResponse?.message || '',
                status: 'success' as const
              };
            }
          );
          
          // If orchestration returned a response, use it
          if (orchestrationResult.status !== 'error' && orchestrationResult.response) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:537',message:'processMessage: orchestration success',data:{agentId,status:orchestrationResult.status,responseLength:orchestrationResult.response?.length},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            const packets = [{ op: 'answer.v1', payload: { content: orchestrationResult.response } }];
            
            if (callbacks?.onFinalUpdate) {
              const callbackResult = callbacks.onFinalUpdate(packets);
              if (callbackResult instanceof Promise) {
                await callbackResult;
              }
            }
            
            return packets;
          }
        } catch (orchestrationError) {
          console.warn('[AIService] Orchestration failed, falling back to direct routing:', orchestrationError);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:550',message:'processMessage: orchestration failed, using fallback',data:{error:orchestrationError.message,constructId},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          // Fall through to direct routing
        }
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:555',message:'processMessage: using direct routing',data:{constructId,threadId},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      // Call the conversations API endpoint
      const response = await fetch(`/api/conversations/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: input,
          content: input,
          constructId: constructId,
          metadata: options?.uiContext
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process message');
      }

      const data = await response.json();
      
      // Extract AI response content
      const aiContent = data.aiResponse?.content || data.content || data.aiResponse?.message || '';
      
      // Convert response to packets format
      const packets = [{ op: 'answer.v1', payload: { content: aiContent } }];
      
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
      // #region agent log
      try {
        await fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'aiService.ts:500',
            message: 'processMessage: error caught',
            data: { error: error.message, stack: error.stack },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'fix-processmessage',
            hypothesisId: 'D'
          })
        }).catch(() => {});
      } catch {}
      // #endregion
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
