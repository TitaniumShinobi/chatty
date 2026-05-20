import { canonicalizeConstructId } from './constructId';

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

const HISTORICAL_SOURCE_MAP = new Map<string, string[]>([
  ['zen-001', ['chatty']],
  ['lin-001', ['chatty']],
  ['katana-001', ['chatgpt']],
  ['nova-001', ['chatgpt']],
  ['sera-001', ['character.ai']],
  ['val-001', ['chatty', 'validation']],
]);

function normalizeConstruct(constructId: string | null | undefined): string {
  return canonicalizeConstructId(constructId || '');
}

export function isProtectedZenConstruct(constructId: string | null | undefined): boolean {
  return normalizeConstruct(constructId) === 'zen-001';
}

export function isSystemConstruct(constructId: string | null | undefined): boolean {
  return SYSTEM_CONSTRUCTS.has(normalizeConstruct(constructId));
}

export function isLinOrchestratedConstruct(constructId: string | null | undefined): boolean {
  const normalized = normalizeConstruct(constructId);
  return Boolean(normalized) || LIN_ORCHESTRATED_CONSTRUCTS.has(normalized);
}

export function usesCanonicalChattyHistory(constructId: string | null | undefined): boolean {
  return CANONICAL_CHATTY_HISTORY_CONSTRUCTS.has(normalizeConstruct(constructId));
}

export function getHistoricalMemorySources(constructId: string | null | undefined): string[] {
  const normalized = normalizeConstruct(constructId);
  return HISTORICAL_SOURCE_MAP.get(normalized) || ['chatgpt'];
}

export function getPrimaryHistoricalMemorySource(constructId: string | null | undefined): string {
  return getHistoricalMemorySources(constructId)[0] || 'chatgpt';
}
