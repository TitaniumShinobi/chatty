export function mergeMetadataIntoGptConfig(gptConfig, meta) {
  if (!meta) return gptConfig;
  let updated = {
    ...gptConfig,
    modelId: meta.model || gptConfig?.modelId,
    conversationModel: meta.model || gptConfig?.conversationModel,
    provider: meta.provider || gptConfig?.provider,
    coderModel: meta.coderModel || gptConfig?.coderModel,
    coderProvider: meta.coderProvider || gptConfig?.coderProvider,
    capabilities: meta.capabilities || gptConfig?.capabilities,
    tags: meta.tags || gptConfig?.tags,
    categories: meta.categories || gptConfig?.categories,
    systemPromptOverride: meta.systemPromptOverride || gptConfig?.systemPromptOverride,
    configJson: meta.configJson || gptConfig?.configJson,
    avatarUrl: meta.avatarUrl || gptConfig?.avatarUrl || gptConfig?.avatar,
  };
  if (meta.model && meta.provider && !meta.model.includes(':')) {
    const combined = `${meta.provider}:${meta.model}`;
    updated.modelId = combined;
    updated.conversationModel = combined;
  }
  return updated;
}

export function applyRequestModelOverride(gptConfig, requestModelOverride, requestProviderOverride) {
  if (!requestModelOverride || typeof requestModelOverride !== 'string') return gptConfig;
  const requestedModelString = requestProviderOverride && !requestModelOverride.includes(':')
    ? `${requestProviderOverride}:${requestModelOverride}`
    : requestModelOverride;
  return {
    ...gptConfig,
    modelId: requestedModelString,
    conversationModel: requestedModelString,
    provider: requestProviderOverride || gptConfig?.provider,
  };
}

export function buildMetadataRecoveryDefaults(boundedZenSmalltalkRoute) {
  return {
    attempted: false,
    applied: false,
    profile: boundedZenSmalltalkRoute ? 'zen_smalltalk_bounded' : 'standard',
    status: 'not_attempted',
    timeout_ms: null,
    fallback_source: null,
  };
}
