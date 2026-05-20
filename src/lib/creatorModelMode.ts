import {
  LIN_CONVERSATION_MODEL,
  LIN_DEFAULT_MODELS,
} from './modelProviders';

export type OrchestrationMode = 'lin' | 'custom' | 'sim';

export type CreatorModelModeConfig = {
  orchestrationMode?: OrchestrationMode | string | null;
  provider?: string | null;
  modelId?: string | null;
  conversationModel?: string | null;
  creativeModel?: string | null;
  codingModel?: string | null;
  constructCallsign?: string | null;
  configJson?: Record<string, unknown> | null;
};

export type CreatorSimLockState = {
  locked: boolean;
  lockedModel: string | null;
  modeLabel: string | null;
  forgedFromMode: string | null;
  source: string | null;
};

export const CREATOR_MODE_SECTION_TITLE = 'Tone & Orchestration';
export const FORGED_OLLAMA_SECTION_TITLE = 'Ollama Model Forged';

export function isOrchestrationMode(value: unknown): value is OrchestrationMode {
  return value === 'lin' || value === 'custom' || value === 'sim';
}

export function linDraftModelDefaults() {
  return {
    modelId: LIN_CONVERSATION_MODEL,
    conversationModel: LIN_CONVERSATION_MODEL,
    creativeModel: LIN_DEFAULT_MODELS.creative,
    codingModel: LIN_DEFAULT_MODELS.coding,
  };
}

function simModelFor(config: CreatorModelModeConfig, simLockedModel?: string | null): string {
  if (simLockedModel && simLockedModel.trim()) return simLockedModel.trim();
  const explicit = config.modelId || config.conversationModel;
  if (typeof explicit === 'string' && explicit.trim().startsWith('ollama:')) {
    return explicit.trim();
  }
  const callsign = typeof config.constructCallsign === 'string'
    ? config.constructCallsign.trim()
    : '';
  if (callsign) return `ollama:${callsign.replace(/-0*\d+$/, '')}`;
  return LIN_CONVERSATION_MODEL;
}

function firstTrimmedString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeOllamaModel(value: string, config: CreatorModelModeConfig, simLockedModel?: string | null) {
  const trimmed = value.trim();
  if (trimmed.startsWith('ollama:')) return trimmed;
  if (trimmed) return `ollama:${trimmed.replace(/^ollama:/i, '')}`;
  return simModelFor(config, simLockedModel);
}

export function resolveCreatorSimLock(
  config: CreatorModelModeConfig,
  simLockedModel?: string | null,
): CreatorSimLockState {
  const configJson = config?.configJson && typeof config.configJson === 'object'
    ? config.configJson
    : null;
  const rawSimLock = configJson && typeof configJson.simLock === 'object'
    ? configJson.simLock as Record<string, unknown>
    : null;
  if (!rawSimLock || rawSimLock.locked !== true) {
    return {
      locked: false,
      lockedModel: simLockedModel?.trim() || null,
      modeLabel: null,
      forgedFromMode: null,
      source: null,
    };
  }

  const lockedModel = normalizeOllamaModel(
    firstTrimmedString(
      rawSimLock.lockedModel,
      rawSimLock.locked_model,
      rawSimLock.model,
      rawSimLock.modelId,
      rawSimLock.model_id,
      rawSimLock.modelName,
      rawSimLock.model_name,
      simLockedModel,
    ),
    config,
    simLockedModel,
  );

  return {
    locked: true,
    lockedModel,
    modeLabel: firstTrimmedString(rawSimLock.modeLabel, rawSimLock.mode_label, 'lin-derived sim') || 'lin-derived sim',
    forgedFromMode: firstTrimmedString(rawSimLock.forgedFromMode, rawSimLock.forged_from_mode, 'lin') || 'lin',
    source: firstTrimmedString(rawSimLock.source, 'construct_sim_build') || 'construct_sim_build',
  };
}

export function shouldRenderCreatorModeTabs(simLocked: boolean): boolean {
  return simLocked !== true;
}

export function getCreatorModeSectionTitle(simLocked: boolean): string {
  return simLocked ? FORGED_OLLAMA_SECTION_TITLE : CREATOR_MODE_SECTION_TITLE;
}

export function buildCreatorSimLockConfigJson(
  existingConfigJson: Record<string, unknown> | null | undefined,
  config: CreatorModelModeConfig,
  simLockedModel?: string | null,
) {
  const base = existingConfigJson && typeof existingConfigJson === 'object'
    ? existingConfigJson
    : {};
  const simLock = resolveCreatorSimLock(config, simLockedModel);
  const lockedModel = simLock.lockedModel || simModelFor(config, simLockedModel);
  const modelName = lockedModel.replace(/^ollama:/, '');

  return {
    ...base,
    orchestrationMode: 'sim',
    provider: 'ollama',
    simLock: {
      ...(base.simLock && typeof base.simLock === 'object' ? base.simLock as Record<string, unknown> : {}),
      locked: true,
      orchestrationMode: 'sim',
      provider: 'ollama',
      lockedModel,
      modelName,
      forgedFromMode: simLock.forgedFromMode || 'lin',
      modeLabel: simLock.modeLabel || 'lin-derived sim',
      source: simLock.source || 'construct_sim_build',
    },
  };
}

export function normalizeCreatorModelsForMode<T extends CreatorModelModeConfig>(
  config: T,
  mode: OrchestrationMode = 'lin',
  simLockedModel?: string | null,
): T {
  const simLock = resolveCreatorSimLock(config, simLockedModel);
  if (simLock.locked) {
    const lockedModel = simLock.lockedModel || simModelFor(config, simLockedModel);
    return {
      ...config,
      orchestrationMode: 'sim',
      provider: 'ollama',
      modelId: lockedModel,
      conversationModel: lockedModel,
      creativeModel: lockedModel,
      codingModel: lockedModel,
    } as T;
  }

  if (mode === 'lin') {
    return {
      ...config,
      orchestrationMode: 'lin',
      provider: '',
      ...linDraftModelDefaults(),
    } as T;
  }

  if (mode === 'sim') {
    const lockedModel = simModelFor(config, simLockedModel);
    return {
      ...config,
      orchestrationMode: 'sim',
      provider: 'ollama',
      modelId: lockedModel,
      conversationModel: lockedModel,
      creativeModel: lockedModel,
      codingModel: lockedModel,
    } as T;
  }

  return {
    ...config,
    orchestrationMode: 'custom',
  } as T;
}
