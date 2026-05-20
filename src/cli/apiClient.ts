import fs from 'node:fs/promises';
import path from 'node:path';
import { CLIAuth, cliAuth } from './auth.js';
import { getChattyCliHome } from './paths.js';

export const DEFAULT_API_URL =
  process.env.CHATTY_API_URL || 'http://127.0.0.1:5050';
export const DEFAULT_CLI_CONSTRUCT_ID =
  process.env.CHATTY_CLI_CONSTRUCT_ID || 'zen-001';

const KEY_CHECKLIST_STAGES = new Set([
  'auth',
  'construct_identity',
  'orchestration_mode',
  'transcript_memory',
  'continuity_restored',
  'transcript_law_evidence',
  'capsule_runtime_evidence',
  'provider',
  'identity_coherence',
  'persistence',
]);
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const CONSTRUCT_CATALOG_CACHE_FILE = path.join(
  getChattyCliHome(),
  'construct-catalog.json',
);

export interface CanonicalMessageRequest {
  constructId?: string;
  message: string;
  threadId?: string | null;
  sessionId?: string | null;
  model?: string | null;
  provider?: string | null;
  skipPersistence?: boolean;
  attachments?: unknown[];
  continueTurn?: boolean;
  continuity_expected?: boolean;
  resume_from_turn_id?: string | null;
  resume_from_continuity_seq?: number | null;
  resume_tail_hash?: string | null;
  resume_construct_revision?: string | null;
  resume_source_seat?: string | null;
}

export interface CanonicalMessagePayload {
  ok?: boolean;
  success?: boolean;
  response?: string;
  message?: string;
  error?: string;
  construct_id?: string;
  runtime_receipt?: any;
  orchestration_checklist?: any;
  [key: string]: any;
}

export interface CanonicalMessageResult {
  ok: boolean;
  status: number;
  payload: CanonicalMessagePayload;
}

export interface SendCanonicalMessageOptions {
  apiUrl?: string;
  allowInteractiveAuth?: boolean;
  openBrowser?: boolean;
  timeoutMs?: number;
}

export interface CliConstructCard {
  constructId: string;
  callsign: string;
  displayName: string;
  description: string;
  avatarUrl: string | null;
  avatarSha256: string | null;
  updatedAt: string | null;
}

export interface CliConstructCatalogResult {
  constructs: CliConstructCard[];
  source: 'live' | 'cache';
  cachedAt: string | null;
  apiBaseUrl: string | null;
}

interface VvaultBridgePayload {
  ok?: boolean;
  token?: string;
  apiBaseUrl?: string;
  expiresAt?: string | null;
  error?: string;
  message?: string;
  [key: string]: any;
}

interface ConstructCatalogCachePayload {
  version: 1;
  savedAt: string;
  constructs: CliConstructCard[];
}

export interface CliReceiptSummary {
  routeMode: string | null;
  constructId: string | null;
  persistenceOwner: string | null;
  orchestrationMode: string | null;
  provider: string | null;
  model: string | null;
  requestedSeat: string | null;
  requestedCanonicalSeat: string | null;
  localCloudFallbackState: string | null;
  fallbackUsed: boolean;
}

export interface CliChecklistStageSummary {
  id: string | null;
  status: string | null;
  owner: string | null;
  summary: string | null;
}

export interface CliChecklistSummary {
  overallStatus: string | null;
  responseStatus: string | null;
  summary: string | null;
  stages: CliChecklistStageSummary[];
}

export interface CliTurnMetadata {
  transport: 'backend';
  constructId: string | null;
  success: boolean;
  status: number;
  error: string | null;
  receipt: CliReceiptSummary | null;
  checklist: CliChecklistSummary | null;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstDefined<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function normalizeApiUrl(apiUrl = DEFAULT_API_URL): string {
  return apiUrl.replace(/\/$/, '');
}

function getRequestTimeoutMs(timeoutMs?: number): number {
  return typeof timeoutMs === 'number' && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function normalizePayload(payload: unknown): CanonicalMessagePayload {
  if (payload && typeof payload === 'object') {
    return payload as CanonicalMessagePayload;
  }

  const fallback = trimToNull(String(payload ?? ''));
  return fallback ? { success: false, error: fallback } : {};
}

function titleizeConstruct(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeConstructCard(payload: unknown): CliConstructCard | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const constructId = trimToNull(
    firstDefined(
      record.constructId,
      record.construct_id,
      record.id,
      record.callsign,
      record.constructCallsign,
      record.construct_callsign,
    ) ?? null,
  );
  const callsign = trimToNull(
    firstDefined(
      record.callsign,
      record.constructCallsign,
      record.construct_callsign,
      constructId,
    ) ?? null,
  );

  if (!constructId || !callsign) {
    return null;
  }

  const displayName =
    trimToNull(
      firstDefined(
        record.displayName,
        record.display_name,
        record.name,
        record.title,
      ) ?? null,
    ) || titleizeConstruct(callsign.replace(/-\d+$/, ''));
  const description =
    trimToNull(
      firstDefined(record.description, record.summary, record.bio) ?? null,
    ) || '';
  const avatar =
    record.avatar && typeof record.avatar === 'object'
      ? (record.avatar as Record<string, unknown>)
      : null;

  return {
    constructId,
    callsign,
    displayName,
    description,
    avatarUrl: trimToNull(
      firstDefined(record.avatarUrl, record.avatar_url, avatar?.url) ?? null,
    ),
    avatarSha256: trimToNull(
      firstDefined(
        record.avatarSha256,
        record.avatar_sha256,
        avatar?.sha256,
      ) ?? null,
    ),
    updatedAt: trimToNull(
      firstDefined(record.updatedAt, record.updated_at) ?? null,
    ),
  };
}

function normalizeConstructCards(payload: unknown): CliConstructCard[] {
  const source: unknown[] = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as any).constructs)
      ? (payload as any).constructs
      : [];

  return source
    .map((entry) => normalizeConstructCard(entry))
    .filter((entry): entry is CliConstructCard => Boolean(entry));
}

function normalizeBridgePayload(payload: unknown): VvaultBridgePayload {
  if (payload && typeof payload === 'object') {
    return payload as VvaultBridgePayload;
  }

  const fallback = trimToNull(String(payload ?? ''));
  return fallback ? { ok: false, error: fallback, message: fallback } : {};
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return normalizeBridgePayload(text) as T;
  }
}

async function writeConstructCatalogCache(
  constructs: CliConstructCard[],
): Promise<ConstructCatalogCachePayload> {
  const payload: ConstructCatalogCachePayload = {
    version: 1,
    savedAt: new Date().toISOString(),
    constructs,
  };

  await fs.mkdir(path.dirname(CONSTRUCT_CATALOG_CACHE_FILE), { recursive: true });
  await fs.writeFile(
    CONSTRUCT_CATALOG_CACHE_FILE,
    JSON.stringify(payload, null, 2),
    'utf8',
  );
  return payload;
}

async function readConstructCatalogCache(): Promise<ConstructCatalogCachePayload | null> {
  try {
    const raw = await fs.readFile(CONSTRUCT_CATALOG_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ConstructCatalogCachePayload>;
    if (!Array.isArray(parsed.constructs)) {
      return null;
    }

    return {
      version: 1,
      savedAt: trimToNull(parsed.savedAt) || new Date().toISOString(),
      constructs: normalizeConstructCards(parsed.constructs),
    };
  } catch {
    return null;
  }
}

function summarizeReceipt(
  runtimeReceipt: any,
  payload: CanonicalMessagePayload,
): CliReceiptSummary | null {
  if (!runtimeReceipt && !payload.construct_id) {
    return null;
  }

  const provider = runtimeReceipt?.provider || {};
  const seatPlan = provider?.seat_plan || {};

  return {
    routeMode: trimToNull(runtimeReceipt?.route_mode ?? null),
    constructId: trimToNull(
      firstDefined(
        runtimeReceipt?.construct_id,
        runtimeReceipt?.effective_construct_id,
        runtimeReceipt?.identity?.effective_construct_id,
        payload.construct_id,
      ) ?? null,
    ),
    persistenceOwner: trimToNull(runtimeReceipt?.persistence_owner ?? null),
    orchestrationMode: trimToNull(
      firstDefined(runtimeReceipt?.orchestration_mode, provider?.mode) ?? null,
    ),
    provider: trimToNull(
      firstDefined(provider?.final_provider, provider?.provider, payload.provider_used) ??
        null,
    ),
    model: trimToNull(firstDefined(provider?.model, payload.model) ?? null),
    requestedSeat: trimToNull(
      firstDefined(provider?.requested_seat, seatPlan?.requested_seat) ?? null,
    ),
    requestedCanonicalSeat: trimToNull(
      firstDefined(
        provider?.requested_canonical_seat,
        seatPlan?.requested_canonical_seat,
      ) ?? null,
    ),
    localCloudFallbackState: trimToNull(provider?.local_cloud_fallback_state ?? null),
    fallbackUsed: Boolean(
      firstDefined(provider?.fallback_used, payload.fallback, false),
    ),
  };
}

function summarizeChecklist(checklist: any): CliChecklistSummary | null {
  if (!checklist || typeof checklist !== 'object') {
    return null;
  }

  const rawStages: any[] = Array.isArray(checklist.stages) ? checklist.stages : [];
  const interestingStages = rawStages.filter(
    (stage) => stage && KEY_CHECKLIST_STAGES.has(String(stage.id || '')),
  );
  const stagesToSummarize = interestingStages.length > 0
    ? interestingStages
    : rawStages.slice(0, 4);

  return {
    overallStatus: trimToNull(checklist.overallStatus ?? null),
    responseStatus: trimToNull(checklist.responseStatus ?? null),
    summary: trimToNull(checklist.summary ?? null),
    stages: stagesToSummarize.map((stage) => ({
      id: trimToNull(stage?.id ?? null),
      status: trimToNull(stage?.status ?? null),
      owner: trimToNull(stage?.owner ?? null),
      summary: trimToNull(
        firstDefined(stage?.summary, stage?.why) ?? null,
      ),
    })),
  };
}

export function summarizeCanonicalTurn(
  payload: CanonicalMessagePayload,
  status: number,
): CliTurnMetadata {
  const normalizedPayload = normalizePayload(payload);
  const explicitSuccess = normalizedPayload.success;
  const explicitOk = normalizedPayload.ok;
  return {
    transport: 'backend',
    constructId: trimToNull(
      firstDefined(
        normalizedPayload.construct_id,
        normalizedPayload.runtime_receipt?.construct_id,
        normalizedPayload.runtime_receipt?.effective_construct_id,
      ) ?? null,
    ),
    success:
      explicitSuccess === true ||
      explicitOk === true ||
      (explicitSuccess === undefined &&
        explicitOk === undefined &&
        status >= 200 &&
        status < 300),
    status,
    error: trimToNull(
      firstDefined(normalizedPayload.error, normalizedPayload.message) ?? null,
    ),
    receipt: summarizeReceipt(normalizedPayload.runtime_receipt, normalizedPayload),
    checklist: summarizeChecklist(normalizedPayload.orchestration_checklist),
  };
}

class CLIApiClient {
  private getAuthClient(apiUrl: string): CLIAuth {
    return normalizeApiUrl(apiUrl) === normalizeApiUrl(DEFAULT_API_URL)
      ? cliAuth
      : new CLIAuth(apiUrl);
  }

  private async ensureCookie(
    apiUrl: string,
    allowInteractiveAuth: boolean,
    openBrowser: boolean,
  ): Promise<string | null> {
    const authClient = this.getAuthClient(apiUrl);
    if (allowInteractiveAuth) {
      await authClient.autoAuthenticate({ openBrowser });
    } else {
      await authClient.getCurrentUser();
    }
    return authClient.getCookie();
  }

  private async fetchWithTimeout<T>(
    input: string,
    init: RequestInit,
    timeoutMs?: number,
  ): Promise<{ response: Response; payload: T }> {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const resolvedTimeoutMs = getRequestTimeoutMs(timeoutMs);
    const timeoutHandle =
      controller
        ? setTimeout(() => controller.abort(), resolvedTimeoutMs)
        : null;

    try {
      const response = await fetch(input, {
        ...init,
        ...(controller ? { signal: controller.signal } : {}),
      });
      const payload = await readJsonResponse<T>(response);
      return { response, payload };
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        throw new Error(`Request timed out after ${resolvedTimeoutMs}ms.`);
      }
      throw error;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private async getVvaultBridge(
    apiUrl: string,
    cookie: string,
    timeoutMs?: number,
  ): Promise<{ token: string; apiBaseUrl: string }> {
    const { response, payload } =
      await this.fetchWithTimeout<VvaultBridgePayload>(
        `${apiUrl}/api/vvault/auth/token`,
        {
          headers: {
            Cookie: cookie,
            'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        },
        timeoutMs,
      );

    const token = trimToNull(payload.token);
    const apiBaseUrl = trimToNull(payload.apiBaseUrl);
    if (response.ok && payload.ok === true && token && apiBaseUrl) {
      return {
        token,
        apiBaseUrl: normalizeApiUrl(apiBaseUrl),
      };
    }

    const errorMessage =
      trimToNull(firstDefined(payload.error, payload.message) ?? null) ||
      `VVAULT auth token request failed with ${response.status}.`;
    throw new Error(errorMessage);
  }

  private async fetchVvaultConstructCatalog(
    apiBaseUrl: string,
    token: string,
    timeoutMs?: number,
  ): Promise<{ response: Response; payload: unknown }> {
    return this.fetchWithTimeout<unknown>(
      `${apiBaseUrl}/constructs`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      timeoutMs,
    );
  }

  async listConstructCatalog(
    options: SendCanonicalMessageOptions = {},
  ): Promise<CliConstructCatalogResult> {
    const apiUrl = normalizeApiUrl(options.apiUrl || DEFAULT_API_URL);
    const cookie = await this.ensureCookie(
      apiUrl,
      options.allowInteractiveAuth === true,
      options.openBrowser !== false,
    );

    if (!cookie) {
      throw new Error(
        'Chatty CLI is not authenticated for the current canonical /api/vvault/message route. Open the Chatty web app and complete CLI auth first.',
      );
    }

    let liveError: Error | null = null;

    try {
      let bridge = await this.getVvaultBridge(apiUrl, cookie, options.timeoutMs);
      let { response, payload } = await this.fetchVvaultConstructCatalog(
        bridge.apiBaseUrl,
        bridge.token,
        options.timeoutMs,
      );

      if (response.status === 401) {
        bridge = await this.getVvaultBridge(apiUrl, cookie, options.timeoutMs);
        ({ response, payload } = await this.fetchVvaultConstructCatalog(
          bridge.apiBaseUrl,
          bridge.token,
          options.timeoutMs,
        ));
      }

      if (!response.ok) {
        const errorMessage =
          trimToNull(
            firstDefined((payload as any)?.error, (payload as any)?.message) ?? null,
          ) || `VVAULT construct catalog request failed with ${response.status}.`;
        throw new Error(errorMessage);
      }

      const constructs = normalizeConstructCards(payload);
      const cachePayload = await writeConstructCatalogCache(constructs);
      return {
        constructs,
        source: 'live',
        cachedAt: cachePayload.savedAt,
        apiBaseUrl: bridge.apiBaseUrl,
      };
    } catch (error) {
      liveError = error instanceof Error ? error : new Error(String(error));
    }

    const cached = await readConstructCatalogCache();
    if (cached && cached.constructs.length > 0) {
      return {
        constructs: cached.constructs,
        source: 'cache',
        cachedAt: cached.savedAt,
        apiBaseUrl: null,
      };
    }

    throw liveError || new Error('Failed to load construct catalog.');
  }

  async sendCanonicalMessage(
    request: CanonicalMessageRequest,
    options: SendCanonicalMessageOptions = {},
  ): Promise<CanonicalMessageResult> {
    const apiUrl = normalizeApiUrl(options.apiUrl || DEFAULT_API_URL);
    const cookie = await this.ensureCookie(
      apiUrl,
      options.allowInteractiveAuth === true,
      options.openBrowser !== false,
    );

    if (!cookie) {
      throw new Error(
        'Chatty CLI is not authenticated for the current canonical /api/vvault/message route. Open the Chatty web app and complete CLI auth first.',
      );
    }

    const { response, payload } =
      await this.fetchWithTimeout<CanonicalMessagePayload>(
        `${apiUrl}/api/vvault/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
            'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          body: JSON.stringify({
            constructId: request.constructId || DEFAULT_CLI_CONSTRUCT_ID,
            message: request.message,
            ...(request.threadId ? { threadId: request.threadId } : {}),
            ...(request.sessionId ? { sessionId: request.sessionId } : {}),
            ...(request.model ? { model: request.model } : {}),
            ...(request.provider ? { provider: request.provider } : {}),
            ...(Array.isArray(request.attachments)
              ? { attachments: request.attachments }
              : {}),
            ...(typeof request.continueTurn === 'boolean'
              ? { continueTurn: request.continueTurn }
              : {}),
            ...(typeof request.skipPersistence === 'boolean'
              ? { skipPersistence: request.skipPersistence }
              : {}),
            ...(typeof request.continuity_expected === 'boolean'
              ? { continuity_expected: request.continuity_expected }
              : {}),
            ...(request.resume_from_turn_id
              ? { resume_from_turn_id: request.resume_from_turn_id }
              : {}),
            ...(typeof request.resume_from_continuity_seq === 'number'
              ? {
                  resume_from_continuity_seq:
                    request.resume_from_continuity_seq,
                }
              : {}),
            ...(request.resume_tail_hash
              ? { resume_tail_hash: request.resume_tail_hash }
              : {}),
            ...(request.resume_construct_revision
              ? {
                  resume_construct_revision:
                    request.resume_construct_revision,
                }
              : {}),
            ...(request.resume_source_seat
              ? { resume_source_seat: request.resume_source_seat }
              : {}),
          }),
        },
        options.timeoutMs,
      );

    return {
      ok: response.ok,
      status: response.status,
      payload: normalizePayload(payload),
    };
  }
}

export const cliApiClient = new CLIApiClient();
