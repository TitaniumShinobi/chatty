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

// ─── Voice Lab 2.0 ───────────────────────────────────────────────────────────

/** Upload a voice reference file and save to construct in one step (legacy). */
export async function uploadVoice(constructId: string, file: File): Promise<boolean> {
  const { ok, tmpId } = await uploadVoiceToTemp(file);
  if (!ok || !tmpId) return false;
  const saveRes = await saveVoiceToConstruct(constructId, { tmpId });
  return saveRes.ok;
}

/** Upload file to temp; returns tmpId for audit/save. */
export async function uploadVoiceToTemp(file: File): Promise<{ ok: boolean; tmpId?: string; error?: string }> {
  const form = new FormData();
  form.append('voice', file);
  const res = await fetch('/api/voice/upload', { method: 'POST', body: form, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || res.statusText };
  return { ok: true, tmpId: data.tmpId };
}

/** Fetch URL to temp; returns tmpId. */
export async function fetchVoiceUrlToTemp(url: string): Promise<{ ok: boolean; tmpId?: string; error?: string }> {
  const res = await fetch('/api/voice/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || res.statusText };
  return { ok: true, tmpId: data.tmpId };
}

/** Get quality audit for a temp upload. */
export async function getVoiceAudit(tmpId: string): Promise<{
  ok: boolean;
  durationSec?: number;
  channels?: number;
  sampleRateHz?: number;
  rmsDb?: number | null;
  pass?: boolean;
  hints?: string[];
  error?: string;
}> {
  const res = await fetch(`/api/voice/audit?id=${encodeURIComponent(tmpId)}`, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || res.statusText };
  return { ok: true, ...data };
}

/** URL for previewing a staged temp voice upload. */
export function getVoicePreviewUrl(tmpId: string): string {
  return `/api/voice/preview?id=${encodeURIComponent(tmpId)}`;
}

/** Trim long temp file to 25 s from startSec; returns new tmpId. */
export async function trimVoiceTemp(tmpId: string, startSec: number): Promise<{ ok: boolean; tmpId?: string; error?: string }> {
  const res = await fetch('/api/voice/trim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmpId, startSec }),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || res.statusText };
  return { ok: true, tmpId: data.tmpId };
}

/** Save temp (or starter) to construct. */
export async function saveVoiceToConstruct(
  constructId: string,
  opts: { tmpId?: string; starterId?: string }
): Promise<{ ok: boolean; refPath?: string; error?: string }> {
  const res = await fetch('/api/voice/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ constructId, ...opts }),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || res.statusText };
  return { ok: true, refPath: data.refPath };
}

/** URL for TTS sample playback (GET stream). */
export function getTtsSampleUrl(constructId: string): string {
  return `/api/tts?sample=true&constructId=${encodeURIComponent(constructId)}`;
}

/** Fetch help markdown for the voice lab drawer. */
export async function getVoiceLabHelp(): Promise<string> {
  const res = await fetch('/api/voice/help', { credentials: 'include' });
  if (!res.ok) return '';
  return res.text();
}
