const SOURCE_ALIASES: Record<string, string> = {
  chat_gpt: 'chatgpt',
  'chat-gpt': 'chatgpt',
  character_ai: 'character.ai',
  'character-ai': 'character.ai',
  'character ai': 'character.ai',
  character: 'character.ai',
  'github-copilot': 'github_copilot',
  copilot: 'github_copilot',
  'github copilot': 'github_copilot',
  copilot_github: 'github_copilot',
  'chatty-preview': 'chatty',
};

export function normalizeTranscriptSource(rawSource: string | null | undefined, fallback = 'transcripts'): string {
  const cleaned = String(rawSource || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, '_');

  if (!cleaned) return fallback;

  return SOURCE_ALIASES[cleaned] || SOURCE_ALIASES[cleaned.replace(/_/g, ' ')] || cleaned;
}
