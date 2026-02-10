// CLI API Client for Chatty Backend Communication
import fetch from 'node-fetch';

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

class CLIApiClient {
  private baseUrl = 'http://localhost:5000/api';
  private cookies: string = '';

  private async request<T>(endpoint: string, options: any = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.cookies,
        ...options.headers,
      },
    });

    // Store cookies for authentication
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      this.cookies = setCookie;
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // Auth
  async getCurrentUser(): Promise<any> {
    try {
      const response = await this.request<{ ok: boolean; user: any }>('/me');
      return response.user;
    } catch {
      return null;
    }
  }

  async loginWithGoogle(): Promise<void> {
    // For CLI, we'll need to handle OAuth differently
    // This is a placeholder - in practice, you'd need to open browser or use device flow
    throw new Error('CLI Google login not implemented yet. Please login via web interface first.');
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

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }
}

export const cliApiClient = new CLIApiClient();
