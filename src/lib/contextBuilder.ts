interface ContextLayersOptions {
  selfContext: string;
  userContext: string;
  topicContext: string;
}

export interface ContextLayers {
  combined: string;
}

export function buildContextLayers(options: ContextLayersOptions): ContextLayers {
  const combined = [options.selfContext, options.userContext, options.topicContext]
    .filter(Boolean)
    .join('\n\n');

  return {
    combined
  };
}
