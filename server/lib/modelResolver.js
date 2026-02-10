const OPENAI_UNPREFIXED_RE = /^(gpt-|o1-|o3-)/i;
const OLLAMA_NAME_TAG_RE = /^[a-z0-9][a-z0-9_.-]*:[a-z0-9][a-z0-9_.-]*$/i;

export function normalizeModelString(raw) {
  if (raw == null) return raw;
  if (typeof raw !== 'string') return raw;

  const value = raw.trim();
  if (!value) return value;

  if (value.startsWith('openai:') || value.startsWith('openrouter:') || value.startsWith('ollama:')) {
    return value;
  }

  if (OPENAI_UNPREFIXED_RE.test(value)) return `openai:${value}`;
  if (OLLAMA_NAME_TAG_RE.test(value)) return `ollama:${value}`;

  // Treat vendor/model strings as OpenRouter by default.
  if (value.includes('/')) return `openrouter:${value}`;

  return value;
}

/**
 * Deterministic model resolver used across all /api/vvault/message paths.
 *
 * Rules:
 * - Prefer per-mode model (conversationModel for chat), then modelId.
 * - Parse explicit prefixes: openai:, openrouter:, ollama:
 * - Infer provider for unprefixed model strings:
 *   - gpt-*, o1-*, o3-* => OpenAI
 *   - name:tag => Ollama
 *   - vendor/model (contains "/") => OpenRouter
 *   - otherwise => OpenRouter
 * - Block anthropic/* models (never use Claude). Fall back to OpenRouter default.
 * - If the resolved provider is unavailable, fall back to OpenRouter default when possible.
 */
export function resolveModel({
  gptConfig,
  mode = 'conversation',
  hasOpenAI = false,
  hasOpenRouter = false,
  ollamaHost,
  defaultOpenRouterModel = 'meta-llama/llama-3.3-70b-instruct',
  openAIDefaultModel = 'gpt-4o',
} = {}) {
  const safeDefaultOpenRouterModel = defaultOpenRouterModel?.startsWith('anthropic/')
    ? 'meta-llama/llama-3.3-70b-instruct'
    : defaultOpenRouterModel;

  const fromConversation = typeof gptConfig?.conversationModel === 'string' ? gptConfig.conversationModel.trim() : '';
  const fromModelId = typeof gptConfig?.modelId === 'string' ? gptConfig.modelId.trim() : '';

  const configured =
    mode === 'conversation'
      ? (fromConversation || fromModelId)
      : (fromModelId || fromConversation);

  const requested = configured || '';
  const source = configured
    ? (mode === 'conversation' ? (fromConversation ? 'gpt_config.conversationModel' : 'gpt_config.modelId') : (fromModelId ? 'gpt_config.modelId' : 'gpt_config.conversationModel'))
    : 'default';

  let requestedProvider = 'openrouter';
  let requestedModel = safeDefaultOpenRouterModel;

  if (requested) {
    const trimmed = requested.trim();
    if (trimmed.startsWith('openai:')) {
      requestedProvider = 'openai';
      requestedModel = trimmed.slice('openai:'.length).trim();
    } else if (trimmed.startsWith('openrouter:')) {
      requestedProvider = 'openrouter';
      requestedModel = trimmed.slice('openrouter:'.length).trim();
    } else if (trimmed.startsWith('ollama:')) {
      requestedProvider = 'ollama';
      requestedModel = trimmed.slice('ollama:'.length).trim();
    } else if (OPENAI_UNPREFIXED_RE.test(trimmed)) {
      requestedProvider = 'openai';
      requestedModel = trimmed;
    } else if (OLLAMA_NAME_TAG_RE.test(trimmed)) {
      requestedProvider = 'ollama';
      requestedModel = trimmed;
    } else if (trimmed.includes('/')) {
      requestedProvider = 'openrouter';
      requestedModel = trimmed;
    } else {
      requestedProvider = 'openrouter';
      requestedModel = trimmed;
    }
  }

  let provider = requestedProvider;
  let model = requestedModel;
  let fallbackReason = null;

  // Enforce: never use Claude (anthropic/*), regardless of provider prefix.
  if (model?.startsWith('anthropic/')) {
    fallbackReason = 'blocked_anthropic';
    provider = 'openrouter';
    model = safeDefaultOpenRouterModel;
  }

  const hasOllama = Boolean(ollamaHost && String(ollamaHost).trim());

  if (provider === 'openai' && !hasOpenAI) {
    if (hasOpenRouter) {
      fallbackReason = fallbackReason || 'fallback_from_openai_unavailable';
      provider = 'openrouter';
      model = safeDefaultOpenRouterModel;
    } else {
      return {
        provider: null,
        model: null,
        requested,
        requestedProvider,
        requestedModel,
        source,
        fallbackReason: fallbackReason || 'no_provider',
        error: 'No LLM provider available. Configure OpenAI, OpenRouter, or Ollama.',
      };
    }
  }

  if (provider === 'ollama' && !hasOllama) {
    if (hasOpenRouter) {
      fallbackReason = fallbackReason || 'fallback_from_ollama_unavailable';
      provider = 'openrouter';
      model = safeDefaultOpenRouterModel;
    } else if (hasOpenAI) {
      fallbackReason = fallbackReason || 'fallback_from_ollama_unavailable';
      provider = 'openai';
      model = openAIDefaultModel;
    } else {
      return {
        provider: null,
        model: null,
        requested,
        requestedProvider,
        requestedModel,
        source,
        fallbackReason: fallbackReason || 'no_provider',
        error: 'Ollama requested but OLLAMA_HOST is not configured, and no fallback provider is available.',
      };
    }
  }

  if (provider === 'openrouter' && !hasOpenRouter) {
    if (hasOpenAI) {
      fallbackReason = fallbackReason || 'fallback_from_openrouter_unavailable';
      provider = 'openai';
      model = openAIDefaultModel;
    } else {
      return {
        provider: null,
        model: null,
        requested,
        requestedProvider,
        requestedModel,
        source,
        fallbackReason: fallbackReason || 'no_provider',
        error: 'No LLM provider available. Configure OpenAI, OpenRouter, or Ollama.',
      };
    }
  }

  return {
    provider,
    model,
    requested,
    requestedProvider,
    requestedModel,
    source,
    fallbackReason,
  };
}
