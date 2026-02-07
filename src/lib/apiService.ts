// API Service for Chatty Backend Communication
import type { User } from './auth';

export interface Conversation {
  _id: string;
  title: string;
  model: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  conversation: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  packets?: any[];
  meta?: any;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

class ApiService {
  private baseUrl = '/api';

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies for authentication
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    const response = await this.request<{ ok: boolean; conversations: Conversation[] }>('/conversations');
    return response.conversations;
  }

  async createConversation(data: { title?: string; model?: string } = {}): Promise<Conversation> {
    const response = await this.request<{ ok: boolean; conversation: Conversation }>('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.conversation;
  }

  // Messages
  async getMessages(conversationId: string): Promise<Message[]> {
    const response = await this.request<{ ok: boolean; messages: Message[] }>(`/conversations/${conversationId}/messages`);
    return response.messages;
  }

  async sendMessage(conversationId: string, content: string): Promise<{ userMessage: Message; assistantMessage: Message }> {
    const response = await this.request<{ 
      ok: boolean; 
      userMessage: Message; 
      assistantMessage: Message 
    }>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return {
      userMessage: response.userMessage,
      assistantMessage: response.assistantMessage
    };
  }

  // Auth
  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await this.request<{ ok: boolean; user: User }>('/me');
      return response.user;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    await this.request('/logout', { method: 'POST' });
  }
}

export const apiService = new ApiService();
