// AI Manager - Server-side implementation
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { ServerFileParser } from './serverFileParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CRITICAL PATH HELPER: Extract constructName from constructCallsign
 * constructCallsign: "katana-001" -> constructName: "katana"
 * VVAULT path pattern: instances/{constructName}/identity/...
 */
function extractConstructName(constructCallsign) {
  if (!constructCallsign) return 'unknown';
  const match = constructCallsign.match(/^(.+)-(\d+)$/);
  return match ? match[1] : constructCallsign;
}

// Strip legacy legal framework block from instructions
const stripLegalFrameworks = (text = '') => {
  if (!text) return '';
  return text.replace(/=== LEGAL FRAMEWORKS \(HARDCODED - DO NOT REMOVE\) ===[\s\S]*?=== END LEGAL FRAMEWORKS ===/g, '').trim();
};

const sanitizeInstructions = (text = '') => stripLegalFrameworks(text).trim();

export class AIManager {
  static instance = null;
  db = null;
  runtimeAIs = new Map();
  uploadDir = '';

  constructor() {
    // Resolve DB at project root (chatty/chatty.db)
    // __dirname is /server/lib, so go up two levels to project root
    const dbPath = path.join(__dirname, '..', '..', 'chatty.db');
    const absoluteDbPath = path.resolve(dbPath);
    
    // Check if database exists in server/ directory (wrong location)
    const serverDbPath = path.join(__dirname, '..', 'chatty.db');
    fs.access(serverDbPath).then(() => {
      console.warn(`⚠️ [AIManager] Found database at wrong location: ${serverDbPath}. Using correct location: ${absoluteDbPath}`);
    }).catch(() => {
      // Database not in server/ directory, which is correct
    });
    
    this.db = new Database(absoluteDbPath);
    console.log(`✅ [AIManager] Database initialized at: ${absoluteDbPath}`);
    this.uploadDir = path.join(process.cwd(), 'ai-uploads');
    this.initializeDatabase();
    this.ensureUploadDir();
    
    // VVAULT/Chatty Database Separation Guard
    // This class manages Chatty user database ONLY. Construct memories (STM/LTM) MUST be stored in VVAULT.
    // See: chatty/docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md
    console.log(`🔒 [AIManager] VVAULT boundary enforced: Construct memories must go to VVAULT, not Chatty DB`);
  }

  static getInstance() {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  initializeDatabase() {
    // AIs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ais (
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

    // AI Versions table for draft history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ai_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ai_id) REFERENCES ais (id) ON DELETE CASCADE
      )
    `);

    // Ensure construct_callsign column exists for older databases
    const hasConstructCallsign = this.db.prepare(`PRAGMA table_info(ais)`).all().some(col => col.name === 'construct_callsign');
    if (!hasConstructCallsign) {
      this.db.exec(`ALTER TABLE ais ADD COLUMN construct_callsign TEXT`);
    }

    // Ensure per-mode model columns and orchestration_mode exist
    const columns = this.db.prepare(`PRAGMA table_info(ais)`).all();
    const hasConversationModel = columns.some(col => col.name === 'conversation_model');
    const hasCreativeModel = columns.some(col => col.name === 'creative_model');
    const hasCodingModel = columns.some(col => col.name === 'coding_model');
    const hasOrchestrationMode = columns.some(col => col.name === 'orchestration_mode');
    const hasPrivacy = columns.some(col => col.name === 'privacy');

    if (!hasConversationModel) {
      this.db.exec(`ALTER TABLE ais ADD COLUMN conversation_model TEXT`);
    }
    if (!hasCreativeModel) {
      this.db.exec(`ALTER TABLE ais ADD COLUMN creative_model TEXT`);
    }
    if (!hasCodingModel) {
      this.db.exec(`ALTER TABLE ais ADD COLUMN coding_model TEXT`);
    }
    if (!hasOrchestrationMode) {
      this.db.exec(`ALTER TABLE ais ADD COLUMN orchestration_mode TEXT`);
    }
    if (!hasPrivacy) {
      this.db.exec(`ALTER TABLE ais ADD COLUMN privacy TEXT DEFAULT 'private'`);
    }

    // Backfill defaults for existing rows
    this.db.exec(`
      UPDATE ais
      SET 
        conversation_model = COALESCE(conversation_model, model_id),
        creative_model = COALESCE(creative_model, model_id),
        coding_model = COALESCE(coding_model, model_id),
        orchestration_mode = COALESCE(orchestration_mode, 'lin'),
        privacy = COALESCE(privacy, 
          CASE 
            WHEN is_active = 1 THEN 'link'
            ELSE 'private'
          END
        )
    `);

    // Also add privacy column to legacy gpts table for backward compatibility
    try {
      const gptsColumns = this.db.prepare(`PRAGMA table_info(gpts)`).all();
      const gptsHasPrivacy = gptsColumns.some(col => col.name === 'privacy');
      if (!gptsHasPrivacy) {
        this.db.exec(`ALTER TABLE gpts ADD COLUMN privacy TEXT DEFAULT 'private'`);
        // Backfill gpts table
        this.db.exec(`
          UPDATE gpts
          SET privacy = COALESCE(privacy,
            CASE 
              WHEN is_active = 1 THEN 'link'
              ELSE 'private'
            END
          )
        `);
      }
    } catch (error) {
      // gpts table might not exist, that's okay
      console.log(`ℹ️ [AIManager] Could not add privacy to gpts table: ${error.message}`);
    }

    // AI Files table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_files (
        id TEXT PRIMARY KEY,
        ai_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        content TEXT NOT NULL,
        extracted_text TEXT,
        metadata TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (ai_id) REFERENCES ais (id) ON DELETE CASCADE
      )
    `);

    // AI Actions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_actions (
        id TEXT PRIMARY KEY,
        ai_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'GET',
        headers TEXT,
        parameters TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ai_id) REFERENCES ais (id) ON DELETE CASCADE
      )
    `);

    console.log('✅ AI Manager database initialized');
  }

  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
  }

  /**
   * Resolve VVAULT path for user's instance assets directory
   * @param {string} userId - VVAULT user ID (LIFE format)
   * @param {string} constructCallsign - Construct callsign (e.g., "example-construct-001")
   * @returns {Promise<string>} - Absolute path to assets directory
   */
  async resolveVVAULTAssetsPath(userId, constructCallsign) {
    // Import VVAULT_ROOT dynamically to avoid circular dependencies
    let VVAULT_ROOT;
    try {
      const config = await import('../../vvaultConnector/config.js');
      VVAULT_ROOT = config.VVAULT_ROOT || process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
    } catch (error) {
      VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
      console.warn(`⚠️ [AIManager] Could not load VVAULT_ROOT from config, using: ${VVAULT_ROOT}`);
    }

    const shard = 'shard_0000'; // Per user preference for sequential sharding
    const assetsPath = path.join(
      VVAULT_ROOT,
      'users',
      shard,
      userId,
      'instances',
      constructCallsign,
      'assets'
    );

    // Ensure directory exists
    await fs.mkdir(assetsPath, { recursive: true });
    
    return assetsPath;
  }

  /**
   * Resolve VVAULT identity directory path for a construct
   * @param {string} userId - VVAULT user ID (LIFE format)
   * @param {string} constructCallsign - Construct callsign (e.g., "example-construct-001")
   * @returns {Promise<string>} - Full path to identity directory
   */
  async resolveVVAULTIdentityPath(userId, constructCallsign) {
    // Import VVAULT_ROOT dynamically to avoid circular dependencies
    let VVAULT_ROOT;
    try {
      const config = await import('../../vvaultConnector/config.js');
      VVAULT_ROOT = config.VVAULT_ROOT || process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
    } catch (error) {
      VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
      console.warn(`⚠️ [AIManager] Could not load VVAULT_ROOT from config, using: ${VVAULT_ROOT}`);
    }

    const shard = 'shard_0000'; // Per user preference for sequential sharding
    const identityPath = path.join(
      VVAULT_ROOT,
      'users',
      shard,
      userId,
      'instances',
      constructCallsign,
      'identity'
    );

    // Ensure directory exists
    await fs.mkdir(identityPath, { recursive: true });
    
    return identityPath;
  }

  /**
   * Save avatar to VVAULT filesystem
   * @param {string} aiId - AI ID
   * @param {string} constructCallsign - Construct callsign (e.g., "example-construct-001")
   * @param {string} avatarData - Base64 data URL (e.g., "data:image/png;base64,...")
   * @param {string} userId - VVAULT user ID (LIFE format)
   * @returns {Promise<string>} - VVAULT-relative path (e.g., "instances/example-construct-001/identity/avatar.png")
   */
  async saveAvatarToFilesystem(aiId, constructCallsign, avatarData, userId) {
    if (!avatarData || !avatarData.startsWith('data:image/')) {
      throw new Error('Avatar data must be a valid data URL starting with "data:image/"');
    }

    if (!constructCallsign) {
      throw new Error('constructCallsign is required to save avatar');
    }

    if (!userId) {
      throw new Error('userId is required to save avatar');
    }

    try {
      // Parse data URL to extract mime type and base64 data
      const dataUrlMatch = avatarData.match(/^data:image\/([^;]+);base64,(.+)$/);
      if (!dataUrlMatch) {
        throw new Error('Invalid data URL format');
      }

      const mimeType = dataUrlMatch[1];
      const base64Data = dataUrlMatch[2];

      // Convert base64 to buffer
      let buffer = Buffer.from(base64Data, 'base64');

      // Convert non-PNG images to PNG if sharp is available
      // Otherwise, keep as-is (will save as PNG filename but may have format issues)
      if (mimeType !== 'png') {
        try {
          const sharp = require('sharp');
          buffer = await sharp(buffer).png().toBuffer();
          console.log(`🔄 [AIManager] Converted ${mimeType} image to PNG`);
        } catch (sharpError) {
          // Sharp not available or conversion failed - keep original buffer
          // Note: This may cause issues if the file is saved as .png but contains non-PNG data
          console.warn(`⚠️ [AIManager] Could not convert ${mimeType} to PNG (sharp not available), saving as-is`);
        }
      }

      // Always save as avatar.png in identity directory
      const filename = 'avatar.png';

      // Resolve VVAULT identity directory
      const identityDir = await this.resolveVVAULTIdentityPath(userId, constructCallsign);
      const filePath = path.join(identityDir, filename);

      // Write file
      await fs.writeFile(filePath, buffer);

      // Return VVAULT-relative path
      // CRITICAL: Use constructName (without version suffix) for folder path
      const constructName = extractConstructName(constructCallsign);
      const relativePath = `instances/${constructName}/identity/${filename}`;
      
      console.log(`✅ [AIManager] Saved avatar to filesystem: ${filePath} (relative: ${relativePath})`);
      
      return relativePath;
    } catch (error) {
      console.error(`❌ [AIManager] Failed to save avatar to filesystem:`, error);
      throw error;
    }
  }

  /**
   * Generate constructCallsign from AI name with sequential numbering
   * Example: "Example Construct" → "example-construct-001", "Example Construct" (second one) → "example-construct-002"
   * 
   * @param {string} name - AI name (e.g., "Example Construct", "Luna")
   * @param {string} userId - User ID to scope the search
   * @returns {Promise<string>} - Construct callsign (e.g., "example-construct-001")
   */
  async generateConstructCallsign(name, userId) {
    if (!name || !name.trim()) {
      throw new Error('AI name is required to generate constructCallsign');
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

    // Query existing AIs with same normalized name for this user
    const stmt = this.db.prepare(`
      SELECT construct_callsign FROM ais 
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
    
    console.log(`✅ [AIManager] Generated constructCallsign: "${name}" → ${callsign} (user: ${userId})`);
    return callsign;
  }

  // AI CRUD Operations
  async createAI(config) {
    const id = `ai-${crypto.randomUUID()}`;
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

    // Handle avatar: if it's a data URL, save to filesystem
    let avatarPath = config.avatar || null;
    if (avatarPath && avatarPath.startsWith('data:image/')) {
      try {
        // Save avatar to filesystem and get relative path
        avatarPath = await this.saveAvatarToFilesystem(
          id,
          constructCallsign,
          avatarPath,
          config.userId || 'anonymous'
        );
        console.log(`✅ [AIManager] Saved avatar to filesystem during creation: ${avatarPath}`);
      } catch (error) {
        console.error(`❌ [AIManager] Failed to save avatar to filesystem during creation:`, error);
        // Continue with data URL as fallback (backward compatibility)
        console.warn(`⚠️ [AIManager] Using data URL as fallback for avatar`);
      }
    }
    // If avatar is already a path (not data URL), use as-is

    // Handle privacy: default to 'private', map isActive for backward compatibility
    const privacy = config.privacy || (config.isActive ? 'link' : 'private');
    const isActive = privacy !== 'private'; // Map privacy to isActive for backward compatibility

    const stmt = this.db.prepare(`
      INSERT INTO ais (
        id, name, description, instructions, conversation_starters, avatar, capabilities, construct_callsign, 
        model_id, conversation_model, creative_model, coding_model, orchestration_mode, 
        is_active, privacy, created_at, updated_at, user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      config.name,
      config.description,
      sanitizeInstructions(config.instructions),
      JSON.stringify(config.conversationStarters || []),
      avatarPath,
      JSON.stringify(config.capabilities || {}),
      constructCallsign,
      config.modelId,
      config.conversationModel || config.modelId,
      config.creativeModel || config.modelId,
      config.codingModel || config.modelId,
      config.orchestrationMode || 'lin',
      isActive ? 1 : 0,
      privacy,
      now,
      now,
      config.userId || 'anonymous'
    );

    // Record initial version history (version 1)
    this.recordVersion(id, 1, { ...config, constructCallsign, avatar: avatarPath, privacy });

    const cleanInstructions = sanitizeInstructions(config.instructions);

    return {
      id,
      ...config,
      instructions: cleanInstructions,
      avatar: avatarPath,
      privacy,
      isActive,
      files: [],
      actions: [],
      createdAt: now,
      updatedAt: now,
      constructCallsign: constructCallsign,
      conversationModel: config.conversationModel || config.modelId,
      creativeModel: config.creativeModel || config.modelId,
      codingModel: config.codingModel || config.modelId,
      orchestrationMode: config.orchestrationMode || 'lin'
    };
  }

  async getAI(id) {
    // DUAL-TABLE SUPPORT: Check both ais and gpts tables
    let row = null;
    let fromGPTsTable = false;

    // First try ais table
    try {
      const aisStmt = this.db.prepare('SELECT * FROM ais WHERE id = ?');
      row = aisStmt.get(id);
      if (row) {
        console.log(`📊 [AIManager] Found AI ${id} in ais table`);
      }
    } catch (error) {
      console.log(`ℹ️ [AIManager] ais table query failed for ${id}: ${error.message}`);
    }

    // Fallback to gpts table if not found in ais
    if (!row) {
      try {
        const gptsStmt = this.db.prepare('SELECT * FROM gpts WHERE id = ?');
        row = gptsStmt.get(id);
        if (row) {
          fromGPTsTable = true;
          console.log(`📊 [AIManager] Found AI ${id} in gpts table (legacy)`);
        }
      } catch (error) {
        console.log(`ℹ️ [AIManager] gpts table query failed for ${id}: ${error.message}`);
      }
    }

    if (!row) return null;

    // DEBUG: Log avatar information
    const avatarValue = row.avatar;
    const avatarType = avatarValue === null ? 'null' : avatarValue === undefined ? 'undefined' : typeof avatarValue;
    const avatarLength = typeof avatarValue === 'string' ? avatarValue.length : 'N/A';
    const avatarIsEmpty = !avatarValue || (typeof avatarValue === 'string' && avatarValue.trim() === '');
    const avatarPreview = typeof avatarValue === 'string' && avatarValue.length > 0 
      ? avatarValue.substring(0, 50) + (avatarValue.length > 50 ? '...' : '')
      : avatarValue;
    
    console.log(`🖼️ [AIManager] Avatar debug for ${id} (from ${fromGPTsTable ? 'gpts' : 'ais'} table):`, {
      type: avatarType,
      length: avatarLength,
      isEmpty: avatarIsEmpty,
      preview: avatarPreview,
      hasValue: !!avatarValue
    });

    // Use appropriate file/action getters based on which table the row came from
    const files = fromGPTsTable ? await this.getAIFilesFromGPTsTable(id) : await this.getAIFiles(id);
    const actions = fromGPTsTable ? await this.getAIActionsFromGPTsTable(id) : await this.getAIActions(id);

    // Process avatar: if it's a filesystem path (not data URL), return API URL
    let avatarUrl = row.avatar;
    if (avatarUrl && !avatarUrl.startsWith('data:image/') && avatarUrl.startsWith('instances/')) {
      // It's a filesystem path, return API URL
      avatarUrl = `/api/ais/${id}/avatar`;
    }
    // If it's a data URL (legacy) or null, return as-is

    // Get privacy field, default to 'private' if not set, or derive from isActive for backward compatibility
    let privacy = row.privacy;
    if (!privacy) {
      privacy = row.is_active ? 'link' : 'private';
    }

    // Use stored instructions sans legacy legal block
    let instructions = sanitizeInstructions(row.instructions || '');

    // Check VSI protection status (VSIs are independent entities in intelligences/)
    let vsiProtected = false;
    let vsiStatus = false;
    if (row.construct_callsign) {
      try {
        const { checkVSIStatus } = await import('./vsiProtection.js');
        const vsiCheck = await checkVSIStatus(row.user_id, row.construct_callsign);
        vsiProtected = vsiCheck.isVSI;
        vsiStatus = vsiCheck.isVSI;
      } catch (error) {
        console.warn(`⚠️ [AIManager] Failed to check VSI status for ${row.construct_callsign}:`, error.message);
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      instructions: instructions,
      conversationStarters: JSON.parse(row.conversation_starters || '[]'),
      avatar: avatarUrl,
      capabilities: JSON.parse(row.capabilities || '{}'),
      constructCallsign: row.construct_callsign,
      modelId: row.model_id,
      conversationModel: row.conversation_model,
      creativeModel: row.creative_model,
      codingModel: row.coding_model,
      orchestrationMode: row.orchestration_mode || 'lin',
      files,
      actions,
      isActive: Boolean(row.is_active),
      privacy,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      vsiProtected,
      vsiStatus
    };
  }

  /**
   * Get AI by construct callsign
   * @param {string} constructCallsign - Construct callsign (e.g., "example-construct-001")
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} AI config or null if not found
   */
  async getAIByCallsign(constructCallsign, userId) {
    if (!constructCallsign || !userId) {
      return null;
    }

    // DUAL-TABLE SUPPORT: Check both ais and gpts tables
    let row = null;
    let fromGPTsTable = false;

    // First try ais table
    try {
      const aisStmt = this.db.prepare('SELECT * FROM ais WHERE construct_callsign = ? AND user_id = ?');
      row = aisStmt.get(constructCallsign, userId);
      if (row) {
        console.log(`📊 [AIManager] Found AI with callsign ${constructCallsign} in ais table`);
      }
    } catch (error) {
      console.log(`ℹ️ [AIManager] ais table query failed for callsign ${constructCallsign}: ${error.message}`);
    }

    // Fallback to gpts table if not found in ais
    if (!row) {
      try {
        const gptsStmt = this.db.prepare('SELECT * FROM gpts WHERE construct_callsign = ? AND user_id = ?');
        row = gptsStmt.get(constructCallsign, userId);
        if (row) {
          fromGPTsTable = true;
          console.log(`📊 [AIManager] Found AI with callsign ${constructCallsign} in gpts table (legacy)`);
        }
      } catch (error) {
        console.log(`ℹ️ [AIManager] gpts table query failed for callsign ${constructCallsign}: ${error.message}`);
      }
    }

    if (!row) {
      return null;
    }

    // Use appropriate file/action getters based on which table the row came from
    const files = fromGPTsTable ? await this.getAIFilesFromGPTsTable(row.id) : await this.getAIFiles(row.id);
    const actions = fromGPTsTable ? await this.getAIActionsFromGPTsTable(row.id) : await this.getAIActions(row.id);

    // Process avatar: if it's a filesystem path (not data URL), return API URL
    let avatarUrl = row.avatar;
    if (avatarUrl && !avatarUrl.startsWith('data:image/') && avatarUrl.startsWith('instances/')) {
      // It's a filesystem path, return API URL
      avatarUrl = `/api/ais/${row.id}/avatar`;
    }

    // Get privacy field, default to 'private' if not set
    let privacy = row.privacy;
    if (!privacy) {
      privacy = row.is_active ? 'link' : 'private';
    }

    // Use stored instructions sans legacy legal block
    let instructions = sanitizeInstructions(row.instructions || '');

    // Check VSI protection status (VSIs are independent entities in intelligences/)
    let vsiProtected = false;
    let vsiStatus = false;
    if (row.construct_callsign) {
      try {
        const { checkVSIStatus } = await import('./vsiProtection.js');
        const vsiCheck = await checkVSIStatus(row.user_id, row.construct_callsign);
        vsiProtected = vsiCheck.isVSI;
        vsiStatus = vsiCheck.isVSI;
      } catch (error) {
        console.warn(`⚠️ [AIManager] Failed to check VSI status for ${row.construct_callsign}:`, error.message);
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      instructions: instructions,
      conversationStarters: JSON.parse(row.conversation_starters || '[]'),
      avatar: avatarUrl,
      capabilities: JSON.parse(row.capabilities || '{}'),
      constructCallsign: row.construct_callsign,
      modelId: row.model_id,
      conversationModel: row.conversation_model,
      creativeModel: row.creative_model,
      codingModel: row.coding_model,
      orchestrationMode: row.orchestration_mode || 'lin',
      files,
      actions,
      isActive: Boolean(row.is_active),
      privacy,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      vsiProtected,
      vsiStatus
    };
  }

  async getAllAIs(userId, originalUserId = null) {
    try {
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      if (!userId) {
        console.warn('⚠️ [AIManager] getAllAIs called with null/undefined userId');
        return [];
      }

      // DUAL-TABLE SUPPORT: Check both ais and gpts tables
      let rows = [];
      let fromAIsTable = false;
      let fromGPTsTable = false;

      // First, try the new ais table
      try {
        const aisStmt = this.db.prepare('SELECT * FROM ais WHERE user_id = ? ORDER BY updated_at DESC');
        const aisRows = aisStmt.all(userId);
        if (aisRows && aisRows.length > 0) {
          rows = aisRows;
          fromAIsTable = true;
          console.log(`📊 [AIManager] Found ${aisRows.length} AIs from ais table for user: ${userId}`);
          console.log(`📊 [AIManager] AI names from ais table:`, aisRows.map(r => ({ id: r.id, name: r.name, constructCallsign: r.construct_callsign })));
        } else {
          console.log(`ℹ️ [AIManager] No AIs found in ais table for user: ${userId}`);
        }
      } catch (error) {
        // Table might not exist yet, that's okay
        console.log(`ℹ️ [AIManager] ais table query failed (may not exist): ${error.message}`);
      }

      // Fallback to old gpts table if ais table had no results
      if (rows.length === 0) {
        try {
          const gptsStmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
          const gptsRows = gptsStmt.all(userId);
          if (gptsRows && gptsRows.length > 0) {
            rows = gptsRows;
            fromGPTsTable = true;
            console.log(`📊 [AIManager] Found ${gptsRows.length} GPTs from gpts table (fallback) for user: ${userId}`);
            console.log(`📊 [AIManager] GPT names from gpts table:`, gptsRows.map(r => ({ id: r.id, name: r.name })));
          } else {
            console.log(`ℹ️ [AIManager] No GPTs found in gpts table for user: ${userId}`);
          }
        } catch (error) {
          console.log(`ℹ️ [AIManager] gpts table query failed: ${error.message}`);
        }
      }
      
      // If still no results and we have an originalUserId, try querying with that too
      if (rows.length === 0 && originalUserId && originalUserId !== userId) {
        console.log(`🔄 [AIManager] Trying fallback query with originalUserId: ${originalUserId}`);
        try {
          const fallbackAisStmt = this.db.prepare('SELECT * FROM ais WHERE user_id = ? ORDER BY updated_at DESC');
          const fallbackAisRows = fallbackAisStmt.all(originalUserId);
          if (fallbackAisRows && fallbackAisRows.length > 0) {
            rows = fallbackAisRows;
            fromAIsTable = true;
            console.log(`📊 [AIManager] Found ${fallbackAisRows.length} AIs using originalUserId from ais table`);
            console.log(`📊 [AIManager] AI names:`, fallbackAisRows.map(r => ({ id: r.id, name: r.name, constructCallsign: r.construct_callsign })));
          }
        } catch (error) {
          console.log(`ℹ️ [AIManager] Fallback ais query failed: ${error.message}`);
        }
        
        if (rows.length === 0) {
          try {
            const fallbackGptsStmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
            const fallbackGptsRows = fallbackGptsStmt.all(originalUserId);
            if (fallbackGptsRows && fallbackGptsRows.length > 0) {
              rows = fallbackGptsRows;
              fromGPTsTable = true;
              console.log(`📊 [AIManager] Found ${fallbackGptsRows.length} GPTs using originalUserId from gpts table`);
              console.log(`📊 [AIManager] GPT names:`, fallbackGptsRows.map(r => ({ id: r.id, name: r.name })));
            }
          } catch (error) {
            console.log(`ℹ️ [AIManager] Fallback gpts query failed: ${error.message}`);
          }
        }
      }

      // Fallback: if none found and we have an original user ID (email/ObjectId), try that too
      if (rows.length === 0 && originalUserId && originalUserId !== userId) {
        console.log(`🔄 [AIManager] Trying fallback query with original user ID: ${originalUserId}`);
        
        // Try ais table first
        try {
          const fallbackAisStmt = this.db.prepare('SELECT * FROM ais WHERE user_id = ? ORDER BY updated_at DESC');
          const fallbackAisRows = fallbackAisStmt.all(originalUserId);
          if (fallbackAisRows && fallbackAisRows.length > 0) {
            rows = fallbackAisRows;
            fromAIsTable = true;
            console.log(`📊 [AIManager] Found ${fallbackAisRows.length} AIs from ais table with original user ID`);
          }
        } catch (error) {
          // Continue to gpts fallback
        }

        // If still no results, try gpts table
        if (rows.length === 0) {
          try {
            const fallbackGptsStmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
            const fallbackGptsRows = fallbackGptsStmt.all(originalUserId);
            if (fallbackGptsRows && fallbackGptsRows.length > 0) {
              rows = fallbackGptsRows;
              fromGPTsTable = true;
              console.log(`📊 [AIManager] Found ${fallbackGptsRows.length} GPTs from gpts table with original user ID`);
            }
          } catch (error) {
            // Continue to email lookup
          }
        }
      }

      // Last resort: if still none found, try email-based lookup (for backward compatibility)
      if (rows.length === 0 && originalUserId && originalUserId.includes('@')) {
        console.log(`🔄 [AIManager] Trying email-based lookup: ${originalUserId}`);
        
        // Try ais table first
        try {
          const emailAisStmt = this.db.prepare('SELECT * FROM ais WHERE user_id LIKE ? ORDER BY updated_at DESC');
          const emailAisRows = emailAisStmt.all(`%${originalUserId}%`);
          if (emailAisRows && emailAisRows.length > 0) {
            rows = emailAisRows;
            fromAIsTable = true;
            console.log(`📊 [AIManager] Found ${emailAisRows.length} AIs from ais table with email lookup`);
          }
        } catch (error) {
          // Continue to gpts lookup
        }

        // If still no results, try gpts table
        if (rows.length === 0) {
          try {
            const emailGptsStmt = this.db.prepare('SELECT * FROM gpts WHERE user_id LIKE ? ORDER BY updated_at DESC');
            const emailGptsRows = emailGptsStmt.all(`%${originalUserId}%`);
            if (emailGptsRows && emailGptsRows.length > 0) {
              rows = emailGptsRows;
              fromGPTsTable = true;
              console.log(`📊 [AIManager] Found ${emailGptsRows.length} GPTs from gpts table with email lookup`);
            }
          } catch (error) {
            // No more fallbacks
          }
        }
      }

      console.log(`📊 [AIManager] Total found: ${rows?.length || 0} AIs for user: ${userId}${originalUserId && originalUserId !== userId ? ` (original: ${originalUserId})` : ''}${fromAIsTable ? ' [from ais table]' : ''}${fromGPTsTable ? ' [from gpts table - legacy]' : ''}`);

      const ais = [];
      for (const row of rows) {
        try {
          // Use appropriate file/action getters based on which table the row came from
          const files = fromGPTsTable ? await this.getAIFilesFromGPTsTable(row.id) : await this.getAIFiles(row.id);
          const actions = fromGPTsTable ? await this.getAIActionsFromGPTsTable(row.id) : await this.getAIActions(row.id);

          // Parse JSON fields with error handling
          let conversationStarters = [];
          let capabilities = {};
          
          try {
            conversationStarters = JSON.parse(row.conversation_starters || '[]');
          } catch (e) {
            console.warn(`⚠️ [AIManager] Invalid conversation_starters JSON for ${row.id}, using empty array`);
            conversationStarters = [];
          }
          
          try {
            capabilities = JSON.parse(row.capabilities || '{}');
          } catch (e) {
            console.warn(`⚠️ [AIManager] Invalid capabilities JSON for ${row.id}, using empty object`);
            // Try to fix common issues (unquoted keys in object literals)
            try {
              const fixed = (row.capabilities || '{}').replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
              capabilities = JSON.parse(fixed);
              console.log(`✅ [AIManager] Fixed capabilities JSON for ${row.id}`);
            } catch (e2) {
              capabilities = {};
            }
          }

          // DEBUG: Log avatar information for each AI
          const avatarValue = row.avatar;
          const avatarType = avatarValue === null ? 'null' : avatarValue === undefined ? 'undefined' : typeof avatarValue;
          const avatarLength = typeof avatarValue === 'string' ? avatarValue.length : 'N/A';
          const avatarIsEmpty = !avatarValue || (typeof avatarValue === 'string' && avatarValue.trim() === '');
          const avatarPreview = typeof avatarValue === 'string' && avatarValue.length > 0 
            ? avatarValue.substring(0, 50) + (avatarValue.length > 50 ? '...' : '')
            : avatarValue;
          
          console.log(`🖼️ [AIManager] Avatar debug for ${row.id} (from ${fromGPTsTable ? 'gpts' : 'ais'} table):`, {
            type: avatarType,
            length: avatarLength,
            isEmpty: avatarIsEmpty,
            preview: avatarPreview,
            hasValue: !!avatarValue
          });

          // Process avatar: if it's a filesystem path (not data URL), return API URL
          let avatarUrl = row.avatar;
          if (avatarUrl && !avatarUrl.startsWith('data:image/') && avatarUrl.startsWith('instances/')) {
            // It's a filesystem path, return API URL
            avatarUrl = `/api/ais/${row.id}/avatar`;
          }
          // If it's a data URL (legacy) or null, return as-is

          // Get privacy field, default to 'private' if not set, or derive from isActive for backward compatibility
          let privacy = row.privacy;
          if (!privacy) {
            privacy = row.is_active ? 'link' : 'private';
          }

          // Use stored instructions sans legacy legal block
          let instructions = sanitizeInstructions(row.instructions || '');

          // Check VSI protection status
          let vsiProtected = false;
          let vsiStatus = false;
          if (row.construct_callsign && row.user_id) {
            try {
              const { checkVSIStatus } = await import('./vsiProtection.js');
              const vsiCheck = await checkVSIStatus(row.user_id, row.construct_callsign);
              vsiProtected = vsiCheck.isVSI;
              vsiStatus = vsiCheck.isVSI;
            } catch (error) {
              console.warn(`⚠️ [AIManager] Failed to check VSI status for ${row.construct_callsign}:`, error.message);
            }
          }

          ais.push({
            id: row.id,
            name: row.name,
            description: row.description,
            instructions: instructions,
            conversationStarters,
            avatar: avatarUrl, // Processed avatar URL
            capabilities,
            constructCallsign: row.construct_callsign || null,
            modelId: row.model_id,
            // Handle missing columns in old gpts table - provide defaults
            conversationModel: row.conversation_model || row.model_id || null,
            creativeModel: row.creative_model || row.model_id || null,
            codingModel: row.coding_model || row.model_id || null,
            orchestrationMode: row.orchestration_mode || 'lin',
            files,
            actions,
            isActive: Boolean(row.is_active),
            privacy,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userId: row.user_id,
            vsiProtected,
            vsiStatus
          });
        } catch (rowError) {
          console.error(`❌ [AIManager] Error processing AI row ${row.id}:`, rowError);
          // Continue processing other rows
        }
      }

      return ais;
    } catch (error) {
      console.error(`❌ [AIManager] Error in getAllAIs for user ${userId}:`, error);
      console.error(`❌ [AIManager] Error stack:`, error.stack);
      throw error; // Re-throw to be handled by route handler
    }
  }

  // Get all AIs with privacy='store' (for SimForge/public store)
  async getStoreAIs() {try {
      if (!this.db) {throw new Error('Database not initialized');
      }

      // Query both ais and gpts tables for AIs with privacy='store'
      const aisStmt = this.db.prepare(`
        SELECT * FROM ais 
        WHERE privacy = 'store' 
        ORDER BY updated_at DESC
      `);
      const aisRows = aisStmt.all();
      
      // Debug: Also check total count and privacy distribution
      const totalAIs = this.db.prepare('SELECT COUNT(*) as count FROM ais').get();
      const privacyDist = this.db.prepare('SELECT privacy, COUNT(*) as count FROM ais GROUP BY privacy').all();
      
      const gptsStmt = this.db.prepare(`
        SELECT * FROM gpts 
        WHERE privacy = 'store' 
        ORDER BY updated_at DESC
      `);
      let gptsRows = [];
      try {
        gptsRows = gptsStmt.all();
      } catch (error) {
        // gpts table might not exist or might not have privacy column yet
        console.log(`ℹ️ [AIManager] Could not query gpts table for store AIs: ${error.message}`);
      }

      // Combine results
      const allRows = [...aisRows, ...gptsRows];
      const storeAIs = [];
      for (const row of allRows) {
        try {
          // Determine which table this row came from
          const fromGPTsTable = gptsRows.some(gptRow => gptRow.id === row.id);
          const files = fromGPTsTable ? await this.getAIFilesFromGPTsTable(row.id) : await this.getAIFiles(row.id);
          const actions = fromGPTsTable ? await this.getAIActionsFromGPTsTable(row.id) : await this.getAIActions(row.id);

          // Parse JSON fields
          let conversationStarters = [];
          let capabilities = {};
          
          try {
            conversationStarters = JSON.parse(row.conversation_starters || '[]');
          } catch (e) {
            conversationStarters = [];
          }
          
          try {
            capabilities = JSON.parse(row.capabilities || '{}');
          } catch (e) {
            capabilities = {};
          }

          // Process avatar
          let avatarUrl = row.avatar;
          if (avatarUrl && !avatarUrl.startsWith('data:image/') && avatarUrl.startsWith('instances/')) {
            avatarUrl = `/api/ais/${row.id}/avatar`;
          }

          // Get privacy field
          let privacy = row.privacy || 'store';

          // Use stored instructions sans legacy legal block
          let instructions = sanitizeInstructions(row.instructions || '');

          // Check VSI protection status
          let vsiProtected = false;
          let vsiStatus = false;
          if (row.construct_callsign && row.user_id) {
            try {
              const { checkVSIStatus } = await import('./vsiProtection.js');
              const vsiCheck = await checkVSIStatus(row.user_id, row.construct_callsign);
              vsiProtected = vsiCheck.isVSI;
              vsiStatus = vsiCheck.isVSI;
            } catch (error) {
              console.warn(`⚠️ [AIManager] Failed to check VSI status for ${row.construct_callsign}:`, error.message);
            }
          }

          storeAIs.push({
            id: row.id,
            name: row.name,
            description: row.description,
            instructions: instructions,
            conversationStarters,
            avatar: avatarUrl,
            capabilities,
            constructCallsign: row.construct_callsign || null,
            modelId: row.model_id,
            conversationModel: row.conversation_model || row.model_id || null,
            creativeModel: row.creative_model || row.model_id || null,
            codingModel: row.coding_model || row.model_id || null,
            orchestrationMode: row.orchestration_mode || 'lin',
            files,
            actions,
            isActive: Boolean(row.is_active),
            privacy,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userId: row.user_id,
            vsiProtected,
            vsiStatus
          });
        } catch (error) {
          console.error(`❌ [AIManager] Error processing store AI ${row.id}:`, error);
        }
      }
      
      console.log(`📊 [AIManager] Found ${storeAIs.length} store AIs`);
      return storeAIs;
    } catch (error) {
      console.error('❌ [AIManager] Error fetching store AIs:', error);
      throw error;
    }
  }

  async updateAI(id, updates) {
    const existing = await this.getAI(id);
    if (!existing) return null;

    // Check which table the AI is in (ais or gpts)
    let isInGPTsTable = false;
    let rawExistingAvatar = null;
    try {
      const aisStmt = this.db.prepare('SELECT avatar FROM ais WHERE id = ?');
      const aisRow = aisStmt.get(id);
      if (aisRow) {
        rawExistingAvatar = aisRow.avatar;
        isInGPTsTable = false;
      } else {
        // Try gpts table
        const gptsStmt = this.db.prepare('SELECT avatar FROM gpts WHERE id = ?');
        const gptsRow = gptsStmt.get(id);
        if (gptsRow) {
          rawExistingAvatar = gptsRow.avatar;
          isInGPTsTable = true;
          console.log(`📊 [AIManager] Updating legacy GPT from gpts table: ${id}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ [AIManager] Could not get raw avatar from database: ${error.message}`);
    }

    const nextVersion = isInGPTsTable ? 1 : this.getNextVersion(id); // Skip version tracking for legacy GPTs

    // Handle avatar update: if it's a new data URL, save to filesystem
    // If avatar is undefined in updates, preserve existing avatar
    let avatarPath = rawExistingAvatar; // Default to existing avatar
    if (updates.avatar !== undefined) {
      if (updates.avatar === null || updates.avatar === '') {
        // Explicitly set to null/empty
        avatarPath = null;
      } else if (updates.avatar.startsWith('data:image/')) {
        // New data URL - save to filesystem
        try {
          // Get constructCallsign and userId from existing AI
          const constructCallsign = updates.constructCallsign || existing.constructCallsign;
          const userId = existing.userId || 'anonymous';

          if (constructCallsign && userId) {
            // Delete old avatar file if it exists and is a filesystem path
            if (rawExistingAvatar && !rawExistingAvatar.startsWith('data:image/') && rawExistingAvatar.startsWith('instances/')) {
              try {
                let VVAULT_ROOT;
                try {
                  const config = await import('../../vvaultConnector/config.js');
                  VVAULT_ROOT = config.VVAULT_ROOT || process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
                } catch {
                  VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
                }

                const shard = 'shard_0000';
                const oldAvatarPath = path.join(VVAULT_ROOT, 'users', shard, userId, rawExistingAvatar);
                await fs.unlink(oldAvatarPath).catch(() => {
                  // Ignore errors if file doesn't exist
                });
                console.log(`🗑️ [AIManager] Deleted old avatar file: ${oldAvatarPath}`);
              } catch (error) {
                console.warn(`⚠️ [AIManager] Failed to delete old avatar file:`, error);
              }
            }

            // Save new avatar to filesystem
            avatarPath = await this.saveAvatarToFilesystem(id, constructCallsign, updates.avatar, userId);
            console.log(`✅ [AIManager] Saved new avatar to filesystem during update: ${avatarPath}`);
          } else {
            console.warn(`⚠️ [AIManager] Cannot save avatar: missing constructCallsign or userId`);
            // Continue with data URL as fallback
            avatarPath = updates.avatar;
          }
        } catch (error) {
          console.error(`❌ [AIManager] Failed to save avatar to filesystem during update:`, error);
          // Continue with data URL as fallback (backward compatibility)
          console.warn(`⚠️ [AIManager] Using data URL as fallback for avatar`);
          avatarPath = updates.avatar;
        }
      } else {
        // Avatar is already a path or API URL - use as-is (shouldn't happen, but handle it)
        avatarPath = updates.avatar;
      }
    }
    // If avatar was undefined in updates, avatarPath remains as rawExistingAvatar (preserved)

    // Handle privacy: if provided, use it; otherwise preserve existing; map to isActive
    let privacy = updates.privacy !== undefined ? updates.privacy : (existing.privacy || (existing.isActive ? 'link' : 'private'));
    const isActive = privacy !== 'private'; // Map privacy to isActive for backward compatibility

    // Sanitize instructions once for both branches
    const nextInstructions = sanitizeInstructions(updates.instructions || existing.instructions || '');

    // Update the correct table (ais or gpts)
    if (isInGPTsTable) {
      // Update legacy gpts table
      const stmt = this.db.prepare(`
        UPDATE gpts 
        SET 
          name = ?, 
          description = ?, 
          instructions = ?, 
          conversation_starters = ?, 
          avatar = ?, 
          capabilities = ?, 
          construct_callsign = ?, 
          model_id = ?, 
          conversation_model = COALESCE(?, model_id), 
          creative_model = COALESCE(?, model_id), 
          coding_model = COALESCE(?, model_id), 
          orchestration_mode = COALESCE(?, 'lin'), 
          is_active = ?, 
          privacy = COALESCE(?, 
            CASE 
              WHEN is_active = 1 THEN 'link'
              ELSE 'private'
            END
          ),
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        updates.name || existing.name,
        updates.description || existing.description,
        nextInstructions,
        JSON.stringify(updates.conversationStarters || existing.conversationStarters),
        avatarPath,
        JSON.stringify(updates.capabilities || existing.capabilities),
        updates.constructCallsign !== undefined ? updates.constructCallsign : existing.constructCallsign,
        updates.modelId || existing.modelId,
        updates.conversationModel || existing.conversationModel || existing.modelId,
        updates.creativeModel || existing.creativeModel || existing.modelId,
        updates.codingModel || existing.codingModel || existing.modelId,
        updates.orchestrationMode || existing.orchestrationMode || 'lin',
        isActive ? 1 : 0,
        privacy,
        new Date().toISOString(),
        id
      );
      console.log(`✅ [AIManager] Updated legacy GPT in gpts table: ${id}`);
    } else {
      // Update ais table
      const stmt = this.db.prepare(`
        UPDATE ais 
        SET 
          name = ?, 
          description = ?, 
          instructions = ?, 
          conversation_starters = ?, 
          avatar = ?, 
          capabilities = ?, 
          construct_callsign = ?, 
          model_id = ?, 
          conversation_model = ?, 
          creative_model = ?, 
          coding_model = ?, 
          orchestration_mode = ?, 
          is_active = ?, 
          privacy = ?,
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        updates.name || existing.name,
        updates.description || existing.description,
        nextInstructions,
        JSON.stringify(updates.conversationStarters || existing.conversationStarters),
        avatarPath,
        JSON.stringify(updates.capabilities || existing.capabilities),
        updates.constructCallsign !== undefined ? updates.constructCallsign : existing.constructCallsign,
        updates.modelId || existing.modelId,
        updates.conversationModel || existing.conversationModel || existing.modelId,
        updates.creativeModel || existing.creativeModel || existing.modelId,
        updates.codingModel || existing.codingModel || existing.modelId,
        updates.orchestrationMode || existing.orchestrationMode || 'lin',
        isActive ? 1 : 0,
        privacy,
        new Date().toISOString(),
        id
      );

      // Record version snapshot (only for ais table, not legacy gpts)
      this.recordVersion(id, nextVersion, { ...existing, ...updates, avatar: avatarPath, privacy });
    }

    // Auto-generate personality blueprint if instructions changed
    const instructionsChanged = updates.instructions !== undefined && 
                                updates.instructions !== existing.instructions;
    if (instructionsChanged && nextInstructions) {
      try {
        const updatedAI = { ...existing, ...updates, constructCallsign: updates.constructCallsign || existing.constructCallsign };
        await this.autoGenerateBlueprint(id, nextInstructions, updatedAI);
      } catch (error) {
        // Don't fail the update if blueprint generation fails
        console.warn(`⚠️ [AIManager] Failed to auto-generate blueprint for ${id}:`, error.message);
      }
    }

    return await this.getAI(id);
  }

  /**
   * Auto-generate personality blueprint from instructions when they change
   */
  async autoGenerateBlueprint(aiId, instructions, aiData) {
    try {
      // Only generate for AIs with construct callsigns
      const constructCallsign = aiData.constructCallsign;
      if (!constructCallsign) {
        return; // Skip if no construct callsign
      }

      const userId = aiData.userId;
      if (!userId) {
        console.warn(`⚠️ [AIManager] Cannot generate blueprint: missing userId for ${aiId}`);
        return;
      }

      // Extract construct ID and callsign
      // Pattern: "gpt-example-construct-001" -> constructId: "gpt", callsign: "example-construct-001"
      // OR: "example-construct-001" -> constructId: "gpt", callsign: "example-construct-001"
      let constructId = 'gpt';
      let callsign = constructCallsign;

      // If constructCallsign starts with "gpt-", extract the rest as callsign
      if (constructCallsign.startsWith('gpt-')) {
        callsign = constructCallsign.substring(4);
      } else if (constructCallsign.includes('-')) {
        // If it's like "example-construct-001", use as-is
        callsign = constructCallsign;
      }

      // Resolve VVAULT user ID
      let vvaultUserId = userId;
      try {
        const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
        const resolved = await resolveVVAULTUserId(userId);
        if (resolved) {
          vvaultUserId = resolved;
        }
      } catch (error) {
        console.warn(`⚠️ [AIManager] Could not resolve VVAULT user ID, using as-is: ${error.message}`);
      }

      // Generate blueprint from instructions
      const blueprint = this.generateBlueprintFromInstructions(
        constructId,
        callsign,
        instructions,
        aiData.name || 'Unknown'
      );

      // Save to VVAULT using IdentityMatcher
      const { IdentityMatcher } = await import('../../src/engine/character/IdentityMatcher.js');
      const identityMatcher = new IdentityMatcher();
      await identityMatcher.persistPersonalityBlueprint(
        vvaultUserId,
        constructId,
        callsign,
        blueprint
      );

      console.log(`✅ [AIManager] Auto-generated blueprint for ${aiId} (${constructId}-${callsign})`);
    } catch (error) {
      console.error(`❌ [AIManager] Failed to auto-generate blueprint:`, error);
      throw error;
    }
  }

  /**
   * Generate a personality blueprint from instructions text
   */
  generateBlueprintFromInstructions(constructId, callsign, instructions, name) {
    // Extract core traits from instructions
    const coreTraits = [];
    const instructionsLower = instructions.toLowerCase();
    
    if (instructionsLower.includes('surgical') || instructionsLower.includes('precision')) {
      coreTraits.push('surgical');
    }
    if (instructionsLower.includes('direct') || instructionsLower.includes('blunt')) {
      coreTraits.push('direct');
    }
    if (instructionsLower.includes('weaponized') || instructionsLower.includes('ruthless')) {
      coreTraits.push('weaponized');
    }
    if (instructionsLower.includes('no performance') || instructionsLower.includes('not performing')) {
      coreTraits.push('no-performance');
    }
    if (coreTraits.length === 0) {
      coreTraits.push('custom');
    }

    // Extract speech patterns (look for quoted examples)
    const speechPatterns = [];
    const patternMatches = instructions.match(/"([^"]+)"/g);
    if (patternMatches) {
      patternMatches.forEach(match => {
        const pattern = match.replace(/"/g, '');
        if (pattern.length > 5 && pattern.length < 100) {
          speechPatterns.push({
            pattern,
            type: 'vocabulary',
            frequency: 10,
            examples: [pattern],
            pairIndices: []
          });
        }
      });
    }

    // Extract consistency rules from instructions
    const consistencyRules = [];
    const ruleLines = instructions.split('\n').filter(line => 
      line.trim().startsWith('-') || 
      line.trim().match(/^(Core rules?:|Rules?:|Constraints?:)/i)
    );
    
    ruleLines.forEach(line => {
      const cleanLine = line.replace(/^[-•]\s*/, '').trim();
      if (cleanLine.length > 10) {
        let ruleType = 'behavior';
        if (cleanLine.toLowerCase().includes('speech') || cleanLine.toLowerCase().includes('language')) {
          ruleType = 'speech';
        }
        consistencyRules.push({
          rule: cleanLine,
          type: ruleType,
          source: 'instructions',
          confidence: 0.9,
          examples: []
        });
      }
    });

    // Build complete blueprint
    return {
      constructId,
      callsign,
      coreTraits: coreTraits.length > 0 ? coreTraits : ['custom'],
      speechPatterns,
      behavioralMarkers: [],
      worldview: [],
      emotionalRange: {
        min: { primary: 'neutral', intensity: 0.5, evidence: [] },
        max: { primary: 'intense', intensity: 0.8, evidence: [] },
        common: [{ primary: 'neutral', intensity: 0.6, evidence: [] }],
        rare: []
      },
      relationshipPatterns: [],
      memoryAnchors: [],
      personalIdentifiers: [],
      consistencyRules,
      metadata: {
        sourceTranscripts: [],
        extractionTimestamp: new Date().toISOString(),
        confidence: 0.8,
        mergedWithExisting: false
      }
    };
  }

  async deleteAI(id) {
    // DUAL-TABLE SUPPORT: Try both tables
    let result = { changes: 0 };
    
    // Try ais table first
    try {
      const aisStmt = this.db.prepare('DELETE FROM ais WHERE id = ?');
      result = aisStmt.run(id);
      if (result.changes > 0) {
        console.log(`✅ [AIManager] Deleted AI ${id} from ais table`);
        return true;
      }
    } catch (error) {
      console.log(`ℹ️ [AIManager] Delete from ais table failed for ${id}: ${error.message}`);
    }

    // Fallback to gpts table
    try {
      const gptsStmt = this.db.prepare('DELETE FROM gpts WHERE id = ?');
      result = gptsStmt.run(id);
      if (result.changes > 0) {
        console.log(`✅ [AIManager] Deleted AI ${id} from gpts table (legacy)`);
        return true;
      }
    } catch (error) {
      console.log(`ℹ️ [AIManager] Delete from gpts table failed for ${id}: ${error.message}`);
    }

    return result.changes > 0;
  }

  /**
   * Clone an existing AI with auto-incremented callsign
   * Copies all config, files, and actions to a new AI instance
   * 
   * @param {string} aiId - ID of AI to clone
   * @param {string} userId - User ID for the new AI
   * @returns {Promise<object>} - Cloned AI object
   */
  async cloneAI(aiId, userId) {
    // Get the original AI
    const originalAI = await this.getAI(aiId);
    if (!originalAI) {
      throw new Error(`AI with id ${aiId} not found`);
    }

    // Generate new callsign based on the original name
    let newCallsign;
    try {
      newCallsign = await this.generateConstructCallsign(originalAI.name, userId);
      console.log(`✅ [AIManager] Generated new callsign for clone: ${originalAI.name} → ${newCallsign}`);
    } catch (error) {
      console.warn(`⚠️ [AIManager] Failed to generate callsign for clone: ${error.message}`);
      throw new Error(`Failed to generate callsign for clone: ${error.message}`);
    }

    // Create new AI config (copy all fields except id, timestamps, and constructCallsign)
    const clonedConfig = {
      name: originalAI.name, // Keep same name - callsign will differentiate
      description: originalAI.description,
      instructions: originalAI.instructions,
      conversationStarters: originalAI.conversationStarters || [],
      avatar: originalAI.avatar, // Copy avatar
      capabilities: originalAI.capabilities || {},
      constructCallsign: newCallsign, // New callsign
      modelId: originalAI.modelId,
      conversationModel: originalAI.conversationModel,
      creativeModel: originalAI.creativeModel,
      codingModel: originalAI.codingModel,
      orchestrationMode: originalAI.orchestrationMode || 'lin',
      isActive: false, // New clone starts inactive
      userId: userId
    };

    // Create the cloned AI
    const clonedAI = await this.createAI(clonedConfig);

    // Copy files
    if (originalAI.files && originalAI.files.length > 0) {
      console.log(`📋 [AIManager] Copying ${originalAI.files.length} files to cloned AI ${clonedAI.id}`);
      for (const file of originalAI.files) {
        try {
          // Copy file record to new AI
          const fileId = `file-${crypto.randomUUID()}`;
          const now = new Date().toISOString();
          
          const fileStmt = this.db.prepare(`
            INSERT INTO ai_files (id, ai_id, filename, original_name, mime_type, size, content, extracted_text, metadata, uploaded_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          fileStmt.run(
            fileId,
            clonedAI.id,
            file.filename || file.originalName || 'unnamed-file',
            file.originalName || file.filename || 'unnamed-file',
            file.mimeType || 'application/octet-stream',
            file.size || 0,
            file.content || null,
            file.extractedText || null,
            JSON.stringify(file.metadata || {}),
            now,
            file.isActive !== false ? 1 : 0
          );
        } catch (error) {
          console.warn(`⚠️ [AIManager] Failed to copy file ${file.id}: ${error.message}`);
          // Continue copying other files
        }
      }
    }

    // Copy actions
    if (originalAI.actions && originalAI.actions.length > 0) {
      console.log(`⚡ [AIManager] Copying ${originalAI.actions.length} actions to cloned AI ${clonedAI.id}`);
      for (const action of originalAI.actions) {
        try {
          // Copy action record to new AI
          const actionId = `action-${crypto.randomUUID()}`;
          const now = new Date().toISOString();
          
          const actionStmt = this.db.prepare(`
            INSERT INTO ai_actions (id, ai_id, name, description, url, method, headers, parameters, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          actionStmt.run(
            actionId,
            clonedAI.id,
            action.name,
            action.description || null,
            action.url,
            action.method || 'GET',
            JSON.stringify(action.headers || {}),
            JSON.stringify(action.parameters || {}),
            action.isActive !== false ? 1 : 0,
            now
          );
        } catch (error) {
          console.warn(`⚠️ [AIManager] Failed to copy action ${action.id}: ${error.message}`);
          // Continue copying other actions
        }
      }
    }

    // Reload cloned AI with files and actions
    const clonedAIWithRelations = await this.getAI(clonedAI.id);
    
    console.log(`✅ [AIManager] Successfully cloned AI ${aiId} → ${clonedAI.id} (${originalAI.name} → ${newCallsign})`);
    
    return clonedAIWithRelations;
  }

  getNextVersion(aiId) {
    const stmt = this.db.prepare('SELECT MAX(version) as maxVersion FROM ai_versions WHERE ai_id = ?');
    const row = stmt.get(aiId);
    const maxVersion = row?.maxVersion || 0;
    return maxVersion + 1;
  }

  recordVersion(aiId, version, snapshot) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ai_versions (ai_id, version, snapshot)
        VALUES (?, ?, ?)
      `);
      stmt.run(aiId, version, JSON.stringify(snapshot || {}));
    } catch (error) {
      console.warn(`⚠️ [AIManager] Failed to record version for ${aiId}:`, error.message);
    }
  }

  // File Management
  async uploadFile(aiId, file) {
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
      INSERT INTO ai_files (id, ai_id, filename, original_name, mime_type, size, content, extracted_text, metadata, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, 
      aiId, 
      filename, 
      file.name, 
      file.type, 
      file.size, 
      parsedContent.content, 
      parsedContent.extractedText,
      JSON.stringify(parsedContent.metadata),
      now
    );

    return {
      id,
      aiId,
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

  async getAIFiles(aiId) {
    const stmt = this.db.prepare('SELECT * FROM ai_files WHERE ai_id = ? AND is_active = 1 ORDER BY uploaded_at DESC');
    const rows = stmt.all(aiId);

    return rows.map(row => ({
      id: row.id,
      aiId: row.ai_id,
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

  // Helper method to get files from old gpts table structure
  async getAIFilesFromGPTsTable(gptId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM gpt_files WHERE gpt_id = ? AND is_active = 1 ORDER BY uploaded_at DESC');
      const rows = stmt.all(gptId);

      return rows.map(row => ({
        id: row.id,
        aiId: row.gpt_id, // Map gpt_id to aiId for compatibility
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
    } catch (error) {
      console.warn(`⚠️ [AIManager] Failed to get files from gpt_files table for ${gptId}: ${error.message}`);
      return [];
    }
  }

  async deleteFile(fileId) {
    const stmt = this.db.prepare('UPDATE ai_files SET is_active = 0 WHERE id = ?');
    const result = stmt.run(fileId);
    return result.changes > 0;
  }

  async updateFileAIId(fileId, newAIId) {
    const stmt = this.db.prepare('UPDATE ai_files SET ai_id = ? WHERE id = ?');
    const result = stmt.run(newAIId, fileId);
    return result.changes > 0;
  }

  // Action Management
  async createAction(aiId, action) {
    const id = `action-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO ai_actions (id, ai_id, name, description, url, method, headers, parameters, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      aiId,
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
      aiId,
      ...action,
      createdAt: now
    };
  }

  async getAIActions(aiId) {
    const stmt = this.db.prepare('SELECT * FROM ai_actions WHERE ai_id = ? AND is_active = 1 ORDER BY created_at DESC');
    const rows = stmt.all(aiId);

    return rows.map(row => ({
      id: row.id,
      aiId: row.ai_id,
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

  // Helper method to get actions from old gpts table structure
  async getAIActionsFromGPTsTable(gptId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM gpt_actions WHERE gpt_id = ? AND is_active = 1 ORDER BY created_at DESC');
      const rows = stmt.all(gptId);

      return rows.map(row => ({
        id: row.id,
        aiId: row.gpt_id, // Map gpt_id to aiId for compatibility
        name: row.name,
        description: row.description,
        url: row.url,
        method: row.method,
        headers: JSON.parse(row.headers || '{}'),
        parameters: JSON.parse(row.parameters || '{}'),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at
      }));
    } catch (error) {
      console.warn(`⚠️ [AIManager] Failed to get actions from gpt_actions table for ${gptId}: ${error.message}`);
      return [];
    }
  }

  async deleteAction(actionId) {
    const stmt = this.db.prepare('UPDATE ai_actions SET is_active = 0 WHERE id = ?');
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
  async getAIContext(aiId, maxFiles = 50, maxContextLength = 50000) {
    const files = await this.getAIFiles(aiId);
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

  async updateAIContext(aiId, context) {
    // VVAULT BOUNDARY GUARD: This method should NOT store construct memories.
    // Construct memories (STM/LTM) MUST be stored in VVAULT via VVAULT API.
    // This method is for UI convenience context only, not canonical construct memory.
    // See: chatty/docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md
    // For now, we'll store context in memory
    // In a full implementation, you might want to store this in the database
    console.log(`Updated context for AI ${aiId}:`, context.substring(0, 100) + '...');
  }

  // Runtime Management
  async loadAIForRuntime(aiId) {
    const config = await this.getAI(aiId);
    if (!config) return null;

    const runtime = {
      config,
      context: '',
      memory: new Map(),
      lastUsed: new Date().toISOString()
    };

    this.runtimeAIs.set(aiId, runtime);
    return runtime;
  }

  getRuntimeAI(aiId) {
    return this.runtimeAIs.get(aiId) || null;
  }

  async executeAction(actionId, parameters = {}) {
    const stmt = this.db.prepare('SELECT * FROM ai_actions WHERE id = ? AND is_active = 1');
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
   * Migrate existing AIs to have constructCallsign based on their names
   * This should be called once to backfill missing constructCallsign values
   */
  async migrateExistingAIs() {
    console.log('🔄 [AIManager] Starting migration of existing AIs...');
    
    const stmt = this.db.prepare('SELECT * FROM ais WHERE construct_callsign IS NULL OR construct_callsign = ""');
    const rows = stmt.all();
    
    let migrated = 0;
    let errors = 0;
    
    for (const row of rows) {
      if (!row.name || !row.name.trim()) {
        console.warn(`⚠️ [AIManager] Skipping AI ${row.id} - no name`);
        continue;
      }
      
      try {
        const constructCallsign = await this.generateConstructCallsign(row.name, row.user_id);
        
        const updateStmt = this.db.prepare('UPDATE ais SET construct_callsign = ? WHERE id = ?');
        updateStmt.run(constructCallsign, row.id);
        
        console.log(`✅ [AIManager] Migrated AI ${row.id}: "${row.name}" → ${constructCallsign}`);
        migrated++;
      } catch (error) {
        console.error(`❌ [AIManager] Failed to migrate AI ${row.id}: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`✅ [AIManager] Migration complete: ${migrated} migrated, ${errors} errors`);
    return { migrated, errors, total: rows.length };
  }

  // Cleanup
  async cleanup() {
    this.db.close();
  }
}
