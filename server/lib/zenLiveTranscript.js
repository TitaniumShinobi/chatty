import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ZEN_LIVE_SCHEMA_VERSION = 1;
export const ZEN_LIVE_CONSTRUCT_ID = 'zen-001';
export const ZEN_LIVE_SESSION_ID = `${ZEN_LIVE_CONSTRUCT_ID}_chat_with_${ZEN_LIVE_CONSTRUCT_ID}`;

export const ZEN_LIVE_EVENT_KINDS = new Set([
  'user_message',
  'assistant_started',
  'assistant_token',
  'assistant_done',
  'assistant_error',
  'status',
]);

const MAX_TEXT_LENGTH = 12000;
const MAX_HISTORY_EVENTS = 240;
const listenersBySession = new Map();
const historyBySession = new Map();
const DEFAULT_ZEN_LIVE_STORE_PATH = path.join(os.homedir(), '.chatty', 'zen-live-transcript.json');
const ZEN_MODE_SURFACES = new Set(['chatty', 'quantum', 'code', 'vvault']);
const ZEN_MODE_PERMISSIONS = new Set(['none', 'read-only-default', 'approval-gated']);
const ZEN_MODE_SCOPES = new Set([
  'general',
  'browser-page',
  'repo-maintenance',
  'continuity-and-transcript-integrity',
]);
const ZEN_MODE_NAMES = new Set([
  'conversation',
  'browser-companion',
  'dev:chatty',
  'dev:quantum',
  'dev:code',
  'dev:vvault',
  'safe:chatty',
  'safe:quantum',
  'safe:code',
  'safe:vvault',
  'recover:chatty',
  'recover:quantum',
  'recover:code',
  'recover:vvault',
]);

const ZEN_MODE_DEFAULTS = {
  chatty: {
    mode: 'conversation',
    scope: 'general',
    permissions: 'none',
  },
  quantum: {
    mode: 'browser-companion',
    scope: 'browser-page',
    permissions: 'read-only-default',
  },
  code: {
    mode: 'dev:code',
    scope: 'repo-maintenance',
    permissions: 'read-only-default',
  },
  vvault: {
    mode: 'dev:vvault',
    scope: 'continuity-and-transcript-integrity',
    permissions: 'read-only-default',
  },
};

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function clampText(value) {
  if (typeof value !== 'string') return undefined;
  return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeSessionId(value) {
  const sessionId = normalizeString(value, ZEN_LIVE_SESSION_ID);
  return sessionId === ZEN_LIVE_SESSION_ID ? sessionId : ZEN_LIVE_SESSION_ID;
}

function normalizeModeSurface(value, sourceProduct) {
  const requested = normalizeString(value).toLowerCase();
  if (ZEN_MODE_SURFACES.has(requested)) return requested;

  const source = normalizeString(sourceProduct).toLowerCase();
  if (ZEN_MODE_SURFACES.has(source)) return source;

  return 'chatty';
}

function normalizeModeName(value, surface) {
  const requested = normalizeString(value).toLowerCase();
  if (ZEN_MODE_NAMES.has(requested)) return requested;

  if (requested === 'dev' || requested === 'safe' || requested === 'recover') {
    return `${requested}:${surface}`;
  }

  return ZEN_MODE_DEFAULTS[surface].mode;
}

function normalizeModeScope(value, surface) {
  const requested = normalizeString(value).toLowerCase();
  if (ZEN_MODE_SCOPES.has(requested)) return requested;
  return ZEN_MODE_DEFAULTS[surface].scope;
}

function normalizeModePermissions(value, mode, surface) {
  if (mode.startsWith('recover:')) return 'approval-gated';
  if (mode.startsWith('dev:') || mode.startsWith('safe:') || mode === 'browser-companion') {
    return 'read-only-default';
  }

  const requested = normalizeString(value).toLowerCase();
  if (ZEN_MODE_PERMISSIONS.has(requested)) return requested;
  return ZEN_MODE_DEFAULTS[surface].permissions;
}

function normalizeCommandTokens(value, triggeredBy) {
  const source = Array.isArray(value)
    ? value
    : typeof triggeredBy === 'string'
      ? triggeredBy.trim().split(/\s+/)
      : [];

  return source
    .filter((token) => typeof token === 'string')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.startsWith('/'))
    .slice(0, 8)
    .map((token) => (token.length > 64 ? token.slice(0, 64) : token));
}

function shapeZenModeEnvelope(input, context = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }

  const surface = normalizeModeSurface(input.surface, context.sourceProduct);
  const mode = normalizeModeName(input.mode, surface);
  const scope = normalizeModeScope(input.scope, surface);
  const permissions = normalizeModePermissions(input.permissions, mode, surface);

  return {
    constructId: ZEN_LIVE_CONSTRUCT_ID,
    sessionId: ZEN_LIVE_SESSION_ID,
    surface,
    mode,
    scope,
    permissions,
    mutationRequiresApproval: true,
    commandTokens: normalizeCommandTokens(input.commandTokens, input.triggeredBy),
    cleanedPrompt: clampText(input.cleanedPrompt) || '',
  };
}

function resolveZenLiveStorePath() {
  return path.resolve(process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH || DEFAULT_ZEN_LIVE_STORE_PATH);
}

function readDurableEnvelope() {
  const filePath = resolveZenLiveStorePath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}

  return {
    version: ZEN_LIVE_SCHEMA_VERSION,
    sessions: {},
  };
}

function durableSessionHistory(sessionId) {
  const envelope = readDurableEnvelope();
  const sessions = envelope.sessions;
  if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) {
    return [];
  }
  const history = sessions[sessionId];
  return Array.isArray(history) ? history : [];
}

function uniqueRecentEvents(events) {
  const seenEventIds = new Set();
  const deduped = [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const eventId = normalizeString(event?.eventId);
    if (!eventId || seenEventIds.has(eventId)) continue;
    seenEventIds.add(eventId);
    deduped.push(event);
  }
  return deduped.reverse().slice(-MAX_HISTORY_EVENTS);
}

function persistDurableSessionHistory(sessionId, events) {
  const filePath = resolveZenLiveStorePath();
  const dirPath = path.dirname(filePath);
  const envelope = readDurableEnvelope();
  const sessions = envelope.sessions && typeof envelope.sessions === 'object' && !Array.isArray(envelope.sessions)
    ? envelope.sessions
    : {};
  sessions[sessionId] = uniqueRecentEvents(events);
  const nextEnvelope = {
    version: ZEN_LIVE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    sessions,
  };
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(nextEnvelope, null, 2)}\n`, 'utf8');
}

export function shapeZenLiveTranscriptEvent(input = {}) {
  const kind = normalizeString(input.kind || input.eventType);
  if (!ZEN_LIVE_EVENT_KINDS.has(kind)) {
    return { ok: false, error: 'invalid_zen_live_event_kind' };
  }

  const timestamp = normalizeTimestamp(input.timestamp);
  const sessionId = normalizeSessionId(input.sessionId);
  const constructId = ZEN_LIVE_CONSTRUCT_ID;
  const turnId = normalizeString(input.turnId, `zen-turn-${Date.parse(timestamp) || Date.now()}`);
  const eventId = normalizeString(input.eventId, `${turnId}:${kind}:${Date.parse(timestamp) || Date.now()}`);
  const sourceProduct = normalizeString(input.sourceProduct, 'unknown');
  const modeEnvelope = shapeZenModeEnvelope(input.modeEnvelope, { sourceProduct });

  return {
    ok: true,
    event: {
      schemaVersion: ZEN_LIVE_SCHEMA_VERSION,
      eventId,
      sessionId,
      constructId,
      turnId,
      sourceProduct,
      kind,
      timestamp,
      content: clampText(input.content),
      delta: clampText(input.delta ?? input.token),
      message: clampText(input.message),
      status: clampText(input.status),
      ...(modeEnvelope ? { modeEnvelope } : {}),
    },
  };
}

function addToHistory(event) {
  const durableHistory = durableSessionHistory(event.sessionId);
  const inMemoryHistory = historyBySession.get(event.sessionId) || [];
  const nextHistory = uniqueRecentEvents([...durableHistory, ...inMemoryHistory, event]);
  historyBySession.set(event.sessionId, nextHistory);
  persistDurableSessionHistory(event.sessionId, nextHistory);
}

function ensureSessionHistoryLoaded(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const history = uniqueRecentEvents([
    ...durableSessionHistory(normalizedSessionId),
    ...(historyBySession.get(normalizedSessionId) || []),
  ]);
  historyBySession.set(normalizedSessionId, history);
  return history;
}

export function getZenLiveTranscriptSnapshot(sessionId = ZEN_LIVE_SESSION_ID) {
  return [...ensureSessionHistoryLoaded(sessionId)];
}

export function clearZenLiveTranscriptForTest(options = {}) {
  historyBySession.clear();
  listenersBySession.clear();
  if (options.keepDurable === true) {
    return;
  }
  try {
    fs.unlinkSync(resolveZenLiveStorePath());
  } catch {}
}

export function subscribeZenLiveTranscript(sessionId, listener) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const listeners = listenersBySession.get(normalizedSessionId) || new Set();
  listeners.add(listener);
  listenersBySession.set(normalizedSessionId, listeners);

  return () => {
    const current = listenersBySession.get(normalizedSessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersBySession.delete(normalizedSessionId);
    }
  };
}

export function publishZenLiveTranscriptEvent(input) {
  const shaped = shapeZenLiveTranscriptEvent(input);
  if (!shaped.ok) return shaped;

  const event = shaped.event;
  addToHistory(event);

  const listeners = listenersBySession.get(event.sessionId);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[ZenLiveTranscript] listener failed:', error?.message || error);
      }
    }
  }

  return { ok: true, event };
}

export function formatZenLiveSseEvent(event) {
  return `event: zen-live-event\ndata: ${JSON.stringify(event)}\n\n`;
}
