import path from 'path';
import { promises as fs } from 'fs';
import {
  buildSystemConstructPromptDocument,
  getSystemConstructCatalogEntry,
} from '../../src/lib/systemConstructCatalog.js';
import { buildVoiceContractJson } from './voiceContract.js';

const DEFAULT_CAPABILITIES = Object.freeze({
  webSearch: false,
  canvas: false,
  imageGeneration: false,
  codeInterpreter: false,
  agent: false,
  proactiveInitiation: false,
});

const DEFAULT_PERSONALITY_TRAITS = Object.freeze({
  creativity: 0.7,
  empathy: 0.6,
  persistence: 0.8,
  analytical: 0.7,
  directness: 0.7,
});

export const CONSTRUCT_BUNDLE_VERSION = 1;

export const CONSTRUCT_BUNDLE_SPEC = Object.freeze({
  version: CONSTRUCT_BUNDLE_VERSION,
  generated: Object.freeze([
    'identity/prompt.json',
    'identity/prompt.txt',
    'identity/conditioning.txt',
    'identity/definition.json',
    'identity/voice.json',
    'config/metadata.json',
    'config/personality.json',
    'config/tone_profile.json',
    'chatty/chat_with_{callsign}.md',
  ]),
  directories: Object.freeze([
    'assets',
    'data',
    'documents',
    'frame',
    'logs',
    'memup',
    'simDrive',
    'vxrunner',
    'codex',
    'chatgpt',
    'character.ai',
    'github_copilot',
  ]),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringArray(value) {
  const array = Array.isArray(value) ? value : value == null ? [] : [value];
  return array
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCapabilityFlags(candidate) {
  const normalized = { ...DEFAULT_CAPABILITIES };
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return normalized;
  }

  for (const key of Object.keys(DEFAULT_CAPABILITIES)) {
    normalized[key] = Boolean(candidate[key]);
  }

  return normalized;
}

function safeParseJsonString(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function titleFromCallsign(constructCallsign) {
  const stem = String(constructCallsign || '')
    .replace(/-\d+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!stem) return 'Construct';
  return stem.replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildDefaultConditioning(constructCallsign, displayName) {
  return `>>${String(constructCallsign || '').toUpperCase()}_CONDITIONING_START

Identity enforcement:
- Always identify as ${displayName} when asked
- Maintain your unique identity and personality

>>${String(constructCallsign || '').toUpperCase()}_CONDITIONING_END
`;
}

function buildBodyConfig(normalized) {
  return {
    ...(isPlainObject(normalized.configJson) ? normalized.configJson : {}),
    bodyVersion: CONSTRUCT_BUNDLE_VERSION,
    displayName: normalized.displayName,
    fullName: normalized.fullName,
    aliases: normalized.aliases,
    conditioning: normalized.conditioning,
    canonRefs: normalized.canonRefs,
    knowledgeRefs: normalized.knowledgeRefs,
    provider: normalized.provider || '',
    tags: normalized.tags,
    categories: normalized.categories,
    summaryCapabilities: normalized.summaryCapabilities,
    capabilities: normalized.capabilities,
    hasPersistentMemory: normalized.hasPersistentMemory,
  };
}

function buildStructuredDefinition(normalized) {
  if (isPlainObject(normalized.definition)) {
    return normalized.definition;
  }

  const parsed = safeParseJsonString(normalized.definition);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed;
  }

  return {
    construct: normalized.constructCallsign,
    name: normalized.displayName,
    fullName: normalized.fullName,
    aliases: normalized.aliases,
    description: normalized.description,
    instructionsSummary: normalized.instructions,
    orchestrationMode: normalized.orchestrationMode,
    capabilities: normalized.capabilities,
    canonRefs: normalized.canonRefs,
    knowledgeRefs: normalized.knowledgeRefs,
    source: normalized.source,
  };
}

function buildPromptJson(normalized) {
  return {
    constructCallsign: normalized.constructCallsign,
    name: normalized.displayName,
    displayName: normalized.displayName,
    fullName: normalized.fullName,
    aliases: normalized.aliases,
    description: normalized.description,
    instructions: normalized.instructions,
    conversationStarters: normalized.conversationStarters,
    capabilities: normalized.capabilities,
    canonRefs: normalized.canonRefs,
    knowledgeRefs: normalized.knowledgeRefs,
    summaryCapabilities: normalized.summaryCapabilities,
    modelId: normalized.modelId,
    conversationModel: normalized.conversationModel,
    creativeModel: normalized.creativeModel,
    codingModel: normalized.codingModel,
    orchestrationMode: normalized.orchestrationMode,
    memoryEnabled: normalized.memoryEnabled,
    memoryProfile: normalized.memoryProfile,
    roleplayEnabled: normalized.roleplayEnabled,
    provider: normalized.provider || '',
    tags: normalized.tags,
    categories: normalized.categories,
    configJson: buildBodyConfig(normalized),
    createdAt: normalized.createdAt,
    source: normalized.source,
  };
}

function buildPromptTxt(normalized) {
  if (normalized.systemCatalogEntry) {
    const rendered = buildSystemConstructPromptDocument(normalized.systemCatalogEntry);
    if (rendered) return rendered;
  }

  const starters = normalized.conversationStarters
    .map((starter) => `- *${starter}*`)
    .join('\n');

  return [
    `**You Are ${normalized.displayName}**`,
    `*${normalized.description}*`,
    '',
    'Instructions:',
    normalized.instructions,
    starters ? '\n**Conversation Starters:**' : '',
    starters || '',
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildMetadataJson(normalized) {
  return {
    bundleVersion: CONSTRUCT_BUNDLE_VERSION,
    construct: normalized.constructCallsign,
    name: normalized.displayName,
    fullName: normalized.fullName,
    aliases: normalized.aliases,
    description: normalized.description,
    status: 'active',
    source: normalized.source,
    createdAt: normalized.createdAt,
    updatedAt: normalized.createdAt,
    orchestrationMode: normalized.orchestrationMode,
    memoryEnabled: normalized.memoryEnabled,
    memoryProfile: normalized.memoryProfile,
    roleplayEnabled: normalized.roleplayEnabled,
    provider: normalized.provider || '',
    models: {
      primary: normalized.modelId,
      conversation: normalized.conversationModel,
      creative: normalized.creativeModel,
      coding: normalized.codingModel,
    },
    capabilities: normalized.capabilities,
    canonRefs: normalized.canonRefs,
    knowledgeRefs: normalized.knowledgeRefs,
  };
}

function buildPersonalityJson(normalized) {
  const basePersonality = isPlainObject(normalized.personality) ? normalized.personality : {};
  const traitSource =
    isPlainObject(basePersonality.traits)
      ? basePersonality.traits
      : isPlainObject(normalized.traits)
        ? normalized.traits
        : DEFAULT_PERSONALITY_TRAITS;

  return {
    construct: normalized.constructCallsign,
    name: normalized.displayName,
    fullName: normalized.fullName,
    traits: traitSource,
    source: normalized.source,
    createdAt: normalized.createdAt,
  };
}

function buildToneProfileJson(normalized) {
  if (isPlainObject(normalized.toneProfile)) {
    return normalized.toneProfile;
  }

  const personality = buildPersonalityJson(normalized);
  return {
    version: '1.0',
    source: normalized.source,
    forgedAt: normalized.createdAt,
    construct: normalized.constructCallsign,
    displayName: normalized.displayName,
    fullName: normalized.fullName,
    traits: personality.traits,
    communication: {
      voice: normalized.voice ? 'custom' : 'unset',
      roleplayEnabled: normalized.roleplayEnabled,
      memoryProfile: normalized.memoryProfile,
    },
    coreIdentity: {
      constructCallsign: normalized.constructCallsign,
      displayName: normalized.displayName,
      fullName: normalized.fullName,
      aliases: normalized.aliases,
      description: normalized.description,
    },
  };
}

function buildVoiceInstructions(normalized) {
  if (typeof normalized.voice === 'string' && normalized.voice.trim()) {
    return normalized.voice.trimEnd() + '\n';
  }

  return [
    `# ${normalized.displayName} Voice`,
    '',
    '<!-- Spoken tone, pacing, and protection notes belong here. -->',
  ].join('\n');
}

function buildConversationTranscript(normalized) {
  const now = normalized.createdAt;
  const dateStr = new Date(now).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `# Conversation with ${normalized.displayName}
**Construct:** ${normalized.constructCallsign}
**Platform:** chatty
**Started:** ${now}

---

## ${dateStr}

`;
}

function buildLogFile(logName, normalized) {
  return `# ${logName} - ${normalized.constructCallsign}
# Created: ${normalized.createdAt}
# Source: ${normalized.source}
# ---
`;
}

export function normalizeConstructBundleConfig(constructCallsign, config = {}) {
  const systemCatalogEntry = getSystemConstructCatalogEntry(constructCallsign);
  const configJson = {
    ...(isPlainObject(systemCatalogEntry?.configJson) ? systemCatalogEntry.configJson : {}),
    ...(isPlainObject(config.configJson) ? config.configJson : {}),
  };
  const displayName =
    config.displayName ||
    config.name ||
    systemCatalogEntry?.displayName ||
    systemCatalogEntry?.name ||
    titleFromCallsign(constructCallsign);
  const fullName =
    config.fullName ||
    configJson.fullName ||
    systemCatalogEntry?.fullName ||
    displayName;
  const aliases = normalizeStringArray(
    config.aliases !== undefined
      ? config.aliases
      : configJson.aliases !== undefined
        ? configJson.aliases
        : systemCatalogEntry?.aliases,
  );
  const description =
    config.description ||
    systemCatalogEntry?.description ||
    'A custom GPT/construct created in Chatty.';
  const instructions =
    config.instructions ||
    config.systemPromptOverride ||
    systemCatalogEntry?.instructions ||
    `You are ${displayName}.`;
  const conversationStarters = normalizeStringArray(
    config.conversationStarters !== undefined
      ? config.conversationStarters
      : config.starters !== undefined
        ? config.starters
        : systemCatalogEntry?.conversationStarters,
  );
  const capabilities = normalizeCapabilityFlags(
    config.capabilities !== undefined
      ? config.capabilities
      : configJson.capabilities !== undefined
        ? configJson.capabilities
        : systemCatalogEntry?.capabilities,
  );
  const summaryCapabilities = normalizeStringArray(
    config.summaryCapabilities !== undefined
      ? config.summaryCapabilities
      : configJson.summaryCapabilities !== undefined
        ? configJson.summaryCapabilities
        : systemCatalogEntry?.summaryCapabilities,
  );
  const canonRefs = normalizeStringArray(
    config.canonRefs !== undefined
      ? config.canonRefs
      : configJson.canonRefs !== undefined
        ? configJson.canonRefs
        : systemCatalogEntry?.canonRefs,
  );
  const knowledgeRefs = normalizeStringArray(
    config.knowledgeRefs !== undefined
      ? config.knowledgeRefs
      : configJson.knowledgeRefs !== undefined
        ? configJson.knowledgeRefs
        : systemCatalogEntry?.knowledgeRefs,
  );
  const tags = normalizeStringArray(
    config.tags !== undefined
      ? config.tags
      : configJson.tags !== undefined
        ? configJson.tags
        : systemCatalogEntry?.summaryTags,
  );
  const categories = normalizeStringArray(
    config.categories !== undefined
      ? config.categories
      : configJson.categories !== undefined
        ? configJson.categories
        : systemCatalogEntry?.summaryCategories,
  );
  const createdAt =
    typeof config.createdAt === 'string' && config.createdAt.trim()
      ? config.createdAt
      : new Date().toISOString();

  return {
    constructCallsign,
    displayName,
    fullName,
    aliases,
    description,
    instructions,
    conversationStarters,
    capabilities,
    summaryCapabilities,
    canonRefs,
    knowledgeRefs,
    tags,
    categories,
    conditioning:
      typeof config.conditioning === 'string' && config.conditioning.trim()
        ? config.conditioning
        : typeof configJson.conditioning === 'string' && configJson.conditioning.trim()
          ? configJson.conditioning
          : typeof systemCatalogEntry?.conditioning === 'string' && systemCatalogEntry.conditioning.trim()
            ? systemCatalogEntry.conditioning
            : buildDefaultConditioning(constructCallsign, displayName),
    definition:
      config.definition !== undefined
        ? config.definition
        : config.definitionJson !== undefined
          ? config.definitionJson
          : null,
    voice:
      typeof config.voice === 'string'
        ? config.voice
        : typeof config.voiceMd === 'string'
          ? config.voiceMd
          : '',
    toneProfile: isPlainObject(config.toneProfile) ? config.toneProfile : null,
    personality: isPlainObject(config.personality) ? config.personality : null,
    traits: isPlainObject(config.traits) ? config.traits : null,
    modelId:
      config.modelId ||
      config.model ||
      systemCatalogEntry?.model ||
      null,
    conversationModel:
      config.conversationModel ||
      config.modelId ||
      config.model ||
      systemCatalogEntry?.model ||
      null,
    creativeModel:
      config.creativeModel ||
      systemCatalogEntry?.creativeModel ||
      null,
    codingModel:
      config.codingModel ||
      systemCatalogEntry?.codingModel ||
      null,
    orchestrationMode:
      config.orchestrationMode ||
      configJson.orchestrationMode ||
      systemCatalogEntry?.orchestrationMode ||
      'lin',
    memoryEnabled:
      config.memoryEnabled !== undefined
        ? Boolean(config.memoryEnabled)
        : configJson.memoryEnabled !== undefined
          ? Boolean(configJson.memoryEnabled)
          : Boolean(systemCatalogEntry?.memoryEnabled),
    memoryProfile:
      config.memoryProfile ||
      configJson.memoryProfile ||
      systemCatalogEntry?.memoryProfile ||
      'off',
    roleplayEnabled:
      config.roleplayEnabled !== undefined
        ? Boolean(config.roleplayEnabled)
        : configJson.roleplayEnabled !== undefined
          ? Boolean(configJson.roleplayEnabled)
          : Boolean(systemCatalogEntry?.roleplayEnabled),
    provider:
      config.provider ||
      configJson.provider ||
      systemCatalogEntry?.provider ||
      '',
    hasPersistentMemory:
      config.hasPersistentMemory !== undefined
        ? Boolean(config.hasPersistentMemory)
        : configJson.hasPersistentMemory !== undefined
          ? Boolean(configJson.hasPersistentMemory)
          : true,
    configJson,
    createdAt,
    source: systemCatalogEntry ? 'chatty-system-construct' : 'chatty-gpt-creator',
    systemCatalogEntry,
  };
}

export function buildConstructBundleEntries(constructCallsign, config = {}) {
  const normalized = normalizeConstructBundleConfig(constructCallsign, config);
  const base = `instances/${constructCallsign}`;
  const promptJson = buildPromptJson(normalized);
  const metadataJson = buildMetadataJson(normalized);
  const personalityJson = buildPersonalityJson(normalized);
  const toneProfileJson = buildToneProfileJson(normalized);
  const definitionJson = buildStructuredDefinition(normalized);

  const files = [
    {
      filename: `${base}/identity/prompt.json`,
      content: JSON.stringify(promptJson, null, 2),
      fileType: 'identity',
      replaceExisting: true,
    },
    {
      filename: `${base}/identity/prompt.txt`,
      content: buildPromptTxt(normalized),
      fileType: 'identity',
      replaceExisting: true,
    },
    {
      filename: `${base}/identity/conditioning.txt`,
      content: normalized.conditioning,
      fileType: 'identity',
      replaceExisting: true,
    },
    {
      filename: `${base}/identity/definition.json`,
      content: JSON.stringify(definitionJson, null, 2),
      fileType: 'identity',
      replaceExisting: false,
    },
    {
      filename: `${base}/identity/voice.json`,
      content: buildVoiceContractJson({
        instructions: buildVoiceInstructions(normalized),
        source: normalized.source,
        updatedAt: normalized.createdAt,
      }),
      fileType: 'identity',
      replaceExisting: false,
    },
    {
      filename: `${base}/config/metadata.json`,
      content: JSON.stringify(metadataJson, null, 2),
      fileType: 'config',
      replaceExisting: true,
    },
    {
      filename: `${base}/config/personality.json`,
      content: JSON.stringify(personalityJson, null, 2),
      fileType: 'config',
      replaceExisting: true,
    },
    {
      filename: `${base}/config/tone_profile.json`,
      content: JSON.stringify(toneProfileJson, null, 2),
      fileType: 'config',
      replaceExisting: true,
    },
    {
      filename: `${base}/chatty/chat_with_${constructCallsign}.md`,
      content: buildConversationTranscript(normalized),
      fileType: 'conversation',
      replaceExisting: false,
    },
    {
      filename: `${base}/logs/capsule.log`,
      content: buildLogFile('Capsule Log', normalized),
      fileType: 'log',
      replaceExisting: false,
    },
    {
      filename: `${base}/logs/chat.log`,
      content: buildLogFile('Chat Log', normalized),
      fileType: 'log',
      replaceExisting: false,
    },
    {
      filename: `${base}/logs/identity_guard.log`,
      content: buildLogFile('Identity Guard Log', normalized),
      fileType: 'log',
      replaceExisting: false,
    },
    {
      filename: `${base}/logs/server.log`,
      content: buildLogFile('Server Log', normalized),
      fileType: 'log',
      replaceExisting: false,
    },
  ];

  const dirMarkers = CONSTRUCT_BUNDLE_SPEC.directories.map((directory) => ({
    filename: `${base}/${directory}/.gitkeep`,
    content: '',
    fileType: directory === 'codex' || directory === 'chatgpt' || directory === 'character.ai' || directory === 'github_copilot'
      ? 'transcript'
      : 'system',
    replaceExisting: false,
  }));

  return [...files, ...dirMarkers];
}

export async function writeConstructBundleEntries(rootPath, entries, options = {}) {
  const syncGenerated = options.syncGenerated === true;
  const results = [];

  for (const entry of entries) {
    const relativePath = entry.filename.replace(/^\/+/, '');
    const fullPath = path.join(rootPath, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    let exists = false;
    try {
      await fs.access(fullPath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists && !(syncGenerated && entry.replaceExisting)) {
      results.push({ filename: relativePath, status: 'exists' });
      continue;
    }

    await fs.writeFile(fullPath, entry.content, 'utf8');
    results.push({
      filename: relativePath,
      status: exists ? 'updated' : 'created',
    });
  }

  const created = results.filter((item) => item.status === 'created').length;
  const updated = results.filter((item) => item.status === 'updated').length;
  const existed = results.filter((item) => item.status === 'exists').length;

  return {
    success: true,
    created,
    updated,
    existed,
    failed: 0,
    results,
  };
}
