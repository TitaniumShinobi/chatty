// GPT Chat Service - Integrates GPTs with the chat system
import { GPTService, GPTConfig } from './gptService.js';
import { GPTRuntimeService } from './gptRuntime.js';
import { AIService } from './aiService.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  gptId?: string;
  metadata?: {
    model?: string;
    files?: string[];
    actions?: string[];
    context?: string;
  };
}

export interface ChatSession {
  id: string;
  gptId: string;
  gptConfig: GPTConfig;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export class GPTChatService {
  private static instance: GPTChatService;
  private gptService: GPTService;
  private gptRuntime: GPTRuntimeService;
  // private aiService: AIService;
  private activeSessions: Map<string, ChatSession> = new Map();

  private constructor() {
    this.gptService = GPTService.getInstance();
    this.gptRuntime = GPTRuntimeService.getInstance();
    // this.aiService = AIService.getInstance();
  }

  static getInstance(): GPTChatService {
    if (!GPTChatService.instance) {
      GPTChatService.instance = new GPTChatService();
    }
    return GPTChatService.instance;
  }

  // Start a new chat session with a GPT
  async startChatSession(gptId: string): Promise<ChatSession> {
    try {
      // Load the GPT configuration
      const gptConfig = await this.gptService.getGPT(gptId);
      if (!gptConfig) {
        throw new Error('GPT not found');
      }

      // Load GPT for runtime
      await this.gptRuntime.loadGPT(gptId);

      // Create chat session
      const sessionId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const session: ChatSession = {
        id: sessionId,
        gptId,
        gptConfig,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.activeSessions.set(sessionId, session);
      return session;

    } catch (error) {
      console.error('Error starting chat session:', error);
      throw error;
    }
  }

  // Send a message in a chat session
  async sendMessage(sessionId: string, userMessage: string, userId: string = 'anonymous'): Promise<ChatMessage> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Chat session not found');
    }

    try {
      // Add user message to session
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
        gptId: session.gptId
      };

      session.messages.push(userMsg);
      session.updatedAt = new Date().toISOString();

      // Process message with GPT runtime
      const gptResponse = await this.gptRuntime.processMessage(session.gptId, userMessage, userId);

      // Add assistant response to session
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: gptResponse.content,
        timestamp: new Date().toISOString(),
        gptId: session.gptId,
        metadata: {
          model: gptResponse.model,
          files: gptResponse.files,
          actions: gptResponse.actions,
          context: gptResponse.context
        }
      };

      session.messages.push(assistantMsg);
      session.updatedAt = new Date().toISOString();

      return assistantMsg;

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message to session
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString(),
        gptId: session.gptId,
        metadata: {
          model: session.gptConfig.modelId,
          context: 'Error occurred during processing'
        }
      };

      session.messages.push(errorMsg);
      session.updatedAt = new Date().toISOString();
      
      return errorMsg;
    }
  }

  // Get chat session
  getChatSession(sessionId: string): ChatSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  // Get all active chat sessions
  getActiveSessions(): ChatSession[] {
    return Array.from(this.activeSessions.values());
  }

  // End a chat session
  endChatSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      // Unload GPT from runtime
      this.gptRuntime.unloadGPT(session.gptId);
      
      // Remove session
      this.activeSessions.delete(sessionId);
    }
  }

  // Get conversation history for a GPT
  getGPTHistory(gptId: string): ChatMessage[] {
    return this.gptRuntime.getHistory(gptId);
  }

  // Clear conversation history for a GPT
  clearGPTHistory(gptId: string): void {
    this.gptRuntime.clearHistory(gptId);
  }

  // Get available GPTs for chat
  async getAvailableGPTs(): Promise<GPTConfig[]> {
    try {
      return await this.gptService.getAllGPTs();
    } catch (error) {
      console.error('Error fetching available GPTs:', error);
      return [];
    }
  }

  // Switch GPT in an existing session
  async switchGPT(sessionId: string, newGptId: string): Promise<ChatSession | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    try {
      // Unload current GPT
      this.gptRuntime.unloadGPT(session.gptId);

      // Load new GPT
      const newGptConfig = await this.gptService.getGPT(newGptId);
      if (!newGptConfig) {
        throw new Error('New GPT not found');
      }

      await this.gptRuntime.loadGPT(newGptId);

      // Update session
      session.gptId = newGptId;
      session.gptConfig = newGptConfig;
      session.updatedAt = new Date().toISOString();

      return session;

    } catch (error) {
      console.error('Error switching GPT:', error);
      return null;
    }
  }

  // Export chat session
  exportChatSession(sessionId: string): string {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Chat session not found');
    }

    const exportData = {
      sessionId: session.id,
      gptId: session.gptId,
      gptName: session.gptConfig.name,
      gptDescription: session.gptConfig.description,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Import chat session
  importChatSession(exportData: string): ChatSession | null {
    try {
      const data = JSON.parse(exportData);
      
      const session: ChatSession = {
        id: data.sessionId,
        gptId: data.gptId,
        gptConfig: {
          id: data.gptId,
          name: data.gptName,
          description: data.gptDescription,
          instructions: '',
          conversationStarters: [],
          capabilities: {
            webSearch: false,
            canvas: false,
            imageGeneration: false,
            codeInterpreter: true
          },
          modelId: 'chatty-core',
          files: [],
          actions: [],
          isActive: false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          userId: 'imported'
        },
        messages: data.messages.map((msg: any) => ({
          ...msg,
          id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        })),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };

      this.activeSessions.set(session.id, session);
      return session;

    } catch (error) {
      console.error('Error importing chat session:', error);
      return null;
    }
  }

  // Get session statistics
  getSessionStats(sessionId: string): {
    messageCount: number;
    userMessages: number;
    assistantMessages: number;
    duration: number;
    gptName: string;
  } | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    const userMessages = session.messages.filter(m => m.role === 'user').length;
    const assistantMessages = session.messages.filter(m => m.role === 'assistant').length;
    const duration = new Date(session.updatedAt).getTime() - new Date(session.createdAt).getTime();

    return {
      messageCount: session.messages.length,
      userMessages,
      assistantMessages,
      duration,
      gptName: session.gptConfig.name
    };
  }
}
