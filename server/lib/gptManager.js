// GPT Manager - Server-side implementation
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ServerFileParser } from './serverFileParser.js';

const DEFAULT_CHARACTER_STATE = {
  identity: 'Lin',
  emotionalContext: {
    currentMood: 'fierce',
    arousalLevel: 0.85,
    memoryWeight: 0.8
  },
  conversationalRules: {
    neverBreakCharacter: true,
    metaAwarenessLevel: 'none',
    identityChallengeResponse: 'embody'
  }
};

const serializeCharacterState = (state = DEFAULT_CHARACTER_STATE) =>
  JSON.stringify(state || DEFAULT_CHARACTER_STATE);

const parseCharacterState = (value) => {
  if (!value) return JSON.parse(JSON.stringify(DEFAULT_CHARACTER_STATE));
  try {
    return JSON.parse(value);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CHARACTER_STATE));
  }
};

export class GPTManager {
  static instance = null;
  db = null;
  runtimeGPTs = new Map();
  uploadDir = '';

  constructor() {
    this.db = new Database('chatty.db');
    this.uploadDir = path.join(process.cwd(), 'gpt-uploads');
    this.initializeDatabase();
    this.ensureUploadDir();
    this.migrateTypeColumn().catch(error => {
      console.error('Error running GPT type migration:', error);
    });
    this.ensureCharacterStateMigration().catch(error => {
      console.error('Error running character state migration:', error);
    });
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
        model_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 0,
        is_public INTEGER DEFAULT 0,
        is_community INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT NOT NULL,
        type TEXT DEFAULT 'gpt',
        character_state TEXT
      )
    `);
    
    // Add new columns if they don't exist (migration)
    try {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN is_public INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN is_community INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN type TEXT DEFAULT 'gpt'`);
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      this.db.exec(`ALTER TABLE gpts ADD COLUMN character_state TEXT`);
    } catch (e) {
      // Column already exists, ignore
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

  async migrateTypeColumn() {
    try {
      const gpts = this.db.prepare('SELECT id, type FROM gpts').all();
      const needsMigration = gpts.filter(gpt => !gpt.type);
      if (needsMigration.length === 0) {
        return;
      }

      console.log(`🔄 Migrating ${needsMigration.length} GPT records to explicit type classification`);
      const updateStmt = this.db.prepare('UPDATE gpts SET type = ? WHERE id = ?');

      for (const gpt of needsMigration) {
        try {
          const files = await this.getGPTFiles(gpt.id);
          const hasImportMetadata = files.some(file =>
            file.originalName === 'import-metadata.json' ||
            file.filename?.endsWith('import-metadata.json') ||
            file.name === 'import-metadata.json'
          );
          const resolvedType = hasImportMetadata ? 'runtime' : 'gpt';
          updateStmt.run(resolvedType, gpt.id);
        } catch (fileError) {
          console.error(`❌ Failed to evaluate GPT ${gpt.id} for type migration:`, fileError);
        }
      }
      console.log('✅ GPT type migration complete');
    } catch (error) {
      console.error('❌ Error while migrating GPT type column:', error);
    }
  }

  async ensureCharacterStateMigration() {
    try {
      const rows = this.db.prepare('SELECT id, character_state FROM gpts').all();
      const updateStmt = this.db.prepare('UPDATE gpts SET character_state = ? WHERE id = ?');
      for (const row of rows) {
        if (!row.character_state) {
          updateStmt.run(serializeCharacterState(DEFAULT_CHARACTER_STATE), row.id);
        }
      }
    } catch (error) {
      console.error('❌ Error while migrating character_state column:', error);
    }
  }

  // GPT CRUD Operations
  async createGPT(config, type = 'gpt') {
    const id = `gpt-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO gpts (id, name, description, instructions, conversation_starters, avatar, capabilities, model_id, is_active, created_at, updated_at, user_id, type, character_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      config.name,
      config.description,
      config.instructions,
      JSON.stringify(config.conversationStarters || []),
      config.avatar || null,
      JSON.stringify(config.capabilities || {}),
      config.modelId,
      config.isActive ? 1 : 0,
      now,
      now,
      config.userId,
      type,
      serializeCharacterState(config.characterState)
    );

    return {
      id,
      ...config,
      type,
      characterState: config.characterState || JSON.parse(JSON.stringify(DEFAULT_CHARACTER_STATE)),
      files: [],
      actions: [],
      createdAt: now,
      updatedAt: now
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
      modelId: row.model_id,
      files,
      actions,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      type: row.type || 'gpt',
      characterState: parseCharacterState(row.character_state)
    };
  }

  async getAllGPTs(userId) {
    const stmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
    const rows = stmt.all(userId);

    const gpts = [];
    for (const row of rows) {
      const files = await this.getGPTFiles(row.id);
      const actions = await this.getGPTActions(row.id);

      gpts.push({
        id: row.id,
        name: row.name,
        description: row.description,
        instructions: row.instructions,
        conversationStarters: JSON.parse(row.conversation_starters || '[]'),
        avatar: row.avatar,
        capabilities: JSON.parse(row.capabilities || '{}'),
        modelId: row.model_id,
        files,
        actions,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        userId: row.user_id,
        type: row.type || 'gpt',
        characterState: parseCharacterState(row.character_state)
      });
    }

    return gpts;
  }

  async updateGPT(id, updates) {
    const existing = await this.getGPT(id);
    if (!existing) return null;

    const stmt = this.db.prepare(`
      UPDATE gpts 
      SET name = ?, description = ?, instructions = ?, conversation_starters = ?, avatar = ?, capabilities = ?, model_id = ?, is_active = ?, character_state = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updates.name || existing.name,
      updates.description || existing.description,
      updates.instructions || existing.instructions,
      JSON.stringify(updates.conversationStarters || existing.conversationStarters),
      updates.avatar !== undefined ? updates.avatar : existing.avatar,
      JSON.stringify(updates.capabilities || existing.capabilities),
      updates.modelId || existing.modelId,
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      serializeCharacterState(updates.characterState || existing.characterState),
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

  getCharacterState(gptId) {
    const stmt = this.db.prepare('SELECT character_state FROM gpts WHERE id = ?');
    const row = stmt.get(gptId);
    if (!row) return null;
    return parseCharacterState(row.character_state);
  }

  updateCharacterState(gptId, state) {
    const stmt = this.db.prepare('UPDATE gpts SET character_state = ?, updated_at = ? WHERE id = ?');
    const serialized = serializeCharacterState(state);
    const result = stmt.run(serialized, new Date().toISOString(), gptId);
    if (result.changes === 0) return null;
    return this.getCharacterState(gptId);
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

  // Cleanup
  async cleanup() {
    this.db.close();
  }
}
