import { canonicalizeConstructId } from './constructId.js';
import {
  extractSourceFromTranscriptPath,
  normalizeTranscriptSource,
} from './transcriptSource.js';

const LIN_ORCHESTRATED_CONSTRUCTS = new Set([
  'zen-001',
  'lin-001',
  'katana-001',
  'sera-001',
  'nova-001',
  'val-001',
]);

const CANONICAL_CHATTY_HISTORY_CONSTRUCTS = new Set([
  'zen-001',
  'lin-001',
  'val-001',
]);

const SYSTEM_CONSTRUCTS = new Set([
  'zen-001',
  'lin-001',
  'val-001',
]);

const HISTORICAL_SOURCE_MAP = new Map([
  ['zen-001', ['chatty']],
  ['lin-001', ['chatty']],
  ['nova-001', ['chatgpt']],
  ['katana-001', ['chatgpt']],
  ['sera-001', ['character.ai']],
  ['val-001', ['chatty', 'validation']],
]);

function normalizeConstruct(constructId) {
  return canonicalizeConstructId(constructId || '');
}

export function isProtectedZenConstruct(constructId) {
  return normalizeConstruct(constructId) === 'zen-001';
}

export function isValConstruct(constructId) {
  return normalizeConstruct(constructId) === 'val-001';
}

export function isSystemConstruct(constructId) {
  return SYSTEM_CONSTRUCTS.has(normalizeConstruct(constructId));
}

export function isLinOrchestratedConstruct(constructId) {
  return LIN_ORCHESTRATED_CONSTRUCTS.has(normalizeConstruct(constructId));
}

export function usesCanonicalChattyHistory(constructId) {
  return CANONICAL_CHATTY_HISTORY_CONSTRUCTS.has(normalizeConstruct(constructId));
}

export function getHistoricalMemorySources(constructId) {
  const normalized = normalizeConstruct(constructId);
  return HISTORICAL_SOURCE_MAP.get(normalized) || ['chatgpt'];
}

export function getPrimaryHistoricalMemorySource(constructId) {
  return getHistoricalMemorySources(constructId)[0] || 'chatgpt';
}

export function isCanonicalChattyThreadFile(filename, constructId) {
  const normalized = normalizeConstruct(constructId);
  if (!normalized || !filename) return false;
  const normalizedFilename = String(filename).replace(/\\/g, '/');
  return normalizedFilename.endsWith(`instances/${normalized}/chatty/chat_with_${normalized}.md`);
}

export function getTranscriptSourceForFile(file, constructId) {
  const metadataSource = normalizeTranscriptSource(file?.metadata?.source, { fallback: '' });
  if (metadataSource) return metadataSource;

  const filename = String(file?.filename || '');
  const extracted = normalizeTranscriptSource(
    extractSourceFromTranscriptPath(filename, normalizeConstruct(constructId)),
    { fallback: '' },
  );
  if (extracted) return extracted;

  return '';
}

export function matchesHistoricalSourcePolicy(file, constructId) {
  if (!file) return false;
  if (isCanonicalChattyThreadFile(file.filename, constructId)) {
    return usesCanonicalChattyHistory(constructId);
  }

  const preferredSources = getHistoricalMemorySources(constructId);
  const source = getTranscriptSourceForFile(file, constructId);
  if (!source) return false;
  return preferredSources.includes(source);
}

export function rankHistoricalSource(file, constructId) {
  if (!file) return Number.MAX_SAFE_INTEGER;
  if (isCanonicalChattyThreadFile(file.filename, constructId)) {
    return usesCanonicalChattyHistory(constructId) ? 0 : Number.MAX_SAFE_INTEGER;
  }

  const preferredSources = getHistoricalMemorySources(constructId);
  const source = getTranscriptSourceForFile(file, constructId);
  const sourceIndex = preferredSources.indexOf(source);
  if (sourceIndex >= 0) return sourceIndex + 1;
  return Number.MAX_SAFE_INTEGER;
}
