export async function initializeVvaultProviderRouting({
  gptConfig,
  requestedSeat,
  routingMode,
  constructId,
  message,
  previewMode,
  hasImages,
  codingMode,
  buildProviderAvailability,
  resolveModelForGPT,
  buildRouteTrackingState,
}) {
  const providerAvailability = await buildProviderAvailability();
  const modelResolution = resolveModelForGPT(
    gptConfig,
    providerAvailability,
    {
      seat: requestedSeat,
      mode: routingMode,
      forceMode: routingMode === 'lin' ? 'lin' : null,
      constructId,
      userMessage: message,
      previewMode,
      hasImages,
      codingMode,
    },
  );
  const routeTrackingState = buildRouteTrackingState(modelResolution);

  return {
    providerAvailability,
    modelResolution,
    routeTrackingState,
    effectiveProvider: modelResolution.provider,
    effectiveModel: modelResolution.model,
    modelSource: modelResolution.source,
    modelError: modelResolution.error,
  };
}
