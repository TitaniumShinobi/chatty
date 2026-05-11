// GPT Manager - Server-side implementation
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { ServerFileParser } from './serverFileParser.js';
import { getVvaultBridgeConfig } from './vvaultBridgeConfig.js';
import {
  applyForgedSimLockToRecord,
  pickPreferredRuntimeConfigRecord,
  readForgedSimLock,
} from './forgedSimLock.js';
import { listSystemConstructCatalog } from '../../src/lib/systemConstructCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_PLACEHOLDER_TOKENS = new Set(['', 'openrouter/auto', 'openrouter:auto']);
const RUNTIME_MODEL_FIELDS = ['model_id', 'conversation_model', 'creative_model', 'coding_model'];
const DEFAULT_CAPABILITIES = Object.freeze({
  webSearch: false,
  canvas: false,
  imageGeneration: false,
  codeInterpreter: false,
  agent: false,
  proactiveInitiation: false,
});

function isEmptyText(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonField(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeStringArray(value) {
  const array = Array.isArray(value) ? value : value == null ? [] : [value];
  return array
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCapabilities(candidate) {
  const normalized = { ...DEFAULT_CAPABILITIES };
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return normalized;
  }

  for (const key of Object.keys(DEFAULT_CAPABILITIES)) {
    normalized[key] = Boolean(candidate[key]);
  }

  return normalized;
}

function buildStoredConfigJson(input = {}) {
  const base = isPlainObject(input.configJson) ? { ...input.configJson } : {};
  return {
    ...base,
    bodyVersion: Number.isFinite(base.bodyVersion) ? base.bodyVersion : 1,
    displayName:
      typeof input.displayName === 'string' && input.displayName.trim()
        ? input.displayName.trim()
        : typeof base.displayName === 'string'
          ? base.displayName
          : typeof input.name === 'string'
            ? input.name
            : '',
    fullName:
      typeof input.fullName === 'string' && input.fullName.trim()
        ? input.fullName.trim()
        : typeof base.fullName === 'string'
          ? base.fullName
          : typeof input.displayName === 'string' && input.displayName.trim()
            ? input.displayName.trim()
            : typeof input.name === 'string'
              ? input.name
              : '',
    aliases: normalizeStringArray(input.aliases !== undefined ? input.aliases : base.aliases),
    conditioning:
      typeof input.conditioning === 'string'
        ? input.conditioning
        : typeof base.conditioning === 'string'
          ? base.conditioning
          : '',
    canonRefs: normalizeStringArray(input.canonRefs !== undefined ? input.canonRefs : base.canonRefs),
    knowledgeRefs: normalizeStringArray(
      input.knowledgeRefs !== undefined ? input.knowledgeRefs : base.knowledgeRefs,
    ),
    provider:
      typeof input.provider === 'string'
        ? input.provider
        : typeof base.provider === 'string'
          ? base.provider
          : '',
    tags: normalizeStringArray(input.tags !== undefined ? input.tags : base.tags),
    categories: normalizeStringArray(input.categories !== undefined ? input.categories : base.categories),
    summaryCapabilities: normalizeStringArray(
      input.summaryCapabilities !== undefined ? input.summaryCapabilities : base.summaryCapabilities,
    ),
    capabilities: normalizeCapabilities(
      input.capabilities !== undefined ? input.capabilities : base.capabilities,
    ),
    hasPersistentMemory:
      input.hasPersistentMemory !== undefined
        ? Boolean(input.hasPersistentMemory)
        : base.hasPersistentMemory !== false,
  };
}

function readStoredRowSimLock(row) {
  if (!row) return null;
  return readForgedSimLock({
    construct_call_sign: row.construct_callsign,
    model_id: row.model_id,
    conversation_model: row.conversation_model,
    creative_model: row.creative_model,
    coding_model: row.coding_model,
    config_json: parseJsonField(row.config_json, null),
  });
}

function applyExistingSimLockToStoredDraft(row, draft = {}) {
  const existingLock = readStoredRowSimLock(row);
  if (!existingLock) return draft;
  const forced = applyForgedSimLockToRecord(
    {
      constructCallsign: row?.construct_callsign,
      provider: draft.provider ?? row?.provider ?? null,
      modelId: draft.modelId ?? row?.model_id ?? existingLock.lockedModel,
      conversationModel: draft.conversationModel ?? row?.conversation_model ?? existingLock.lockedModel,
      creativeModel: draft.creativeModel ?? row?.creative_model ?? existingLock.lockedModel,
      codingModel: draft.codingModel ?? row?.coding_model ?? existingLock.lockedModel,
      orchestrationMode: draft.orchestrationMode ?? row?.orchestration_mode ?? 'sim',
      configJson: draft.configJson ?? parseJsonField(row?.config_json, null),
    },
    {
      force: true,
      lockedModel: existingLock.lockedModel,
      modelName: existingLock.modelName,
      source: existingLock.source,
      forgedFromMode: existingLock.forgedFromMode,
      modeLabel: existingLock.modeLabel,
      forgedAt: existingLock.forgedAt,
      kind: existingLock.kind,
    },
  );

  return {
    provider: forced.provider ?? draft.provider ?? row?.provider ?? null,
    modelId: forced.modelId ?? draft.modelId ?? row?.model_id ?? null,
    conversationModel: forced.conversationModel ?? draft.conversationModel ?? row?.conversation_model ?? null,
    creativeModel: forced.creativeModel ?? draft.creativeModel ?? row?.creative_model ?? null,
    codingModel: forced.codingModel ?? draft.codingModel ?? row?.coding_model ?? null,
    orchestrationMode: forced.orchestrationMode ?? draft.orchestrationMode ?? row?.orchestration_mode ?? 'sim',
    configJson: forced.configJson ?? draft.configJson ?? parseJsonField(row?.config_json, null),
  };
}

function extractBodyMetadata(row) {
  const configJson = parseJsonField(row?.config_json, null);
  const bodyConfig = isPlainObject(configJson) ? configJson : {};
  const displayName =
    row?.display_name ||
    bodyConfig.displayName ||
    row?.name ||
    '';
  const fullName =
    row?.full_name ||
    bodyConfig.fullName ||
    displayName;
  const aliases = normalizeStringArray(
    parseJsonField(row?.aliases, bodyConfig.aliases || []),
  );
  const tags = normalizeStringArray(
    parseJsonField(row?.tags, bodyConfig.tags || []),
  );
  const categories = normalizeStringArray(
    parseJsonField(row?.categories, bodyConfig.categories || []),
  );
  const canonRefs = normalizeStringArray(bodyConfig.canonRefs);
  const knowledgeRefs = normalizeStringArray(bodyConfig.knowledgeRefs);
  const capabilities = normalizeCapabilities(
    parseJsonField(row?.capabilities, bodyConfig.capabilities || {}),
  );
  const provider = row?.provider || bodyConfig.provider || null;
  const conditioning = typeof bodyConfig.conditioning === 'string' ? bodyConfig.conditioning : '';

  return {
    configJson: bodyConfig,
    displayName,
    fullName,
    aliases,
    tags,
    categories,
    canonRefs,
    knowledgeRefs,
    capabilities,
    provider,
    conditioning,
    hasPersistentMemory: bodyConfig.hasPersistentMemory !== false,
  };
}

export function isPlaceholderModelValue(value) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  return MODEL_PLACEHOLDER_TOKENS.has(normalized);
}

export function mergeRuntimeRowsForCallsign(aiRow, gptRow) {
  if (!aiRow && !gptRow) return null;
  if (!aiRow) return gptRow;
  if (!gptRow) return aiRow;

  const preferredBase = pickPreferredRuntimeConfigRecord([aiRow, gptRow]) || aiRow;
  const secondary = preferredBase === aiRow ? gptRow : aiRow;
  const merged = { ...preferredBase };

  for (const field of RUNTIME_MODEL_FIELDS) {
    if (isPlaceholderModelValue(preferredBase[field]) && !isPlaceholderModelValue(secondary[field])) {
      merged[field] = secondary[field];
    }
  }

  if (isEmptyText(preferredBase.instructions) && !isEmptyText(secondary.instructions)) {
    merged.instructions = secondary.instructions;
  }

  for (const field of [
    'display_name',
    'full_name',
    'aliases',
    'provider',
    'tags',
    'categories',
    'config_json',
    'capabilities',
  ]) {
    if (isEmptyText(preferredBase[field]) && !isEmptyText(secondary[field])) {
      merged[field] = secondary[field];
    }
  }

  return merged;
}

function rowToGPTConfig(row) {
  const body = extractBodyMetadata(row);
  return {
    id: row.id,
    name: body.displayName || row.name,
    displayName: body.displayName || row.name,
    fullName: body.fullName || body.displayName || row.name,
    aliases: body.aliases,
    description: row.description,
    instructions: row.instructions,
    conversationStarters: parseJsonField(row.conversation_starters, []),
    avatar: row.avatar,
    capabilities: body.capabilities,
    constructCallsign: row.construct_callsign,
    modelId: row.model_id,
    conversationModel: row.conversation_model,
    creativeModel: row.creative_model,
    codingModel: row.coding_model,
    orchestrationMode: row.orchestration_mode || 'lin',
    provider: body.provider,
    tags: body.tags,
    categories: body.categories,
    canonRefs: body.canonRefs,
    knowledgeRefs: body.knowledgeRefs,
    configJson: body.configJson,
    conditioning: body.conditioning,
    hasPersistentMemory: body.hasPersistentMemory,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    memoryEnabled: Boolean(row.memory_enabled),
    memoryProfile: row.memory_profile || 'off',
    roleplayEnabled: Boolean(row.roleplay_enabled)
  };
}

export class GPTManager {
  static instance = null;
  db = null;
  runtimeGPTs = new Map();
  uploadDir = '';
  hydrationPromise = null;

  constructor() {
    // Resolve DB at project root (chatty/chatty.db)
    // __dirname is /server/lib, so go up two levels to project root
    const dbPath = path.join(__dirname, '..', '..', 'chatty.db');
    const absoluteDbPath = path.resolve(dbPath);

    // Check if database exists in server/ directory (wrong location)
    const serverDbPath = path.join(__dirname, '..', 'chatty.db');
    fs.access(serverDbPath).then(() => {
      console.warn(`⚠️ [GPTManager] Found database at wrong location: ${serverDbPath}. Using correct location: ${absoluteDbPath}`);
    }).catch(() => {
      // Database not in server/ directory, which is correct
    });

    this.db = new Database(absoluteDbPath);
    console.log(`✅ [GPTManager] Database initialized at: ${absoluteDbPath}`);
    this.uploadDir = path.join(process.cwd(), 'gpt-uploads');
    this.initializeDatabase();
    this.ensureUploadDir();
  }

  static getInstance() {
    if (!GPTManager.instance) {
      GPTManager.instance = new GPTManager();
    }
    return GPTManager.instance;
  }

  initializeDatabase() {
    // GPTs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gpts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        instructions TEXT,
        conversation_starters TEXT,
        avatar TEXT,
        capabilities TEXT,
        construct_callsign TEXT,
        model_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT NOT NULL
      )
    `);

    // GPT Versions table for draft history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gpt_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gpt_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gpt_id) REFERENCES gpts (id) ON DELETE CASCADE
      )
    `);

    // Ensure construct_callsign column exists for older databases
    const hasConstructCallsign = this.db.prepare(`PRAGMA table_info(gpts)`).all().some(col => col.name === 'construct_callsign');
    if (!hasConstructCallsign) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN construct_callsign TEXT`);
    }

    // Ensure per-mode model columns and orchestration_mode exist
    const columns = this.db.prepare(`PRAGMA table_info(gpts)`).all();
    const hasConversationModel = columns.some(col => col.name === 'conversation_model');
    const hasCreativeModel = columns.some(col => col.name === 'creative_model');
    const hasCodingModel = columns.some(col => col.name === 'coding_model');
    const hasOrchestrationMode = columns.some(col => col.name === 'orchestration_mode');

    if (!hasConversationModel) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN conversation_model TEXT`);
    }
    if (!hasCreativeModel) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN creative_model TEXT`);
    }
    if (!hasCodingModel) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN coding_model TEXT`);
    }
    if (!hasOrchestrationMode) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN orchestration_mode TEXT`);
    }

    const hasMemoryEnabled = columns.some(col => col.name === 'memory_enabled');
    const hasMemoryProfile = columns.some(col => col.name === 'memory_profile');
    if (!hasMemoryEnabled) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN memory_enabled INTEGER DEFAULT 0`);
    }
    if (!hasMemoryProfile) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN memory_profile TEXT DEFAULT 'off'`);
    }

    const hasRoleplayEnabled = columns.some(col => col.name === 'roleplay_enabled');
    if (!hasRoleplayEnabled) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN roleplay_enabled INTEGER DEFAULT 0`);
    }

    const hasDisplayName = columns.some(col => col.name === 'display_name');
    const hasFullName = columns.some(col => col.name === 'full_name');
    const hasAliases = columns.some(col => col.name === 'aliases');
    const hasProvider = columns.some(col => col.name === 'provider');
    const hasTags = columns.some(col => col.name === 'tags');
    const hasCategories = columns.some(col => col.name === 'categories');
    const hasConfigJson = columns.some(col => col.name === 'config_json');
    if (!hasDisplayName) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN display_name TEXT`);
    }
    if (!hasFullName) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN full_name TEXT`);
    }
    if (!hasAliases) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN aliases TEXT`);
    }
    if (!hasProvider) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN provider TEXT`);
    }
    if (!hasTags) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN tags TEXT`);
    }
    if (!hasCategories) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN categories TEXT`);
    }
    if (!hasConfigJson) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN config_json TEXT`);
    }

    // Backfill defaults for existing rows
    this.db.exec(`
      UPDATE gpts
      SET
        conversation_model = COALESCE(conversation_model, model_id),
        creative_model = COALESCE(creative_model, model_id),
        coding_model = COALESCE(coding_model, model_id),
        orchestration_mode = COALESCE(orchestration_mode, 'lin'),
        memory_enabled = COALESCE(memory_enabled, 0),
        memory_profile = COALESCE(memory_profile, 'off'),
        roleplay_enabled = COALESCE(roleplay_enabled, 0),
        display_name = COALESCE(display_name, name),
        full_name = COALESCE(full_name, display_name, name),
        aliases = COALESCE(aliases, '[]'),
        provider = COALESCE(provider, ''),
        tags = COALESCE(tags, '[]'),
        categories = COALESCE(categories, '[]'),
        config_json = COALESCE(config_json, '{}')
    `);

    // GPT Files table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gpt_files (
        id TEXT PRIMARY KEY,
        gpt_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        content TEXT NOT NULL,
        extracted_text TEXT,
        metadata TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (gpt_id) REFERENCES gpts (id) ON DELETE CASCADE
      )
    `);

    // GPT Actions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gpt_actions (
        id TEXT PRIMARY KEY,
        gpt_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'GET',
        headers TEXT,
        parameters TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gpt_id) REFERENCES gpts (id) ON DELETE CASCADE
      )
    `);

    console.log('✅ GPT Manager database initialized');

    this.normalizeSystemConstructRows();
    this.cleanupRemovedSeeds();
    this.seedDefaultGPTs();
  }

  normalizeSystemConstructRows() {
    const templates = GPTManager.getSystemConstructTemplates();
    const selectRows = this.db.prepare(`
      SELECT
        id,
        name,
        description,
        instructions,
        conversation_starters,
        capabilities,
        orchestration_mode,
        memory_enabled,
        memory_profile,
        roleplay_enabled,
        display_name,
        full_name,
        aliases,
        provider,
        tags,
        categories,
        config_json
      FROM gpts
      WHERE construct_callsign = ?
    `);
    const updateStmt = this.db.prepare(`
      UPDATE gpts
      SET
        display_name = ?,
        full_name = ?,
        description = ?,
        instructions = ?,
        conversation_starters = ?,
        capabilities = ?,
        aliases = ?,
        provider = ?,
        tags = ?,
        categories = ?,
        config_json = ?,
        orchestration_mode = ?,
        memory_enabled = ?,
        memory_profile = ?,
        roleplay_enabled = ?,
        updated_at = ?
      WHERE id = ?
    `);

    for (const template of templates) {
      const rows = selectRows.all(template.callsign);
      for (const row of rows) {
        const nextDescription = (() => {
          const check = this._dbValueEmpty(row.description)
            ? { isStub: true }
            : this._isStubValue(row.description, 'description', row.name || template.name);
          return check.isStub ? template.description : row.description;
        })();

        const nextInstructions = (() => {
          const check = this._dbValueEmpty(row.instructions)
            ? { isStub: true }
            : this._isStubValue(row.instructions, 'instructions', row.name || template.name);
          return check.isStub ? template.instructions : row.instructions;
        })();

        let existingStarters = [];
        try {
          existingStarters = JSON.parse(row.conversation_starters || '[]');
        } catch {
          existingStarters = [];
        }
        const startersCheck = this._dbValueEmpty(row.conversation_starters)
          ? { isStub: true }
          : this._isStubStarters(existingStarters);
        const nextStartersJson = startersCheck.isStub
          ? JSON.stringify(template.starters || [])
          : JSON.stringify(existingStarters);
        const existingCapabilities = normalizeCapabilities(parseJsonField(row.capabilities, {}));
        const nextCapabilitiesJson = JSON.stringify(normalizeCapabilities(template.capabilities));
        const nextAliasesJson = JSON.stringify(normalizeStringArray(template.aliases));
        const nextTagsJson = JSON.stringify(normalizeStringArray(template.tags));
        const nextCategoriesJson = JSON.stringify(normalizeStringArray(template.categories));
        const lockedRuntime = applyExistingSimLockToStoredDraft(row, {
          provider: template.provider || '',
          orchestrationMode: template.orchestrationMode,
          configJson: buildStoredConfigJson(template),
        });
        const nextProvider = lockedRuntime.provider ?? template.provider ?? '';
        const nextOrchestrationMode = lockedRuntime.orchestrationMode ?? template.orchestrationMode;
        const nextConfigJson = JSON.stringify(lockedRuntime.configJson ?? buildStoredConfigJson(template));

        const metadataChanged =
          String(row.display_name || '') !== String(template.displayName || template.name || '') ||
          String(row.full_name || '') !== String(template.fullName || template.displayName || template.name || '') ||
          nextDescription !== (row.description || '') ||
          nextInstructions !== (row.instructions || '') ||
          nextStartersJson !== (row.conversation_starters || '[]') ||
          JSON.stringify(existingCapabilities) !== nextCapabilitiesJson ||
          String(row.aliases || '[]') !== nextAliasesJson ||
          String(row.provider || '') !== String(nextProvider || '') ||
          String(row.tags || '[]') !== nextTagsJson ||
          String(row.categories || '[]') !== nextCategoriesJson ||
          String(row.config_json || '{}') !== nextConfigJson;

        const settingsChanged =
          row.orchestration_mode !== nextOrchestrationMode ||
          Number(row.memory_enabled) !== Number(template.memoryEnabled) ||
          String(row.memory_profile || '') !== String(template.memoryProfile || '') ||
          Number(row.roleplay_enabled) !== Number(template.roleplayEnabled);

        if (!metadataChanged && !settingsChanged) {
          continue;
        }

        updateStmt.run(
          template.displayName || template.name,
          template.fullName || template.displayName || template.name,
          nextDescription,
          nextInstructions,
          nextStartersJson,
          nextCapabilitiesJson,
          nextAliasesJson,
          nextProvider,
          nextTagsJson,
          nextCategoriesJson,
          nextConfigJson,
          nextOrchestrationMode,
          template.memoryEnabled,
          template.memoryProfile,
          template.roleplayEnabled,
          new Date().toISOString(),
          row.id,
        );
      }
    }
  }

  cleanupRemovedSeeds() {
    const removedSeeds = ['aurora-001'];
    for (const callsign of removedSeeds) {
      const exists = this.db.prepare(
        `SELECT id FROM gpts WHERE construct_callsign = ? AND id LIKE '%-seed'`
      ).get(callsign);
      if (exists) {
        this.db.prepare(`DELETE FROM gpts WHERE id = ?`).run(exists.id);
        console.log(`🧹 [GPTManager] Removed previously seeded ${callsign} — should be added via GUI only`);
      }
    }
  }

  static getSystemConstructTemplates() {
    return listSystemConstructCatalog({ seededOnly: true }).map((entry) => ({
      callsign: entry.callsign,
      name: entry.name,
      displayName: entry.displayName || entry.name,
      fullName: entry.fullName || entry.displayName || entry.name,
      aliases: [...(entry.aliases || [])],
      description: entry.description,
      instructions: entry.instructions,
      starters: [...(entry.conversationStarters || [])],
      capabilities: { ...(entry.capabilities || DEFAULT_CAPABILITIES) },
      orchestrationMode: entry.orchestrationMode,
      memoryEnabled: entry.memoryEnabled,
      memoryProfile: entry.memoryProfile,
      roleplayEnabled: entry.roleplayEnabled,
      model: entry.model,
      creativeModel: entry.creativeModel,
      codingModel: entry.codingModel,
      provider: entry.provider || null,
      tags: [...(entry.summaryTags || [])],
      categories: [...(entry.summaryCategories || [])],
      canonRefs: [...(entry.canonRefs || [])],
      knowledgeRefs: [...(entry.knowledgeRefs || [])],
      conditioning: entry.conditioning || '',
      personality: entry.personality || null,
      summaryCapabilities: [...(entry.summaryCapabilities || [])],
      configJson: entry.configJson || null,
      roleMetadata: entry.callsign === 'lin-001'
        ? JSON.stringify({ role: 'undertone', context: 'gpt_creator_create_tab', is_system: true })
        : entry.callsign === 'val-001'
        ? JSON.stringify({ role: 'validator', context: 'continuity_custodian', is_system: true })
        : entry.callsign === 'continuitygpt-001'
        ? JSON.stringify({ role: 'continuity_engine', context: 'evidence_ledger', is_system: true })
        : undefined,
    }));
  }

  seedDefaultGPTs() {
    this.autoGenerateMissingAvatars();
    void this.hydrateFromVVAULT();
  }

  provisionUserConstructs(userId) {
    if (!userId || userId === 'anonymous') {
      console.warn('⚠️ [GPTManager] Cannot provision constructs for anonymous user');
      return;
    }

    const templates = GPTManager.getSystemConstructTemplates();
    const insertStmt = this.db.prepare(`
      INSERT INTO gpts (
        id, name, display_name, full_name, description, instructions, conversation_starters, avatar, capabilities, construct_callsign,
        aliases, provider, tags, categories, config_json,
        model_id, conversation_model, creative_model, coding_model, orchestration_mode,
        memory_enabled, memory_profile, roleplay_enabled,
        is_active, created_at, updated_at, user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = this.db.prepare(`
      UPDATE gpts
      SET
        display_name = ?,
        full_name = ?,
        capabilities = ?,
        aliases = ?,
        provider = ?,
        tags = ?,
        categories = ?,
        config_json = ?,
        orchestration_mode = ?,
        memory_enabled = ?,
        memory_profile = ?,
        roleplay_enabled = ?,
        updated_at = ?
      WHERE construct_callsign = ? AND user_id = ?
    `);

    for (const template of templates) {
      const existingRow = this.db.prepare(
        `SELECT * FROM gpts WHERE construct_callsign = ? AND user_id = ?`
      ).get(template.callsign, userId);

      if (!existingRow) {
        const gptId = `gpt-${template.callsign}-${userId.substring(0, 8)}`;
        console.log(`🌱 [GPTManager] Provisioning ${template.name} for user ${userId}...`);
        const now = new Date().toISOString();
        insertStmt.run(
          gptId,
          template.name,
          template.displayName || template.name,
          template.fullName || template.displayName || template.name,
          template.description,
          template.instructions,
          JSON.stringify(template.starters),
          null,
          JSON.stringify(normalizeCapabilities(template.capabilities)),
          template.callsign,
          JSON.stringify(normalizeStringArray(template.aliases)),
          template.provider || '',
          JSON.stringify(normalizeStringArray(template.tags)),
          JSON.stringify(normalizeStringArray(template.categories)),
          JSON.stringify(buildStoredConfigJson(template)),
          template.model,
          template.model,
          template.creativeModel,
          template.codingModel,
          template.orchestrationMode,
          template.memoryEnabled,
          template.memoryProfile,
          template.roleplayEnabled,
          1,
          now,
          now,
          userId
        );
        console.log(`✅ [GPTManager] ${template.name} provisioned for user ${userId}`);
      } else {
        const lockedRuntime = applyExistingSimLockToStoredDraft(existingRow, {
          provider: template.provider || '',
          orchestrationMode: template.orchestrationMode,
          configJson: buildStoredConfigJson(template),
        });
        updateStmt.run(
          template.displayName || template.name,
          template.fullName || template.displayName || template.name,
          JSON.stringify(normalizeCapabilities(template.capabilities)),
          JSON.stringify(normalizeStringArray(template.aliases)),
          lockedRuntime.provider ?? template.provider ?? '',
          JSON.stringify(normalizeStringArray(template.tags)),
          JSON.stringify(normalizeStringArray(template.categories)),
          JSON.stringify(lockedRuntime.configJson ?? buildStoredConfigJson(template)),
          lockedRuntime.orchestrationMode ?? template.orchestrationMode,
          template.memoryEnabled,
          template.memoryProfile,
          template.roleplayEnabled,
          new Date().toISOString(),
          template.callsign,
          userId
        );
      }
    }

    void this.ensureSystemConstructBundles(userId).catch((error) => {
      console.warn(`⚠️ [GPTManager] System construct bundle backfill failed for ${userId}: ${error.message}`);
    });

    void this.hydrateFromVVAULT();
  }

  async ensureSystemConstructBundles(userId) {
    if (!userId || userId === 'anonymous') return;

    const templates = GPTManager.getSystemConstructTemplates();
    const { scaffoldConstruct } = await import('./constructScaffolder.js');

    for (const template of templates) {
      const payload = {
        name: template.name,
        displayName: template.displayName,
        fullName: template.fullName,
        aliases: template.aliases,
        description: template.description,
        instructions: template.instructions,
        conversationStarters: template.starters,
        capabilities: template.capabilities,
        orchestrationMode: template.orchestrationMode,
        memoryEnabled: Boolean(template.memoryEnabled),
        memoryProfile: template.memoryProfile,
        roleplayEnabled: Boolean(template.roleplayEnabled),
        modelId: template.model,
        conversationModel: template.model,
        creativeModel: template.creativeModel,
        codingModel: template.codingModel,
        provider: template.provider || '',
        tags: template.tags,
        categories: template.categories,
        canonRefs: template.canonRefs,
        knowledgeRefs: template.knowledgeRefs,
        conditioning: template.conditioning || '',
        personality: template.personality || null,
        configJson: template.configJson || null,
        summaryCapabilities: template.summaryCapabilities || [],
      };

      const result = await scaffoldConstruct(template.callsign, payload, {
        userId,
        localOnly: true,
        syncGenerated: false,
      });

      if (!result?.success) {
        console.warn(`⚠️ [GPTManager] Failed to scaffold bundle for ${template.callsign}: ${result?.reason || 'unknown failure'}`);
      }
    }
  }

  async hydrateFromVVAULT() {
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = this._hydrateFromVVAULT()
      .finally(() => {
        this.hydrationPromise = null;
      });

    return this.hydrationPromise;
  }

  async _hydrateFromVVAULT() {
    const { vvaultApiBaseUrl, serviceToken } = getVvaultBridgeConfig();

    const constructs = this.db.prepare(
      `SELECT id, construct_callsign, name, description, instructions, conversation_starters, capabilities, display_name, full_name, aliases, provider, tags, categories, config_json FROM gpts WHERE construct_callsign IS NOT NULL`
    ).all();

    for (const gpt of constructs) {
      let hydrated = false;

      if (vvaultApiBaseUrl) {
        try {
          const baseUrl = vvaultApiBaseUrl.replace(/\/$/, '');
          const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
          if (serviceToken) headers['X-Chatty-Key'] = serviceToken;

          const filesResponse = await fetch(
            `${baseUrl}/api/chatty/construct/${gpt.construct_callsign}/files?folder=identity`,
            { method: 'GET', headers, signal: AbortSignal.timeout(8000) }
          );

          if (filesResponse.ok) {
            const contentType = filesResponse.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const filesData = await filesResponse.json();
              const identityFiles = filesData.files?.identity || filesData.identity || [];

              const promptFile = identityFiles.find(f =>
                f.filename === 'prompt.json' || f.filename === 'prompt.txt' ||
                (f.storage_path || '').includes('identity/prompt')
              );

              if (promptFile && promptFile.content) {
                hydrated = this._applyIdentityUpdate(gpt, promptFile.content, 'VVAULT API') || Boolean(String(promptFile.content).trim());
              }
            } else {
              console.log(`⚠️ [GPTManager] VVAULT files endpoint returned non-JSON for ${gpt.construct_callsign} (likely SPA catch-all)`);
            }
          }
        } catch (error) {
          console.log(`⚠️ [GPTManager] VVAULT API hydration failed for ${gpt.construct_callsign}: ${error.message}`);
        }
      }

      if (!hydrated) {
        try {
          const { getSupabaseClient } = await import('../lib/supabaseClient.js');
          const supabase = getSupabaseClient();
          if (supabase) {
            const constructVariants = [
              gpt.construct_callsign,
              gpt.construct_callsign.replace(/-\d+$/, '')
            ];

            for (const cid of constructVariants) {
              if (hydrated) break;
              const { data } = await supabase
                .from('vault_files')
                .select('filename, content, metadata')
                .eq('construct_id', cid)
                .or('filename.ilike.%prompt.json,filename.ilike.%prompt.txt')
                .limit(1);

              if (data && data.length > 0 && data[0].content) {
                hydrated = this._applyIdentityUpdate(gpt, data[0].content, 'Supabase') || Boolean(String(data[0].content).trim());
              }
            }
          }
        } catch (sbErr) {
          console.log(`⚠️ [GPTManager] Supabase identity fallback failed for ${gpt.construct_callsign}: ${sbErr.message}`);
        }
      }

      if (!hydrated) {
        try {
          const { loadPromptTxt } = await import('./identityLoader.js');
          const localPrompt = await loadPromptTxt(gpt.user_id || 'system', gpt.construct_callsign);
          if (localPrompt) {
            hydrated = this._applyIdentityUpdate(gpt, localPrompt, 'local_identity_loader') || Boolean(String(localPrompt).trim());
          }
        } catch (localErr) {
          console.log(`⚠️ [GPTManager] Local identity fallback failed for ${gpt.construct_callsign}: ${localErr.message}`);
        }
      }

      if (!hydrated) {
        console.log(`ℹ️ [GPTManager] No identity data found for ${gpt.construct_callsign} — will show empty until configured`);
      }

      // Avatar authority now stays on the canonical /api/ais/:constructCallsign/avatar
      // route instead of being rewritten into the local GPT tables during hydration.
    }

    console.log('✅ [GPTManager] VVAULT identity hydration complete');
  }

  _dbValueEmpty(value) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  }

  _isStubValue(value, fieldName, constructName) {
    if (this._dbValueEmpty(value)) return { isStub: true, reason: 'empty or null' };
    const v = value.trim().toLowerCase();
    const name = (constructName || '').toLowerCase();
    const stubPatterns = [
      'a custom gpt',
      'a custom ai',
      'no description',
      'no instructions',
      'description here',
      'instructions here',
      'enter description',
      'enter instructions',
      'default description',
      'default instructions',
      'tbd',
      'todo',
      'placeholder',
    ];
    const matchedPattern = stubPatterns.find(p => v === p);
    if (matchedPattern) return { isStub: true, reason: `matches placeholder pattern: "${matchedPattern}"` };
    if (fieldName === 'instructions') {
      if (/^you are \w+\.?$/i.test(v)) return { isStub: true, reason: `matches generic template: "You are {Name}."` };
      if (name && (v === `you are ${name}.` || v === `you are ${name}`)) return { isStub: true, reason: `matches construct-name template` };
    }
    if (fieldName === 'description' && v.length < 50) return { isStub: true, reason: `description too short (${v.length} chars < 50 threshold)` };
    if (fieldName === 'instructions' && v.length < 50) return { isStub: true, reason: `instructions too short (${v.length} chars < 50 threshold)` };
    return { isStub: false, reason: 'authored content detected' };
  }

  _isStubStarters(starters) {
    if (!starters || starters.length === 0) return { isStub: true, reason: 'empty starters array' };
    if (starters.length === 1 && !starters[0]) return { isStub: true, reason: 'single empty starter' };
    const defaultPatterns = ['hello', 'hi', 'hey', 'tell me about yourself', 'what can you do'];
    if (starters.length <= 2 && starters.every(s => defaultPatterns.includes((s || '').trim().toLowerCase()))) {
      return { isStub: true, reason: 'only generic default starters' };
    }
    return { isStub: false, reason: 'authored starters detected' };
  }

  _applyIdentityUpdate(gpt, content, source) {
    try {
      let parsed = {};
      if (typeof content === 'string') {
        try { parsed = JSON.parse(content); } catch {
          const trimmed = content.trim();
          if (trimmed.length > 10) {
            parsed = this._parseStructuredPrompt(trimmed);
            const fields = Object.keys(parsed).filter(k => parsed[k]);
            console.log(`📝 [GPTManager] Parsed prompt.txt for ${gpt.construct_callsign}: ${fields.join(', ')} (${trimmed.length} chars)`);
          }
        }
      } else {
        parsed = content;
      }

      const auditLog = [];
      const updates = {};
      const parsedDisplayName =
        typeof parsed.displayName === 'string' && parsed.displayName.trim()
          ? parsed.displayName.trim()
          : typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name.trim()
            : '';
      const parsedFullName =
        typeof parsed.fullName === 'string' && parsed.fullName.trim()
          ? parsed.fullName.trim()
          : parsedDisplayName;
      const parsedAliases = normalizeStringArray(parsed.aliases);
      const parsedTags = normalizeStringArray(parsed.tags);
      const parsedCategories = normalizeStringArray(parsed.categories);
      const parsedCapabilities = normalizeCapabilities(parsed.capabilities);
      const parsedConfigJson = buildStoredConfigJson({
        ...parsed,
        name: parsedDisplayName || parsed.name,
        displayName: parsedDisplayName || parsed.name,
        fullName: parsedFullName || parsedDisplayName || parsed.name,
        aliases: parsedAliases,
        tags: parsedTags,
        categories: parsedCategories,
        capabilities: parsedCapabilities,
        provider: parsed.provider || '',
      });
      const lockedRuntime = applyExistingSimLockToStoredDraft(gpt, {
        provider: parsed.provider || '',
        orchestrationMode: gpt.orchestration_mode || 'lin',
        modelId: gpt.model_id,
        conversationModel: gpt.conversation_model,
        creativeModel: gpt.creative_model,
        codingModel: gpt.coding_model,
        configJson: parsedConfigJson,
      });
      const nextProvider = lockedRuntime.provider ?? parsed.provider ?? '';
      const nextConfigJson = JSON.stringify(lockedRuntime.configJson ?? parsedConfigJson);
      // VVAULT-first: when DB is null/empty, mirror VVAULT; when DB has value, stub protection only.
      if (parsedDisplayName && parsedDisplayName !== gpt.name) updates.name = parsedDisplayName;
      if (parsedDisplayName && parsedDisplayName !== gpt.display_name) {
        updates.display_name = parsedDisplayName;
      }
      if (parsedFullName && parsedFullName !== gpt.full_name) {
        updates.full_name = parsedFullName;
      }
      if (parsedAliases.length > 0) {
        const nextAliasesJson = JSON.stringify(parsedAliases);
        if (nextAliasesJson !== String(gpt.aliases || '[]')) {
          updates.aliases = nextAliasesJson;
        }
      }
      if (nextProvider && nextProvider !== gpt.provider) {
        updates.provider = nextProvider;
      }
      if (parsedTags.length > 0) {
        const nextTagsJson = JSON.stringify(parsedTags);
        if (nextTagsJson !== String(gpt.tags || '[]')) {
          updates.tags = nextTagsJson;
        }
      }
      if (parsedCategories.length > 0) {
        const nextCategoriesJson = JSON.stringify(parsedCategories);
        if (nextCategoriesJson !== String(gpt.categories || '[]')) {
          updates.categories = nextCategoriesJson;
        }
      }
      if (parsed.capabilities && JSON.stringify(parsedCapabilities) !== String(gpt.capabilities || '{}')) {
        updates.capabilities = JSON.stringify(parsedCapabilities);
      }
      if (Object.keys(lockedRuntime.configJson || parsedConfigJson).length > 0) {
        if (nextConfigJson !== String(gpt.config_json || '{}')) {
          updates.config_json = nextConfigJson;
        }
      }
      if (lockedRuntime.orchestrationMode && lockedRuntime.orchestrationMode !== gpt.orchestration_mode) {
        updates.orchestration_mode = lockedRuntime.orchestrationMode;
      }
      if (lockedRuntime.modelId && lockedRuntime.modelId !== gpt.model_id) {
        updates.model_id = lockedRuntime.modelId;
      }
      if (lockedRuntime.conversationModel && lockedRuntime.conversationModel !== gpt.conversation_model) {
        updates.conversation_model = lockedRuntime.conversationModel;
      }
      if (lockedRuntime.creativeModel && lockedRuntime.creativeModel !== gpt.creative_model) {
        updates.creative_model = lockedRuntime.creativeModel;
      }
      if (lockedRuntime.codingModel && lockedRuntime.codingModel !== gpt.coding_model) {
        updates.coding_model = lockedRuntime.codingModel;
      }

      if (parsed.description && parsed.description !== gpt.description) {
        const empty = this._dbValueEmpty(gpt.description);
        const check = empty ? { isStub: true, reason: 'empty or null' } : this._isStubValue(gpt.description, 'description', gpt.name);
        if (check.isStub) {
          updates.description = parsed.description;
          auditLog.push({ field: 'description', action: 'hydrated', reason: check.reason });
        } else {
          auditLog.push({ field: 'description', action: 'write-protected', reason: check.reason });
        }
      }

      if (parsed.instructions && parsed.instructions !== gpt.instructions) {
        const empty = this._dbValueEmpty(gpt.instructions);
        const check = empty ? { isStub: true, reason: 'empty or null' } : this._isStubValue(gpt.instructions, 'instructions', gpt.name);
        if (check.isStub) {
          updates.instructions = parsed.instructions;
          auditLog.push({ field: 'instructions', action: 'hydrated', reason: check.reason });
        } else {
          auditLog.push({ field: 'instructions', action: 'write-protected', reason: check.reason });
        }
      }

      if (parsed.conversationStarters && parsed.conversationStarters.length > 0) {
        const existingStarters = parseJsonField(gpt.conversation_starters, []);
        const newJson = JSON.stringify(parsed.conversationStarters);
        if (newJson !== JSON.stringify(existingStarters)) {
          const empty = this._dbValueEmpty(gpt.conversation_starters);
          const check = empty ? { isStub: true, reason: 'empty or null' } : this._isStubStarters(existingStarters);
          if (check.isStub) {
            updates.conversation_starters = newJson;
            auditLog.push({ field: 'conversationStarters', action: 'hydrated', reason: check.reason });
          } else {
            auditLog.push({ field: 'conversationStarters', action: 'write-protected', reason: check.reason });
          }
        }
      }

      const gatedFields = auditLog.filter(e => e.action === 'write-protected');
      if (gatedFields.length > 0) {
        for (const entry of gatedFields) {
          console.log(`🔒 [GPTManager] ${gpt.construct_callsign}.${entry.field}: WRITE-PROTECTED — ${entry.reason} (source: ${source})`);
        }
      }
      const hydratedFields = auditLog.filter(e => e.action === 'hydrated');
      if (hydratedFields.length > 0) {
        for (const entry of hydratedFields) {
          console.log(`📥 [GPTManager] ${gpt.construct_callsign}.${entry.field}: hydrated — was ${entry.reason} (source: ${source})`);
        }
      }

      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(updates), gpt.id];
        this.db.prepare(`UPDATE gpts SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
        const fieldNames = Object.keys(updates).map(k => k === 'conversation_starters' ? `conversationStarters (${parsed.conversationStarters.length})` : k);
        console.log(`✅ [GPTManager] Hydrated ${gpt.construct_callsign} from ${source}: ${fieldNames.join(', ')}`);
        return true;
      }
      return false;
    } catch (error) {
      console.log(`⚠️ [GPTManager] Failed to apply identity update for ${gpt.construct_callsign}: ${error.message}`);
      return false;
    }
  }

  _parseStructuredPrompt(text) {
    const result = {};
    const lines = text.split('\n');

    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const nameMatch = line.match(/^\*\*(.+?)\*\*$/);
      if (nameMatch && !result.name) {
        let rawName = nameMatch[1].trim();
        rawName = rawName.replace(/^you are\s+/i, '');
        result.name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
        continue;
      }

      const descMatch = line.match(/^\*([^*].+?)\*$/);
      if (descMatch && !result.description) {
        result.description = descMatch[1].trim();
        continue;
      }
    }

    let instructionsStart = -1;
    let startersStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^instructions\s+for\s+/i.test(line) || /^instructions:/i.test(line)) {
        instructionsStart = i;
      }
      if (/^\*\*conversation\s+starters:?\*\*$/i.test(line)) {
        startersStart = i;
      }
    }

    if (startersStart >= 0) {
      const starters = [];
      for (let i = startersStart + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (/^\*\*/.test(line)) break;
        const starterMatch = line.match(/^-\s*\*(.+?)\*$/);
        if (starterMatch) {
          starters.push(starterMatch[1].trim());
        }
      }
      if (starters.length > 0) {
        result.conversationStarters = starters;
      }
    }

    const instructionsEnd = startersStart >= 0 ? startersStart : lines.length;

    if (instructionsStart >= 0) {
      const header = lines[instructionsStart].trim();
      const afterColon = header.includes(':') ? header.split(':').slice(1).join(':').trim() : '';
      const remaining = lines.slice(instructionsStart + 1, instructionsEnd).join('\n').trim();
      const raw = afterColon ? afterColon + '\n' + remaining : remaining;
      result.instructions = raw.replace(/^```\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
    } else if (!result.name && !result.description) {
      result.instructions = text;
    } else {
      const allAfterHeader = [];
      let pastHeader = false;
      for (let i = 0; i < lines.length; i++) {
        if (i >= instructionsEnd) break;
        const line = lines[i].trim();
        if (!pastHeader) {
          if (line.match(/^\*\*(.+?)\*\*$/) || line.match(/^\*([^*].+?)\*$/) || !line) continue;
          pastHeader = true;
        }
        if (pastHeader) allAfterHeader.push(lines[i]);
      }
      const raw = allAfterHeader.join('\n').trim();
      result.instructions = raw.replace(/^```\s*$/gm, '').trim();
    }

    return result;
  }

  autoGenerateMissingAvatars() {
    try {
      const gptsWithoutAvatars = this.db.prepare(`
        SELECT id, name FROM gpts WHERE avatar IS NULL OR avatar = ''
      `).all();

      if (gptsWithoutAvatars.length > 0) {
        console.log(`🎨 [GPTManager] Generating avatars for ${gptsWithoutAvatars.length} GPTs without avatars...`);

        for (const gpt of gptsWithoutAvatars) {
          const avatar = this.generateAvatar(gpt.name, '');
          this.db.prepare(`UPDATE gpts SET avatar = ? WHERE id = ?`).run(avatar, gpt.id);
          console.log(`✅ [GPTManager] Generated avatar for ${gpt.name}`);
        }
      }
    } catch (error) {
      console.error('⚠️ [GPTManager] Error auto-generating avatars:', error.message);
    }
  }

  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
  }

  /**
   * Generate constructCallsign from GPT name with sequential numbering
   * Example: "Katana" → "katana-001", "Katana" (second one) → "katana-002"
   *
   * @param {string} name - GPT name (e.g., "Katana", "Luna")
   * @param {string} userId - User ID to scope the search
   * @returns {Promise<string>} - Construct callsign (e.g., "katana-001")
   */
  async generateConstructCallsign(name, userId) {
    if (!name || !name.trim()) {
      throw new Error('GPT name is required to generate constructCallsign');
    }

    // Normalize name: lowercase, remove special chars, replace spaces with hyphens
    const normalized = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    if (!normalized) {
      throw new Error(`Cannot generate constructCallsign from name: "${name}"`);
    }

    // Query existing GPTs with same normalized name for this user
    const stmt = this.db.prepare(`
      SELECT construct_callsign FROM gpts
      WHERE user_id = ? AND construct_callsign LIKE ?
      ORDER BY construct_callsign DESC
    `);
    const pattern = `${normalized}-%`;
    const existing = stmt.all(userId, pattern);

    // Find highest existing callsign number
    let maxNumber = 0;
    for (const row of existing) {
      if (row.construct_callsign) {
        const match = row.construct_callsign.match(/^(.+)-(\d+)$/);
        if (match && match[1] === normalized) {
          const num = parseInt(match[2], 10);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    }

    // Generate next sequential callsign
    const nextNumber = maxNumber + 1;
    const callsign = `${normalized}-${String(nextNumber).padStart(3, '0')}`;

    console.log(`✅ [GPTManager] Generated constructCallsign: "${name}" → ${callsign} (user: ${userId})`);
    return callsign;
  }

  // GPT CRUD Operations
  async createGPT(config) {
    if (process.env.VVAULT_CANONICAL === 'true') {
      throw new Error('ChattyDB writes are disabled in canonical VVAULT mode');
    }
    const id = `gpt-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Auto-generate constructCallsign if not provided
    let constructCallsign = config.constructCallsign;
    if (!constructCallsign && config.name) {
      try {
        constructCallsign = await this.generateConstructCallsign(config.name, config.userId || 'anonymous');
      } catch (error) {
        console.warn(`⚠️ [GPTManager] Failed to generate constructCallsign: ${error.message}, using null`);
        constructCallsign = null;
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO gpts (
        id, name, display_name, full_name, description, instructions, conversation_starters, avatar, capabilities, construct_callsign,
        aliases, provider, tags, categories, config_json,
        model_id, conversation_model, creative_model, coding_model, orchestration_mode,
        memory_enabled, memory_profile, roleplay_enabled,
        is_active, created_at, updated_at, user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const displayName = config.displayName || config.name;
    const fullName = config.fullName || displayName;
    const aliases = normalizeStringArray(config.aliases);
    const tags = normalizeStringArray(config.tags);
    const categories = normalizeStringArray(config.categories);
    const capabilities = normalizeCapabilities(config.capabilities || {});
    const storedConfigJson = buildStoredConfigJson({
      ...config,
      displayName,
      fullName,
      aliases,
      tags,
      categories,
      capabilities,
    });

    stmt.run(
      id,
      config.name,
      displayName,
      fullName,
      config.description,
      config.instructions,
      JSON.stringify(config.conversationStarters || []),
      config.avatar || null,
      JSON.stringify(capabilities),
      constructCallsign,
      JSON.stringify(aliases),
      config.provider || '',
      JSON.stringify(tags),
      JSON.stringify(categories),
      JSON.stringify(storedConfigJson),
      config.modelId,
      config.conversationModel || config.modelId,
      config.creativeModel || config.modelId,
      config.codingModel || config.modelId,
      config.orchestrationMode || 'lin',
      config.memoryEnabled ? 1 : 0,
      config.memoryProfile || 'off',
      config.roleplayEnabled ? 1 : 0,
      config.isActive ? 1 : 0,
      now,
      now,
      config.userId || 'anonymous'
    );

    this.recordVersion(id, 1, { ...config, constructCallsign });

    return {
      id,
      ...config,
      name: displayName || config.name,
      displayName,
      fullName,
      aliases,
      capabilities,
      provider: config.provider || '',
      tags,
      categories,
      configJson: storedConfigJson,
      files: [],
      actions: [],
      createdAt: now,
      updatedAt: now,
      constructCallsign: constructCallsign,
      conversationModel: config.conversationModel || config.modelId,
      creativeModel: config.creativeModel || config.modelId,
      codingModel: config.codingModel || config.modelId,
      orchestrationMode: config.orchestrationMode || 'lin',
      memoryEnabled: Boolean(config.memoryEnabled),
      memoryProfile: config.memoryProfile || 'off',
      roleplayEnabled: Boolean(config.roleplayEnabled)
    };
  }

  async getGPT(id) {
    const stmt = this.db.prepare('SELECT * FROM gpts WHERE id = ?');
    const row = stmt.get(id);

    if (!row) return null;

    const files = await this.getGPTFiles(id);
    const actions = await this.getGPTActions(id);

    return {
      ...rowToGPTConfig(row),
      files,
      actions,
    };
  }

  async getGPTByCallsign(constructCallsign) {
    if (!constructCallsign) return null;

    let aiRows = [];
    let gptRows = [];

    // Read from ais first (GPTCreator writes here)
    try {
      const aiStmt = this.db.prepare('SELECT * FROM ais WHERE construct_callsign = ?');
      aiRows = aiStmt.all(constructCallsign).map((row) => ({ ...row, __source_table: 'ais' }));
    } catch (e) {
      // ais table may not exist or lack columns - continue with gpts fallback
    }

    // Also read gpts to hydrate placeholders when ais uses authoring tokens like openrouter/auto
    try {
      const gptStmt = this.db.prepare('SELECT * FROM gpts WHERE construct_callsign = ?');
      gptRows = gptStmt.all(constructCallsign).map((row) => ({ ...row, __source_table: 'gpts' }));
    } catch (e) {
      // gpts table may not exist in edge environments
    }

    const aiRow = pickPreferredRuntimeConfigRecord(aiRows);
    const gptRow = pickPreferredRuntimeConfigRecord(gptRows);
    const resolvedRow = mergeRuntimeRowsForCallsign(aiRow, gptRow);
    if (!resolvedRow) return null;

    return rowToGPTConfig(applyForgedSimLockToRecord(resolvedRow));
  }

  async getAllGPTs(userId, originalUserId = null) {
    try {
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      if (!userId) {
        console.warn('⚠️ [GPTManager] getAllGPTs called with null/undefined userId');
        return [];
      }

      const stmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
      let rows = stmt.all(userId);

      if ((!rows || rows.length === 0) && originalUserId && originalUserId !== userId) {
        console.log(`🔄 [GPTManager] Trying fallback query with original user ID: ${originalUserId}`);
        const fallbackStmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
        rows = fallbackStmt.all(originalUserId);
      }

      if (!rows || rows.length === 0) {
        console.log(`ℹ️ [GPTManager] No GPTs found for user: ${userId} — returning empty (strict isolation)`);
      }

      console.log(`📊 [GPTManager] Found ${rows?.length || 0} GPTs for user: ${userId}${originalUserId && originalUserId !== userId ? ` (original: ${originalUserId})` : ''}`);

      const gpts = [];
      for (const row of rows) {
        try {
          const files = await this.getGPTFiles(row.id);
          const actions = await this.getGPTActions(row.id);
          gpts.push({
            ...rowToGPTConfig(row),
            files,
            actions,
          });
        } catch (rowError) {
          console.error(`❌ [GPTManager] Error processing GPT row ${row.id}:`, rowError);
          // Continue processing other rows
        }
      }

      return gpts;
    } catch (error) {
      console.error(`❌ [GPTManager] Error in getAllGPTs for user ${userId}:`, error);
      console.error(`❌ [GPTManager] Error stack:`, error.stack);
      throw error; // Re-throw to be handled by route handler
    }
  }

  getGPTConfig(id) {
    const stmt = this.db.prepare('SELECT * FROM gpts WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return rowToGPTConfig(row);
  }

  async updateGPT(id, updates) {
    if (process.env.VVAULT_CANONICAL === 'true') {
      throw new Error('ChattyDB writes are disabled in canonical VVAULT mode');
    }
    const existing = this.getGPTConfig(id);
    if (!existing) return null;

    const nextVersion = this.getNextVersion(id);

    const stmt = this.db.prepare(`
      UPDATE gpts
      SET
        name = ?,
        display_name = ?,
        full_name = ?,
        description = ?,
        instructions = ?,
        conversation_starters = ?,
        avatar = ?,
        capabilities = ?,
        construct_callsign = ?,
        aliases = ?,
        provider = ?,
        tags = ?,
        categories = ?,
        config_json = ?,
        model_id = ?,
        conversation_model = ?,
        creative_model = ?,
        coding_model = ?,
        orchestration_mode = ?,
        memory_enabled = ?,
        memory_profile = ?,
        roleplay_enabled = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `);
    const nextName = updates.name !== undefined ? updates.name : existing.name;
    const nextDisplayName = updates.displayName !== undefined ? updates.displayName : (existing.displayName || nextName);
    const nextFullName = updates.fullName !== undefined ? updates.fullName : (existing.fullName || nextDisplayName || nextName);
    const nextAliases = updates.aliases !== undefined ? normalizeStringArray(updates.aliases) : normalizeStringArray(existing.aliases);
    const nextTags = updates.tags !== undefined ? normalizeStringArray(updates.tags) : normalizeStringArray(existing.tags);
    const nextCategories = updates.categories !== undefined ? normalizeStringArray(updates.categories) : normalizeStringArray(existing.categories);
    const nextCapabilities = normalizeCapabilities(updates.capabilities || existing.capabilities);
    const nextProvider =
      updates.provider !== undefined
        ? updates.provider
        : existing.provider || '';
    const nextConfigJson = buildStoredConfigJson({
      ...existing,
      ...updates,
      name: nextName,
      displayName: nextDisplayName,
      fullName: nextFullName,
      aliases: nextAliases,
      tags: nextTags,
      categories: nextCategories,
      capabilities: nextCapabilities,
      provider: nextProvider,
      configJson:
        updates.configJson !== undefined
          ? updates.configJson
          : existing.configJson,
    });

    stmt.run(
      nextName,
      nextDisplayName,
      nextFullName,
      updates.description !== undefined ? updates.description : existing.description,
      updates.instructions !== undefined ? updates.instructions : existing.instructions,
      JSON.stringify(updates.conversationStarters !== undefined ? updates.conversationStarters : existing.conversationStarters),
      updates.avatar !== undefined ? updates.avatar : existing.avatar,
      JSON.stringify(nextCapabilities),
      updates.constructCallsign !== undefined ? updates.constructCallsign : existing.constructCallsign,
      JSON.stringify(nextAliases),
      nextProvider || '',
      JSON.stringify(nextTags),
      JSON.stringify(nextCategories),
      JSON.stringify(nextConfigJson),
      updates.modelId || existing.modelId,
      updates.conversationModel || existing.conversationModel || existing.modelId,
      updates.creativeModel || existing.creativeModel || existing.modelId,
      updates.codingModel || existing.codingModel || existing.modelId,
      updates.orchestrationMode || existing.orchestrationMode || 'lin',
      updates.memoryEnabled !== undefined ? (updates.memoryEnabled ? 1 : 0) : (existing.memoryEnabled ? 1 : 0),
      updates.memoryProfile !== undefined ? updates.memoryProfile : (existing.memoryProfile || 'off'),
      updates.roleplayEnabled !== undefined ? (updates.roleplayEnabled ? 1 : 0) : (existing.roleplayEnabled ? 1 : 0),
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      new Date().toISOString(),
      id
    );

    const versionSnapshot = { ...existing, ...updates };
    delete versionSnapshot.files;
    delete versionSnapshot.actions;
    this.recordVersion(id, nextVersion, versionSnapshot);

    return this.getGPTConfig(id);
  }

  async deleteGPT(id) {
    if (process.env.VVAULT_CANONICAL === 'true') {
      throw new Error('ChattyDB writes are disabled in canonical VVAULT mode');
    }
    const stmt = this.db.prepare('DELETE FROM gpts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getNextVersion(gptId) {
    const stmt = this.db.prepare('SELECT MAX(version) as maxVersion FROM gpt_versions WHERE gpt_id = ?');
    const row = stmt.get(gptId);
    const maxVersion = row?.maxVersion || 0;
    return maxVersion + 1;
  }

  recordVersion(gptId, version, snapshot) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO gpt_versions (gpt_id, version, snapshot)
        VALUES (?, ?, ?)
      `);
      stmt.run(gptId, version, JSON.stringify(snapshot || {}));
    } catch (error) {
      console.warn(`⚠️ [GPTManager] Failed to record version for ${gptId}:`, error.message);
    }
  }

  // File Management
  async uploadFile(gptId, file) {
    const id = `file-${crypto.randomUUID()}`;
    const filename = `${id}-${file.name}`;
    const now = new Date().toISOString();

    // Parse file using server parser with optimized settings for 300-file scale
    const parsedContent = await ServerFileParser.parseFile(file, {
      maxSize: 10 * 1024 * 1024, // 10MB
      extractText: true,
      storeContent: true,
      enableCompression: true, // Enable compression for large file collections
      optimizeForBatch: true   // Optimize for batch processing
    });

    const stmt = this.db.prepare(`
      INSERT INTO gpt_files (id, gpt_id, filename, original_name, mime_type, size, content, extracted_text, metadata, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const extMimeMap = {
      txt: 'text/plain', md: 'text/markdown', json: 'application/json',
      csv: 'text/csv', rtf: 'text/rtf', html: 'text/html',
      xml: 'text/xml', yaml: 'text/yaml', yml: 'text/yaml', log: 'text/plain',
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff', svg: 'image/svg+xml',
      mp4: 'video/mp4', avi: 'video/x-msvideo', mov: 'video/quicktime',
    };
    const fileExt = (file.name || '').split('.').pop()?.toLowerCase() || '';
    const resolvedMimeType = file.type || extMimeMap[fileExt] || 'application/octet-stream';

    stmt.run(
      id,
      gptId,
      filename,
      file.name,
      resolvedMimeType,
      file.size,
      parsedContent.content,
      parsedContent.extractedText,
      JSON.stringify(parsedContent.metadata),
      now
    );

    return {
      id,
      gptId,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      content: parsedContent.content,
      extractedText: parsedContent.extractedText,
      metadata: parsedContent.metadata,
      uploadedAt: now,
      isActive: true
    };
  }

  async getGPTFiles(gptId) {
    const stmt = this.db.prepare('SELECT * FROM gpt_files WHERE gpt_id = ? AND is_active = 1 ORDER BY uploaded_at DESC');
    const rows = stmt.all(gptId);

    return rows.map(row => ({
      id: row.id,
      gptId: row.gpt_id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      content: row.content,
      extractedText: row.extracted_text || '',
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      uploadedAt: row.uploaded_at,
      isActive: Boolean(row.is_active)
    }));
  }

  getFileGPTId(fileId) {
    const row = this.db.prepare('SELECT gpt_id FROM gpt_files WHERE id = ?').get(fileId);
    return row?.gpt_id || null;
  }

  getActionGPTId(actionId) {
    const row = this.db.prepare('SELECT gpt_id FROM gpt_actions WHERE id = ?').get(actionId);
    return row?.gpt_id || null;
  }

  async deleteFile(fileId) {
    const stmt = this.db.prepare('UPDATE gpt_files SET is_active = 0 WHERE id = ?');
    const result = stmt.run(fileId);
    return result.changes > 0;
  }

  async updateFileGPTId(fileId, newGptId) {
    const stmt = this.db.prepare('UPDATE gpt_files SET gpt_id = ? WHERE id = ?');
    const result = stmt.run(newGptId, fileId);
    return result.changes > 0;
  }

  // Action Management
  async createAction(gptId, action) {
    const id = `action-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO gpt_actions (id, gpt_id, name, description, url, method, headers, parameters, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      gptId,
      action.name,
      action.description,
      action.url,
      action.method,
      JSON.stringify(action.headers || {}),
      JSON.stringify(action.parameters || {}),
      action.isActive ? 1 : 0,
      now
    );

    return {
      id,
      gptId,
      ...action,
      createdAt: now
    };
  }

  async getGPTActions(gptId) {
    const stmt = this.db.prepare('SELECT * FROM gpt_actions WHERE gpt_id = ? AND is_active = 1 ORDER BY created_at DESC');
    const rows = stmt.all(gptId);

    return rows.map(row => ({
      id: row.id,
      gptId: row.gpt_id,
      name: row.name,
      description: row.description,
      url: row.url,
      method: row.method,
      headers: JSON.parse(row.headers || '{}'),
      parameters: JSON.parse(row.parameters || '{}'),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at
    }));
  }

  async deleteAction(actionId) {
    const stmt = this.db.prepare('UPDATE gpt_actions SET is_active = 0 WHERE id = ?');
    const result = stmt.run(actionId);
    return result.changes > 0;
  }

  // Avatar Generation
  generateAvatar(name, _description) {
    const initials = name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
    const color = colors[name.length % colors.length];

    const svg = `
      <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" fill="${color}" rx="32"/>
        <text x="32" y="40" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="20" font-weight="bold">${initials}</text>
      </svg>
    `;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  // Context Management - Optimized for 300+ files
  async getGPTContext(gptId, maxFiles = 50, maxContextLength = 50000) {
    const files = await this.getGPTFiles(gptId);
    const contextParts = [];
    let totalContextLength = 0;

    // Sort files by relevance/importance for smart selection
    const sortedFiles = files
      .filter(file => file.isActive && file.extractedText)
      .sort((a, b) => {
        // Prioritize recent files and larger content
        const aScore = (new Date(a.uploadedAt).getTime() / 1000000) + (a.extractedText?.length || 0);
        const bScore = (new Date(b.uploadedAt).getTime() / 1000000) + (b.extractedText?.length || 0);
        return bScore - aScore;
      })
      .slice(0, maxFiles); // Limit to most relevant files

    for (const file of sortedFiles) {
      if (totalContextLength >= maxContextLength) break;

      try {
        let contextEntry;

        // Special handling for images with OCR-extracted text
        if (file.mimeType.startsWith('image/') && file.extractedText.includes('OCR Text Extraction')) {
          // Extract the actual text content from OCR results
          const ocrTextMatch = file.extractedText.match(/OCR Text Extraction[^:]*:\s*\n\n([\s\S]*?)\n\nThis image contains/);
          const extractedText = ocrTextMatch ? ocrTextMatch[1].trim() : '';

          if (extractedText) {
            // Truncate long OCR text for context efficiency
            const truncatedText = extractedText.length > 1000 ? extractedText.substring(0, 1000) + '...' : extractedText;
            contextEntry = `Image "${file.originalName}" contains: ${truncatedText}`;
          } else {
            contextEntry = `Image "${file.originalName}": No readable text extracted.`;
          }
        } else if (file.mimeType.startsWith('video/') && file.extractedText.includes('Video Analysis Complete')) {
          // Special handling for videos with MOCR and ASR analysis
          const videoAnalysisMatch = file.extractedText.match(/Video Analysis Complete[^:]*:\s*\n([\s\S]*?)\n\nThis video has been analyzed/);
          const analysisContent = videoAnalysisMatch ? videoAnalysisMatch[1].trim() : '';

          if (analysisContent) {
            // Truncate long video analysis for context efficiency
            const truncatedAnalysis = analysisContent.length > 1500 ? analysisContent.substring(0, 1500) + '...' : analysisContent;
            contextEntry = `Video "${file.originalName}": ${truncatedAnalysis}`;
          } else {
            contextEntry = `Video "${file.originalName}": No content extracted.`;
          }
        } else {
          // Regular file processing with optimized summary
          const summary = ServerFileParser.generateSummary({
            name: file.originalName,
            type: file.mimeType,
            size: file.size,
            content: file.content,
            extractedText: file.extractedText,
            metadata: file.metadata
          });

          // Truncate summary for context efficiency
          const truncatedSummary = summary.length > 800 ? summary.substring(0, 800) + '...' : summary;
          contextEntry = `File "${file.originalName}": ${truncatedSummary}`;
        }

        // Check if adding this context would exceed limits
        if (totalContextLength + contextEntry.length > maxContextLength) {
          // Add a summary of remaining files
          const remainingFiles = sortedFiles.length - contextParts.length;
          if (remainingFiles > 0) {
            contextParts.push(`... and ${remainingFiles} more files available for reference.`);
          }
          break;
        }

        contextParts.push(contextEntry);
        totalContextLength += contextEntry.length;
      } catch (error) {
        console.error('Error processing file context:', error);
        contextParts.push(`File "${file.originalName}": Error processing content.`);
      }
    }

    return contextParts.join('\n\n');
  }

  async updateGPTContext(gptId, context) {
    // For now, we'll store context in memory
    // In a full implementation, you might want to store this in the database
    console.log(`Updated context for GPT ${gptId}:`, context.substring(0, 100) + '...');
  }

  // Runtime Management
  async loadGPTForRuntime(gptId) {
    const config = await this.getGPT(gptId);
    if (!config) return null;

    const runtime = {
      config,
      context: '',
      memory: new Map(),
      lastUsed: new Date().toISOString()
    };

    this.runtimeGPTs.set(gptId, runtime);
    return runtime;
  }

  getRuntimeGPT(gptId) {
    return this.runtimeGPTs.get(gptId) || null;
  }

  async executeAction(actionId, parameters = {}) {
    const stmt = this.db.prepare('SELECT * FROM gpt_actions WHERE id = ? AND is_active = 1');
    const action = stmt.get(actionId);

    if (!action) {
      throw new Error('Action not found');
    }

    const headers = JSON.parse(action.headers || '{}');
    const actionParams = { ...JSON.parse(action.parameters || '{}'), ...parameters };

    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: action.method !== 'GET' ? JSON.stringify(actionParams) : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing action:', error);
      throw error;
    }
  }

  /**
   * Migrate existing GPTs to have constructCallsign based on their names
   * This should be called once to backfill missing constructCallsign values
   */
  async migrateExistingGPTs() {
    console.log('🔄 [GPTManager] Starting migration of existing GPTs...');

    const stmt = this.db.prepare('SELECT * FROM gpts WHERE construct_callsign IS NULL OR construct_callsign = ""');
    const rows = stmt.all();

    let migrated = 0;
    let errors = 0;

    for (const row of rows) {
      if (!row.name || !row.name.trim()) {
        console.warn(`⚠️ [GPTManager] Skipping GPT ${row.id} - no name`);
        continue;
      }

      try {
        const constructCallsign = await this.generateConstructCallsign(row.name, row.user_id);

        const updateStmt = this.db.prepare('UPDATE gpts SET construct_callsign = ? WHERE id = ?');
        updateStmt.run(constructCallsign, row.id);

        console.log(`✅ [GPTManager] Migrated GPT ${row.id}: "${row.name}" → ${constructCallsign}`);
        migrated++;
      } catch (error) {
        console.error(`❌ [GPTManager] Failed to migrate GPT ${row.id}: ${error.message}`);
        errors++;
      }
    }

    console.log(`✅ [GPTManager] Migration complete: ${migrated} migrated, ${errors} errors`);
    return { migrated, errors, total: rows.length };
  }

  // Cleanup
  async cleanup() {
    this.db.close();
  }
}
