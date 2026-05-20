export function callProviderWithRetry({
  client,
  providerName,
  model,
  messages,
  genParams = {},
  providerTimeout = 30000,
  maxRetries = 1,
  onAttempt,
}) {
  async function execute() {
    for (let retry = 0; retry <= maxRetries; retry++) {
      const attempt = {
        provider: providerName,
        retry,
        started_at: new Date().toISOString(),
        duration_ms: 0,
        status: 'failed',
        error_code: null,
        error_message_short: null,
      };
      const t0 = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), providerTimeout);
        const result = await client.chat.completions.create({
          model,
          messages,
          max_tokens: genParams.max_tokens ?? 2048,
          temperature: genParams.temperature,
          top_p: genParams.top_p,
        }, { signal: controller.signal });
        clearTimeout(timeout);
        attempt.duration_ms = Date.now() - t0;
        attempt.status = 'ok';
        if (onAttempt) onAttempt(attempt);
        return {
          ok: true,
          response: result.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.",
          model,
        };
      } catch (err) {
        attempt.duration_ms = Date.now() - t0;
        if (err?.name === 'AbortError' || attempt.duration_ms >= providerTimeout - 100) {
          attempt.status = 'timeout';
        }
        attempt.error_code = err?.status || err?.code || null;
        attempt.error_message_short = (err?.message || 'unknown').slice(0, 80);
        console.log(
          `⚠️ [ProviderAttempt] ${providerName} attempt ${retry} ${attempt.status}: code=${attempt.error_code} msg="${attempt.error_message_short}" ${attempt.duration_ms}ms`,
        );
        if (onAttempt) onAttempt(attempt);
        if (retry < maxRetries && (attempt.status === 'timeout' || (attempt.error_code && attempt.error_code >= 500))) {
          continue;
        }
        return { ok: false };
      }
    }
    return { ok: false };
  }
  return execute();
}

export function getOllamaExecutionModel({
  modelResolution,
  effectiveProvider,
  effectiveModel,
  preferredOllamaModel,
}) {
  if (modelResolution?.mode === 'lin') {
    if (effectiveProvider === 'ollama' && effectiveModel) return effectiveModel;
    if (modelResolution.requestedProvider === 'ollama' && modelResolution.requestedModel) {
      return modelResolution.requestedModel;
    }
    if (modelResolution.provider === 'ollama' && modelResolution.model) return modelResolution.model;
  }
  return preferredOllamaModel;
}

export function buildRouteTrackingState(modelResolution) {
  return {
    effectiveRouteFallbackUsed: false,
    effectiveLocalFirstUsed: !!modelResolution?.localFirstUsed,
    effectiveLocalCloudFallbackState: modelResolution?.localCloudFallbackState || null,
    effectiveSeatDefaultsOrOverrides: modelResolution?.seatDefaultsOrOverrides || null,
  };
}

export function computeRouteTrackingUpdates({
  source,
  localFirstUsed,
  localCloudFallbackState,
  fallbackUsed,
  seatDefaultsOrOverrides,
}) {
  const updates = {};
  if (source) updates.modelSource = source;
  if (typeof localFirstUsed === 'boolean') updates.effectiveLocalFirstUsed = localFirstUsed;
  if (localCloudFallbackState) updates.effectiveLocalCloudFallbackState = localCloudFallbackState;
  if (typeof fallbackUsed === 'boolean') updates.effectiveRouteFallbackUsed = fallbackUsed;
  if (seatDefaultsOrOverrides) updates.effectiveSeatDefaultsOrOverrides = seatDefaultsOrOverrides;
  return updates;
}

export function computeOllamaRouteTrackingUpdates({
  fallbackUsed,
  localCloudFallbackState,
  modelSource,
  modelResolution,
}) {
  const linSource = modelResolution?.mode === 'lin' ? modelSource || modelResolution.source : null;
  return computeRouteTrackingUpdates({
    source: linSource || (fallbackUsed ? 'fallback_to_ollama' : 'ollama_local_execution'),
    localFirstUsed: true,
    localCloudFallbackState: localCloudFallbackState || (fallbackUsed ? 'fallback_to_ollama' : 'local_first'),
    fallbackUsed,
  });
}

export function buildNovaOpenRouterModelCandidates(hotfixModel) {
  const envCandidates = process.env.NOVA_OPENROUTER_MODEL_CANDIDATES
    ? String(process.env.NOVA_OPENROUTER_MODEL_CANDIDATES)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];
  const fallbackCandidates = [hotfixModel, process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free'].filter(Boolean);
  return Array.from(new Set([...(envCandidates.length ? envCandidates : fallbackCandidates)]));
}

export function looksLikeInvalidModelAttempt(attempt) {
  if (!attempt) return false;
  const status = attempt.status;
  const code = attempt.error_code;
  const msg = String(attempt.error_message_short || '').toLowerCase();
  if (status === 'timeout') return false;
  if (msg.includes('invalid model') || msg.includes('not a valid model') || msg.includes('model id')) return true;
  const numericCode = typeof code === 'number' ? code : (code != null ? Number(code) : null);
  if (numericCode != null && numericCode >= 400 && numericCode < 500) return true;
  return false;
}

export function buildProviderCandidates(effectiveModel) {
  return Array.from(new Set([
    effectiveModel,
    'meta-llama/llama-3.3-70b-instruct',
    'mistralai/mistral-large',
    'qwen/qwen-2.5-72b-instruct',
    'meta-llama/llama-3.2-3b-instruct:free',
  ].filter(Boolean)));
}

export function normalizeProviderError(error, effectiveProvider) {
  if (!error) return { message: 'Unknown error', upstreamStatus: null, providerCode: null, hint: null };
  if (error?.code === 'ALL_PROVIDERS_FAILED') {
    return {
      message: 'All providers failed',
      upstreamStatus: 503,
      providerCode: 'ALL_PROVIDERS_FAILED',
      hint: 'All configured LLM providers returned errors.',
    };
  }
  const status = error?.status || error?.statusCode || null;
  const code = error?.code || error?.type || null;
  const message = error?.message || String(error);
  let hint = null;
  if (status === 401 || status === 403) {
    hint = 'Check your API key.';
  } else if (status === 429) {
    hint = 'Rate limited. Try again later.';
  } else if (status === 402) {
    hint = 'Billing issue. Check your account.';
  } else if (code === 'insufficient_quota') {
    hint = 'Quota exceeded.';
  }
  return { message, upstreamStatus: status, providerCode: code, hint };
}
