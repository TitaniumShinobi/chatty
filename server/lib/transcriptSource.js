const ROUTE_BUCKETS = new Set(['documents', 'assets', 'transcripts']);
const REVIEW_ONLY_TRANSCRIPT_SOURCES = new Set(['', 'transcripts', 'other', 'unknown', 'documents', 'document', 'assets', 'asset']);

const SOURCE_ALIASES = new Map([
  ['chat_gpt', 'chatgpt'],
  ['chat-gpt', 'chatgpt'],
  ['character_ai', 'character.ai'],
  ['character-ai', 'character.ai'],
  ['character ai', 'character.ai'],
  ['character', 'character.ai'],
  ['github-copilot', 'github_copilot'],
  ['copilot', 'github_copilot'],
  ['github copilot', 'github_copilot'],
  ['copilot_github', 'github_copilot'],
  ['chatty-preview', 'chatty'],
]);

const MONTH_NAMES = new Set([
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]);

function cleanSegment(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

export function isYearSegment(value) {
  return /^\d{4}$/.test(String(value || '').trim());
}

export function isMonthSegment(value) {
  return MONTH_NAMES.has(cleanSegment(value));
}

export function normalizeTranscriptSource(rawSource, options = {}) {
  const fallback = options.fallback ?? '';
  const cleaned = cleanSegment(rawSource).replace(/\s+/g, '_');
  if (!cleaned) return fallback;

  const aliasHit = SOURCE_ALIASES.get(cleaned) || SOURCE_ALIASES.get(cleaned.replace(/_/g, ' '));
  if (aliasHit) return aliasHit;

  return cleaned;
}

export function isReviewOnlyTranscriptSource(rawSource) {
  const normalized = normalizeTranscriptSource(rawSource, { fallback: '' });
  return REVIEW_ONLY_TRANSCRIPT_SOURCES.has(normalized);
}

export function requireCanonicalTranscriptSource(rawSource, options = {}) {
  const normalized = normalizeTranscriptSource(rawSource, { fallback: '' });
  if (isReviewOnlyTranscriptSource(normalized)) {
    const label = options.label || 'Transcript source';
    throw new Error(`${label} must identify a real provider/source; received ${rawSource || 'missing'}`);
  }
  return normalized;
}

function splitPathSegments(filename) {
  return String(filename || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
}

function findConstructTail(filename, constructCallsign) {
  const parts = splitPathSegments(filename);
  const instancesIdx = parts.findIndex(p => p === 'instances');
  if (instancesIdx < 0) return [];

  const constructIdx = parts.findIndex((part, idx) => idx > instancesIdx && part === constructCallsign);
  if (constructIdx < 0) return [];

  return parts.slice(constructIdx + 1);
}

function looksLikeFilenameSegment(segment) {
  return /\.[a-z0-9]{1,6}$/i.test(String(segment || ''));
}

export function extractSourceFromTranscriptPath(filename, constructCallsign) {
  const tail = findConstructTail(filename, constructCallsign);
  if (tail.length === 0) return null;

  const first = cleanSegment(tail[0]);
  let candidate = first;

  if (ROUTE_BUCKETS.has(first)) {
    const next = tail[1];
    if (next && !isYearSegment(next) && !isMonthSegment(next) && !looksLikeFilenameSegment(next)) {
      candidate = next;
    } else {
      return null;
    }
  }

  return normalizeTranscriptSource(candidate, { fallback: null });
}

export function toCanonicalTranscriptFilename(existingFilename, constructCallsign, sourceOverride = null) {
  const tail = findConstructTail(existingFilename, constructCallsign);
  if (tail.length === 0) return existingFilename;

  const canonicalSource = normalizeTranscriptSource(
    sourceOverride || extractSourceFromTranscriptPath(existingFilename, constructCallsign),
    { fallback: '' }
  );

  if (isReviewOnlyTranscriptSource(canonicalSource)) {
    return existingFilename;
  }

  const remainder = [...tail];

  if (remainder.length > 0 && ROUTE_BUCKETS.has(cleanSegment(remainder[0]))) {
    remainder.shift();
  }

  if (remainder.length > 0) {
    const maybeSource = normalizeTranscriptSource(remainder[0], { fallback: '' });
    if (maybeSource && maybeSource === canonicalSource && !isYearSegment(remainder[0]) && !isMonthSegment(remainder[0])) {
      remainder.shift();
    }
  }

  return ['instances', constructCallsign, canonicalSource, ...remainder].join('/');
}

export function canonicalSourceFolderList() {
  return [
    'chatgpt',
    'character.ai',
    'chatty',
    'validation',
    'codex',
    'github_copilot',
    'gemini',
    'claude',
    'grok',
    'copilot',
    'deepseek',
    'openrouter',
    'ollama',
  ];
}
