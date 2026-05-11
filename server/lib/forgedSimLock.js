function normalizeModelName(value = '') {
  return String(value || '')
    .trim()
    .replace(/^ollama:/i, '')
    .toLowerCase();
}

export function buildOllamaModelNameFromCallsign(constructCallsign = '') {
  const normalized = String(constructCallsign || '')
    .trim()
    .toLowerCase()
    .replace(/-0*\d+$/, '');
  return normalized || '';
}

export function buildOllamaLockedModelFromCallsign(constructCallsign = '') {
  const modelName = buildOllamaModelNameFromCallsign(constructCallsign);
  return modelName ? `ollama:${modelName}` : '';
}

function parseConfigJsonLike(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseTimestampMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeLockedModel(rawValue, constructCallsign = '') {
  const direct = String(rawValue || '').trim();
  if (direct.startsWith('ollama:')) return direct;
  const normalizedName = normalizeModelName(direct);
  if (normalizedName) return `ollama:${normalizedName}`;
  return buildOllamaLockedModelFromCallsign(constructCallsign);
}

export function readForgedSimLock(source = {}) {
  if (!source || typeof source !== 'object') return null;
  const configJson = parseConfigJsonLike(source.configJson || source.config_json);
  const simLock = configJson?.simLock;
  if (!simLock || typeof simLock !== 'object' || simLock.locked !== true) {
    return null;
  }

  const constructCallsign = firstString(
    source.constructCallsign,
    source.construct_call_sign,
    source.constructId,
    source.construct_id,
    source.id,
  );
  const lockedModel = normalizeLockedModel(
    firstString(
      simLock.lockedModel,
      simLock.locked_model,
      simLock.model,
      simLock.modelId,
      simLock.model_id,
      simLock.modelName,
      simLock.model_name,
    ),
    constructCallsign,
  );
  const modelName = normalizeModelName(
    firstString(simLock.modelName, simLock.model_name, lockedModel),
  );

  return {
    locked: true,
    lockedModel,
    modelName: modelName || normalizeModelName(lockedModel),
    source: firstString(simLock.source, 'construct_sim_build'),
    forgedFromMode: firstString(simLock.forgedFromMode, simLock.forged_from_mode, 'lin'),
    modeLabel: firstString(simLock.modeLabel, simLock.mode_label, 'lin-derived sim'),
    forgedAt: firstString(simLock.forgedAt, simLock.forged_at, simLock.lockedAt, simLock.locked_at),
    kind: firstString(simLock.kind, 'lin-derived-sim'),
  };
}

export function pickPreferredRuntimeConfigRecord(records = [], options = {}) {
  const preferredUserIds = new Set(
    (Array.isArray(options.preferredUserIds) ? options.preferredUserIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  const normalizedRecords = Array.isArray(records) ? records.filter(Boolean) : [];
  if (normalizedRecords.length === 0) return null;

  const decorated = normalizedRecords.map((record, index) => {
    const configJson = parseConfigJsonLike(record.configJson || record.config_json);
    const simLock = readForgedSimLock(record);
    const userId = firstString(record.userId, record.user_id);
    const sourceTable = firstString(record.__source_table, record.sourceTable).toLowerCase();
    const mode = firstString(
      record.orchestrationMode,
      record.orchestration_mode,
      configJson.orchestrationMode,
      configJson.orchestration_mode,
    ).toLowerCase();
    const provider = firstString(record.provider, configJson.provider).toLowerCase();
    const model = firstString(
      record.modelId,
      record.model_id,
      record.conversationModel,
      record.conversation_model,
      record.model,
    ).toLowerCase();

    return {
      record,
      index,
      simLocked: simLock ? 1 : 0,
      simMode: mode === 'sim' ? 1 : 0,
      preferredUser: preferredUserIds.has(userId) ? 1 : 0,
      ollamaRuntime:
        simLock?.lockedModel?.startsWith('ollama:') || provider === 'ollama' || model.startsWith('ollama:')
          ? 1
          : 0,
      updatedAt: parseTimestampMs(firstString(record.updatedAt, record.updated_at)),
      createdAt: parseTimestampMs(firstString(record.createdAt, record.created_at)),
      sourcePriority: sourceTable === 'ais' ? 1 : 0,
    };
  });

  decorated.sort((left, right) =>
    (right.simLocked - left.simLocked) ||
    (right.simMode - left.simMode) ||
    (right.preferredUser - left.preferredUser) ||
    (right.ollamaRuntime - left.ollamaRuntime) ||
    (right.updatedAt - left.updatedAt) ||
    (right.createdAt - left.createdAt) ||
    (right.sourcePriority - left.sourcePriority) ||
    (left.index - right.index)
  );

  return decorated[0]?.record || null;
}

export function buildForgedSimConfigJson(existingConfigJson = {}, options = {}) {
  const configJson = parseConfigJsonLike(existingConfigJson);
  const constructCallsign = firstString(
    options.constructCallsign,
    configJson.constructCallsign,
    configJson.construct_call_sign,
  );
  const lockedModel = normalizeLockedModel(options.lockedModel, constructCallsign);
  const modelName = normalizeModelName(firstString(options.modelName, lockedModel));
  const forgedAt = firstString(options.forgedAt, new Date().toISOString());
  const forgedFromMode = firstString(options.forgedFromMode, 'lin');
  const modeLabel = firstString(options.modeLabel, 'lin-derived sim');
  const source = firstString(options.source, 'construct_sim_build');
  const kind = firstString(options.kind, 'lin-derived-sim');
  const refreshContract =
    configJson.simRefreshContract && typeof configJson.simRefreshContract === 'object'
      ? configJson.simRefreshContract
      : {};

  return {
    ...configJson,
    orchestrationMode: 'sim',
    provider: 'ollama',
    simLock: {
      ...(configJson.simLock && typeof configJson.simLock === 'object' ? configJson.simLock : {}),
      locked: true,
      orchestrationMode: 'sim',
      provider: 'ollama',
      lockedModel,
      modelName: modelName || normalizeModelName(lockedModel),
      forgedFromMode,
      modeLabel,
      source,
      forgedAt,
      kind,
    },
    simRefreshContract: {
      ...refreshContract,
      version: firstString(refreshContract.version, 'sim-refresh-contract.v1'),
      lineage: firstString(refreshContract.lineage, modeLabel),
      refreshInputs: Array.isArray(refreshContract.refreshInputs) && refreshContract.refreshInputs.length > 0
        ? refreshContract.refreshInputs
        : ['identity', 'settings', 'knowledge', 'transcript_calibration', 'vsi_standards'],
      refreshTriggers: Array.isArray(refreshContract.refreshTriggers) && refreshContract.refreshTriggers.length > 0
        ? refreshContract.refreshTriggers
        : ['identity_change', 'settings_change', 'knowledge_change', 'transcript_change', 'standards_change', 'manual_reforge'],
      refreshedAt: firstString(refreshContract.refreshedAt, forgedAt),
      source: firstString(refreshContract.source, source),
    },
  };
}

export function applyForgedSimLockToRecord(source = {}, options = {}) {
  const existingLock = readForgedSimLock(source);
  if (!existingLock && options.force !== true) return source;

  const constructCallsign = firstString(
    source.constructCallsign,
    source.construct_call_sign,
    source.constructId,
    source.construct_id,
    source.id,
    options.constructCallsign,
  );
  const lockedModel = normalizeLockedModel(
    firstString(options.lockedModel, existingLock?.lockedModel),
    constructCallsign,
  );
  const configJson = buildForgedSimConfigJson(source.configJson || source.config_json, {
    constructCallsign,
    lockedModel,
    modelName: firstString(options.modelName, existingLock?.modelName),
    source: firstString(options.source, existingLock?.source),
    forgedFromMode: firstString(options.forgedFromMode, existingLock?.forgedFromMode),
    modeLabel: firstString(options.modeLabel, existingLock?.modeLabel),
    forgedAt: firstString(options.forgedAt, existingLock?.forgedAt),
    kind: firstString(options.kind, existingLock?.kind),
  });

  return {
    ...source,
    orchestrationMode: 'sim',
    orchestration_mode: 'sim',
    provider: 'ollama',
    model: lockedModel,
    modelId: lockedModel,
    conversationModel: lockedModel,
    conversation_model: lockedModel,
    creativeModel: lockedModel,
    creative_model: lockedModel,
    codingModel: lockedModel,
    coding_model: lockedModel,
    configJson,
    config_json: configJson,
  };
}
