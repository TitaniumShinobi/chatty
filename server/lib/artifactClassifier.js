const CORE_FOLDERS = new Set(['identity', 'config', 'documents', 'assets', 'memup', 'logs', 'data']);
const REVIEW_ONLY_FOLDERS = new Set(['transcripts', 'other', 'unknown']);
const LEGACY_IDENTITY_CONFIG_FILES = new Set(['prompt.txt', 'conditioning.txt', 'voice.md', 'gender.json', 'personality.json', 'tone_profile.json']);
const DOCUMENT_PROVIDER_SLUGS = new Set([
  'chatgpt',
  'character.ai',
  'character_ai',
  'github_copilot',
  'github-copilot',
  'codex',
  'gemini',
  'claude',
  'grok',
  'copilot',
  'deepseek',
  'chatty',
]);
const MEDIA_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'avif', 'wav', 'mp3', 'm4a', 'ogg']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'log', 'html']);

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}

function extensionOf(filename) {
  const name = String(filename || '').split('/').pop() || '';
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function firstFolder(relativePath) {
  return normalizeRelativePath(relativePath).split('/').filter(Boolean)[0] || '';
}

function looksTranscriptNamed(relativePath) {
  const lower = normalizeRelativePath(relativePath).toLowerCase();
  return lower.includes('transcript') || lower.includes('conversation') || lower.includes('chat_with_') || lower.includes('_chat.');
}

export function classifyConstructArtifactPath(relativePath, options = {}) {
  const cleanPath = normalizeRelativePath(relativePath);
  const folder = firstFolder(cleanPath);
  const ext = extensionOf(cleanPath);
  const mimeType = String(options.mimeType || '').toLowerCase();

  if (!cleanPath) {
    return { artifactClass: 'review_required', folder: 'review_required', fileType: 'review_required', reviewRequired: true, reason: 'Empty path.' };
  }

  if (REVIEW_ONLY_FOLDERS.has(folder)) {
    return {
      artifactClass: 'review_required',
      folder: 'review_required',
      fileType: 'review_required',
      reviewRequired: true,
      reason: `${folder}/ is a review/migration state, not canonical construct storage.`,
    };
  }

  const baseName = cleanPath.toLowerCase().split('/').pop() || cleanPath.toLowerCase();
  if (LEGACY_IDENTITY_CONFIG_FILES.has(baseName)) {
    return { artifactClass: 'review_required', folder: 'review_required', fileType: 'review_required', reviewRequired: true, reason: `${baseName} is legacy or non-canonical and must be reviewed before write.` };
  }
  if (baseName.endsWith('.capsule') || baseName.endsWith('.capsuleso')) return { artifactClass: 'memory_capsule', folder: 'memup', fileType: 'capsule', reviewRequired: false, reason: 'Capsule file.' };
  if (baseName.startsWith('chat_with_') && baseName.endsWith('.md')) return { artifactClass: 'provider_transcript', folder: 'chatty', fileType: 'conversation', reviewRequired: false, reason: 'Chatty canonical conversation transcript.' };
  if (['prompt.json', 'definition.json', 'voice.json'].includes(baseName)) return { artifactClass: 'identity', folder: 'identity', fileType: 'identity', reviewRequired: false, reason: 'Canonical identity file.' };
  if (baseName === 'avatar.png') return { artifactClass: 'identity', folder: 'identity', fileType: 'identity', reviewRequired: false, reason: 'Canonical identity avatar.' };
  if (/^avatar\.(jpe?g|webp|avif|svg|gif)$/i.test(baseName)) return { artifactClass: 'identity', folder: 'identity', fileType: 'identity', reviewRequired: false, reason: 'Canonical-compatible identity avatar.' };
  if (/^[a-z0-9-]+_glyph\.(png|jpe?g|webp|avif|svg|gif)$/i.test(baseName) && folder === 'identity') {
    return { artifactClass: 'identity', folder: 'identity', fileType: 'identity', reviewRequired: false, reason: 'Construct identity glyph can serve as avatar fallback.' };
  }
  if (baseName === 'metadata.json' || baseName.endsWith('.action.json')) return { artifactClass: 'config', folder: 'config', fileType: 'config', reviewRequired: false, reason: 'Runtime config file.' };
  if (baseName.endsWith('.log')) return { artifactClass: 'functional_log', folder: 'logs', fileType: 'log', reviewRequired: false, reason: 'Log file.' };
  if (MEDIA_EXTENSIONS.has(ext) || mimeType.startsWith('image/') || mimeType.startsWith('audio/')) return { artifactClass: 'media_asset', folder: 'assets', fileType: 'assets', reviewRequired: false, reason: 'Media asset.' };

  const segments = cleanPath.toLowerCase().split('/').filter(Boolean);
  if (folder === 'documents' && (looksTranscriptNamed(cleanPath) || DOCUMENT_PROVIDER_SLUGS.has(segments[1]))) {
    return {
      artifactClass: 'review_required',
      folder: 'review_required',
      fileType: 'review_required',
      reviewRequired: true,
      reason: 'Transcript/provider-shaped material under documents/ requires review before canonical storage.',
    };
  }

  if (folder && !CORE_FOLDERS.has(folder)) {
    if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith('text/') || mimeType.includes('json')) {
      return { artifactClass: 'provider_transcript', folder, fileType: 'transcript', reviewRequired: false, reason: 'Provider/source folder supplied.' };
    }
    return { artifactClass: 'review_required', folder: 'review_required', fileType: 'review_required', reviewRequired: true, reason: `Provider-like folder ${folder}/ has unsupported file type.` };
  }

  if (looksTranscriptNamed(cleanPath) && folder !== 'documents') {
    return { artifactClass: 'review_required', folder: 'review_required', fileType: 'review_required', reviewRequired: true, reason: 'Transcript-like filename requires provider/source folder.' };
  }

  return { artifactClass: 'knowledge_document', folder: 'documents', fileType: 'documents', reviewRequired: false, reason: 'Default user knowledge document.' };
}
