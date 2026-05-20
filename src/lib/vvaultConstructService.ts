import { canonicalizeConstructId } from './constructId';
import { buildCanonicalConstructAvatarUrl } from './avatarUrl';

export interface VVaultConstructCard {
  constructId: string;
  callsign: string;
  displayName: string;
  description: string;
  avatarUrl: string | null;
  avatarSha256: string | null;
  updatedAt: string | null;
}

export interface VVaultConstructEditor {
  ok: true;
  constructId: string;
  callsign: string;
  displayName: string;
  description: string;
  instructions: string;
  conversationStarters: string[];
  conditioning: string;
  definition: string;
  physicalFeatures: string;
  voice: string;
  gender: string;
  avatar: {
    exists: boolean;
    filename: string | null;
    url: string | null;
    sha256: string | null;
    contentType: string | null;
  };
  filesSummary: {
    totalCount: number;
    totalBytes: number;
    sampleFilenames: string[];
    updatedAt: string | null;
  };
  models: {
    primary: string;
    conversation: string;
    creative: string;
    coding: string;
  };
  capabilities: {
    webSearch: boolean;
    canvas: boolean;
    imageGeneration: boolean;
    codeInterpreter: boolean;
    agent: boolean;
  };
  config?: Record<string, unknown>;
  updatedAt: string | null;
}

export interface VVaultConstructEditorUpdate {
  displayName?: string;
  description?: string;
  instructions?: string;
  conversationStarters?: string[];
  conditioning?: string;
  definition?: string;
  physicalFeatures?: string;
  voice?: string;
  gender?: string;
  avatarDataUrl?: string | null;
  promptBundle?: Record<string, unknown>;
}

export interface VVaultConstructCreateInput extends VVaultConstructEditorUpdate {
  callsign: string;
  colorHex?: string;
}

type SessionBridge = {
  ok: boolean;
  token: string;
  apiBaseUrl: string;
  expiresAt?: string | null;
  user?: Record<string, unknown> | null;
};

const TOKEN_STORAGE_KEY = 'vvault_token';
const USER_STORAGE_KEY = 'vvault_user';
const BRIDGE_FETCH_TIMEOUT_MS = 8000;
const VVAULT_ASLEEP_RETRY_ATTEMPTS = 3;
const VVAULT_ASLEEP_RETRY_DELAY_MS = 2000;
const VVAULT_UNAVAILABLE_MSG = 'VVAULT host is sleeping or unavailable. Try again in a moment.';

let sessionBridgeCache: SessionBridge | null = null;
let bridgeSessionInFlight: Promise<SessionBridge> | null = null;

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/$/, '');
}

function clearSession() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function storeSession(token: string, user?: Record<string, unknown> | null) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ ...user, token }));
    }
  } catch {
    // Ignore storage failures.
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchChattyJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string })?.error || `Chatty request failed: ${response.status}`);
  }
  return data as T;
}

async function bridgeSession(force = false): Promise<SessionBridge> {
  if (!force) {
    if (sessionBridgeCache) return sessionBridgeCache;
    if (bridgeSessionInFlight) return bridgeSessionInFlight;
  } else {
    bridgeSessionInFlight = null;
  }

  const doFetch = async (): Promise<SessionBridge> => {
    const isDev = import.meta.env.DEV === true || window.location?.hostname === 'localhost';
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= VVAULT_ASLEEP_RETRY_ATTEMPTS; attempt++) {
      const response = await fetchWithTimeout('/api/vvault/auth/token', { credentials: 'include' }, BRIDGE_FETCH_TIMEOUT_MS);
      const data = await response.json().catch(() => ({})) as {
        ok?: boolean;
        token?: string;
        apiBaseUrl?: string;
        expiresAt?: string | null;
        user?: Record<string, unknown> | null;
        error?: string;
        message?: string;
      };
      if (response.ok && data.ok && data.token && data.apiBaseUrl) {
        const bridged = {
          ok: true,
          token: data.token,
          apiBaseUrl: normalizeApiBaseUrl(data.apiBaseUrl),
          expiresAt: data.expiresAt ?? null,
          user: data.user || null,
        };
        sessionBridgeCache = bridged;
        storeSession(data.token, data.user || null);
        return bridged;
      }
      const hostAsleep = response.status === 503 && data.error === 'VVAULT_HOST_ASLEEP';
      lastError = new Error(hostAsleep ? data.message || VVAULT_UNAVAILABLE_MSG : data.error || 'Failed to obtain VVAULT auth token');
      if (!hostAsleep || attempt === VVAULT_ASLEEP_RETRY_ATTEMPTS || isDev) break;
      await new Promise((resolve) => setTimeout(resolve, VVAULT_ASLEEP_RETRY_DELAY_MS));
    }
    throw lastError || new Error('Failed to obtain VVAULT auth token');
  };

  const promise = doFetch();
  if (!force) {
    bridgeSessionInFlight = promise;
    promise.finally(() => {
      bridgeSessionInFlight = null;
    }).catch(() => {});
  }
  return promise;
}

async function getAuthorizedRequestOptions(init: RequestInit = {}, forceBridge = false): Promise<[string, RequestInit]> {
  const bridged = await bridgeSession(forceBridge);
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${bridged.token}`);
  return [bridged.apiBaseUrl, { ...init, headers }];
}

async function vvaultFetchJson<T>(path: string, init: RequestInit = {}, retryOn401 = true): Promise<T> {
  let [baseUrl, options] = await getAuthorizedRequestOptions(init);
  let response = await fetch(`${baseUrl}${path}`, options);
  if (response.status === 401 && retryOn401) {
    clearSession();
    sessionBridgeCache = null;
    [baseUrl, options] = await getAuthorizedRequestOptions(init, true);
    response = await fetch(`${baseUrl}${path}`, options);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string })?.error || `VVAULT request failed: ${response.status}`);
  }
  return data as T;
}

function fallbackEditorFromIdentity(canonicalId: string, compact: any = {}, projection: any = {}, summary: any = {}): VVaultConstructEditor {
  const displayName = compact?.name || canonicalId.replace(/-\d+$/, '').replace(/\b\w/g, (m: string) => m.toUpperCase());
  const projectionAvatar = projection?.avatar && typeof projection.avatar === 'object'
    ? projection.avatar
    : null;
  const avatarUrl =
    projectionAvatar?.url ||
    (compact?.hasAvatar ? buildCanonicalConstructAvatarUrl(canonicalId) : null);
  return {
    ok: true,
    constructId: canonicalId,
    callsign: compact?.callsign || canonicalId,
    displayName,
    description: compact?.description || '',
    instructions: compact?.instructions || '',
    conversationStarters: [],
    conditioning: projection?.conditioning ?? compact?.conditioning ?? '',
    definition: projection?.definition ?? compact?.definition ?? '',
    physicalFeatures: projection?.physicalFeatures ?? compact?.physicalFeatures ?? '',
    voice: projection?.voice ?? compact?.voice ?? '',
    gender: projection?.gender || '',
    avatar: {
      exists: Boolean(projectionAvatar?.url || compact?.hasAvatar),
      filename: projectionAvatar?.filename || null,
      url: avatarUrl,
      sha256: projectionAvatar?.sha256 || null,
      contentType: projectionAvatar?.contentType || null,
    },
    filesSummary: {
      totalCount: summary?.totalCount || 0,
      totalBytes: summary?.totalBytes || 0,
      sampleFilenames: Array.isArray(summary?.sampleFilenames) ? summary.sampleFilenames : [],
      updatedAt: summary?.updatedAt || compact?.updatedAt || null,
    },
    models: { primary: '', conversation: '', creative: '', coding: '' },
    capabilities: { webSearch: false, canvas: false, imageGeneration: false, codeInterpreter: false, agent: false },
    updatedAt: compact?.updatedAt || summary?.updatedAt || null,
  };
}

async function getConstructEditorViaChattyFallback(canonicalId: string): Promise<VVaultConstructEditor> {
  const [compact, projection, summary] = await Promise.allSettled([
    fetchChattyJson(`/api/vvault/constructs/${encodeURIComponent(canonicalId)}/identity-compact?bust=1`),
    fetchChattyJson(`/api/vvault/constructs/${encodeURIComponent(canonicalId)}/identity-projection`),
    fetchChattyJson(`/api/vvault/constructs/${encodeURIComponent(canonicalId)}/files/summary`),
  ]);

  const compactValue = compact.status === 'fulfilled' ? compact.value : null;
  const projectionValue = projection.status === 'fulfilled' ? projection.value : null;
  const summaryValue = summary.status === 'fulfilled' ? summary.value : null;
  if (!compactValue && !projectionValue) {
    throw new Error('Construct identity unavailable from canonical Chatty endpoints');
  }
  return fallbackEditorFromIdentity(canonicalId, compactValue, projectionValue, summaryValue);
}

function mapCreatePayload(input: VVaultConstructCreateInput): FormData {
  const form = new FormData();
  form.append('name', input.displayName || input.callsign);
  form.append('callsign', input.callsign);
  if (input.description) form.append('description', input.description);
  if (input.instructions) form.append('instructions', input.instructions);
  if (input.conversationStarters?.length) form.append('conversationStarters', JSON.stringify(input.conversationStarters));
  if (input.colorHex) form.append('color_hex', input.colorHex);
  if (input.avatarDataUrl) form.append('avatar_base64', input.avatarDataUrl);
  return form;
}

export class VVaultConstructService {
  private static instance: VVaultConstructService;

  static getInstance(): VVaultConstructService {
    if (!VVaultConstructService.instance) {
      VVaultConstructService.instance = new VVaultConstructService();
    }
    return VVaultConstructService.instance;
  }

  async listConstructs(): Promise<VVaultConstructCard[]> {
    const data = await vvaultFetchJson<{ constructs?: VVaultConstructCard[] }>('/constructs');
    return data.constructs || [];
  }

  async getConstructEditor(constructId: string): Promise<VVaultConstructEditor> {
    const canonicalId = canonicalizeConstructId(constructId) || constructId;
    try {
      return await fetchChattyJson<VVaultConstructEditor>(`/api/vvault/constructs/${encodeURIComponent(canonicalId)}/editor`);
    } catch (chattyError) {
      console.warn('[VVaultConstructService] Chatty editor endpoint failed, trying direct VVAULT editor:', chattyError);
    }

    try {
      return await vvaultFetchJson<VVaultConstructEditor>(`/constructs/${encodeURIComponent(canonicalId)}/editor`);
    } catch (directError) {
      console.warn('[VVaultConstructService] Direct editor load failed, falling back to Chatty identity aggregate endpoints:', directError);
      return getConstructEditorViaChattyFallback(canonicalId);
    }
  }

  async updateConstructEditor(constructId: string, input: VVaultConstructEditorUpdate): Promise<VVaultConstructEditor> {
    const canonicalId = canonicalizeConstructId(constructId) || constructId;
    const body = JSON.stringify(input);
    try {
      return await fetchChattyJson<VVaultConstructEditor>(`/api/vvault/constructs/${encodeURIComponent(canonicalId)}/editor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (chattyError) {
      console.warn('[VVaultConstructService] Chatty editor save failed, trying direct VVAULT editor:', chattyError);
      return vvaultFetchJson<VVaultConstructEditor>(`/constructs/${encodeURIComponent(canonicalId)}/editor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    }
  }

  async createConstruct(input: VVaultConstructCreateInput): Promise<VVaultConstructEditor> {
    const [baseUrl, options] = await getAuthorizedRequestOptions({
      method: 'POST',
      body: mapCreatePayload(input),
    });
    const rootBaseUrl = baseUrl.replace(/\/api\/vault$/, '');
    let response = await fetch(`${rootBaseUrl}/api/chatty/construct/create`, options);
    if (response.status === 401) {
      clearSession();
      sessionBridgeCache = null;
      const refreshed = await getAuthorizedRequestOptions({ method: 'POST', body: mapCreatePayload(input) }, true);
      response = await fetch(`${refreshed[0].replace(/\/api\/vault$/, '')}/api/chatty/construct/create`, refreshed[1]);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !(data as any)?.success) {
      throw new Error((data as any)?.error || 'Failed to create construct in VVAULT');
    }
    return this.getConstructEditor(input.callsign);
  }
}
