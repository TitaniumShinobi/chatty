// GPT Manager - Server-side implementation
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { ServerFileParser } from './serverFileParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GPTManager {
  static instance = null;
  db = null;
  runtimeGPTs = new Map();
  uploadDir = '';

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

    // Ensure construct_callsign column exists for older databases
    const hasConstructCallsign = this.db.prepare(`PRAGMA table_info(gpts)`).all().some(col => col.name === 'construct_callsign');
    if (!hasConstructCallsign) {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN construct_callsign TEXT`);
    }

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
      INSERT INTO gpts (id, name, description, instructions, conversation_starters, avatar, capabilities, construct_callsign, model_id, is_active, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      config.name,
      config.description,
      config.instructions,
      JSON.stringify(config.conversationStarters || []),
      config.avatar || null,
      JSON.stringify(config.capabilities || {}),
      constructCallsign,
      config.modelId,
      config.isActive ? 1 : 0,
      now,
      now,
      config.userId || 'anonymous'
    );

    return {
      id,
      ...config,
      files: [],
      actions: [],
      createdAt: now,
      updatedAt: now,
      constructCallsign: constructCallsign
    };
  }

  async getGPT(id) {
    const stmt = this.db.prepare('SELECT * FROM gpts WHERE id = ?');
    const row = stmt.get(id);

    if (!row) return null;

    const files = await this.getGPTFiles(id);
    const actions = await this.getGPTActions(id);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      conversationStarters: JSON.parse(row.conversation_starters || '[]'),
      avatar: row.avatar,
      capabilities: JSON.parse(row.capabilities || '{}'),
      constructCallsign: row.construct_callsign,
      modelId: row.model_id,
      files,
      actions,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id
    };
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

      // Try primary lookup with provided user ID (may be VVAULT format)
      const stmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
      let rows = stmt.all(userId);

      // Fallback: if none found and we have an original user ID (email/ObjectId), try that too
      if ((!rows || rows.length === 0) && originalUserId && originalUserId !== userId) {
        console.log(`🔄 [GPTManager] Trying fallback query with original user ID: ${originalUserId}`);
        const fallbackStmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
        rows = fallbackStmt.all(originalUserId);
      }

      // Last resort: if still none found, try email-based lookup (for backward compatibility)
      if ((!rows || rows.length === 0) && originalUserId && originalUserId.includes('@')) {
        console.log(`🔄 [GPTManager] Trying email-based lookup: ${originalUserId}`);
        const emailStmt = this.db.prepare('SELECT * FROM gpts WHERE user_id LIKE ? ORDER BY updated_at DESC');
        rows = emailStmt.all(`%${originalUserId}%`);
      }

      console.log(`📊 [GPTManager] Found ${rows?.length || 0} GPTs for user: ${userId}${originalUserId && originalUserId !== userId ? ` (original: ${originalUserId})` : ''}`);

      const gpts = [];
      for (const row of rows) {
        try {
          const files = await this.getGPTFiles(row.id);
          const actions = await this.getGPTActions(row.id);

          // Parse JSON fields with error handling
          let conversationStarters = [];
          let capabilities = {};
          
          try {
            conversationStarters = JSON.parse(row.conversation_starters || '[]');
          } catch (e) {
            console.warn(`⚠️ [GPTManager] Invalid conversation_starters JSON for ${row.id}, using empty array`);
            conversationStarters = [];
          }
          
          try {
            capabilities = JSON.parse(row.capabilities || '{}');
          } catch (e) {
            console.warn(`⚠️ [GPTManager] Invalid capabilities JSON for ${row.id}, using empty object`);
            // Try to fix common issues (unquoted keys in object literals)
            try {
              const fixed = (row.capabilities || '{}').replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
              capabilities = JSON.parse(fixed);
              console.log(`✅ [GPTManager] Fixed capabilities JSON for ${row.id}`);
            } catch (e2) {
              capabilities = {};
            }
          }

          gpts.push({
            id: row.id,
            name: row.name,
            description: row.description,
            instructions: row.instructions,
            conversationStarters,
            avatar: row.avatar,
            capabilities,
            constructCallsign: row.construct_callsign,
            modelId: row.model_id,
            files,
            actions,
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userId: row.user_id
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

  async updateGPT(id, updates) {
    const existing = await this.getGPT(id);
    if (!existing) return null;

    const stmt = this.db.prepare(`
      UPDATE gpts 
      SET name = ?, description = ?, instructions = ?, conversation_starters = ?, avatar = ?, capabilities = ?, construct_callsign = ?, model_id = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updates.name || existing.name,
      updates.description || existing.description,
      updates.instructions || existing.instructions,
      JSON.stringify(updates.conversationStarters || existing.conversationStarters),
      updates.avatar !== undefined ? updates.avatar : existing.avatar,
      JSON.stringify(updates.capabilities || existing.capabilities),
      updates.constructCallsign !== undefined ? updates.constructCallsign : existing.constructCallsign,
      updates.modelId || existing.modelId,
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      new Date().toISOString(),
      id
    );

    return await this.getGPT(id);
  }

  async deleteGPT(id) {
    const stmt = this.db.prepare('DELETE FROM gpts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
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

    stmt.run(
      id, 
      gptId, 
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
