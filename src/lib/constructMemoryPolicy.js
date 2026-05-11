import { canonicalizeConstructId } from './constructId.js';

const LIN_ORCHESTRATED_CONSTRUCTS = new Set([
  'zen-001',
  'lin-001',
  'katana-001',
  'sera-001',
  'nova-001',
  'val-001',
]);

const SYSTEM_CONSTRUCTS = new Set([
  'zen-001',
  'lin-001',
  'val-001',
]);

const CANONICAL_CHATTY_HISTORY_CONSTRUCTS = new Set([
  'zen-001',
  'lin-001',
  'val-001',
]);

const HISTORICAL_SOURCE_MAP = new Map([
  ['zen-001', ['chatty']],
  ['lin-001', ['chatty']],
  ['katana-001', ['chatgpt']],
  ['nova-001', ['chatgpt']],
  ['sera-001', ['character.ai']],
  ['val-001', ['chatty']],
]);

function normalizeConstruct(constructId) {
  return canonicalizeConstructId(constructId || '');
}

export function isProtectedZenConstruct(constructId) {
  return normalizeConstruct(constructId) === 'zen-001';
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
