// GPT Manager - Complete GPT Creator Backend System
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface GPTFile {
  id: string;
  gptId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  content: string; // Base64 encoded content
  uploadedAt: string;
  isActive: boolean;
}

export interface GPTAction {
  id: string;
  gptId: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  parameters: Record<string, any>;
  isActive: boolean;
  createdAt: string;
}

export interface GPTConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
  conversationStarters: string[];
  avatar?: string; // Base64 encoded image or URL
  capabilities: {
    webSearch: boolean;
    canvas: boolean;
    imageGeneration: boolean;
    codeInterpreter: boolean;
  };
  modelId: string;
  files: GPTFile[];
  actions: GPTAction[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface GPTRuntime {
  config: GPTConfig;
  context: string; // Current conversation context
  memory: Map<string, any>; // Runtime memory
  lastUsed: string;
}

export class GPTManager {
  private static instance: GPTManager;
  private db: Database.Database;
  private runtimeGPTs: Map<string, GPTRuntime> = new Map();
  private uploadDir: string;
  private readonly isBrowserEnvironment: boolean;

  private constructor() {
    this.isBrowserEnvironment =
      typeof window !== 'undefined' && typeof window.document !== 'undefined';
    
    // Prevent instantiation in browser environment
    if (this.isBrowserEnvironment) {
      throw new Error('[GPTManager] Cannot instantiate GPTManager in browser environment. Use gptManagerFactory.createGPTManager() instead.');
    }
    
    this.db = new Database('chatty.db');
    this.uploadDir = path.join(process.cwd(), 'gpt-uploads');
    this.initializeDatabase();
      this.ensureUploadDir();
  }

  static getInstance(): GPTManager {
    // Prevent instantiation in browser environment
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      throw new Error('[GPTManager] Cannot instantiate GPTManager in browser environment. Use gptManagerFactory.createGPTManager() instead.');
    }
    
    if (!GPTManager.instance) {
      GPTManager.instance = new GPTManager();
    }
    return GPTManager.instance;
  }

  private initializeDatabase() {
    // GPTs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gpts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        instructions TEXT,
        conversation_starters TEXT, -- JSON array
        avatar TEXT,
        capabilities TEXT, -- JSON object
        model_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT NOT NULL
      )
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
        content TEXT NOT NULL, -- Base64 encoded
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
        headers TEXT, -- JSON object
        parameters TEXT, -- JSON object
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gpt_id) REFERENCES gpts (id) ON DELETE CASCADE
      )
    `);

    console.log('✅ GPT Manager database initialized');
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
  }

  // GPT CRUD Operations
  async createGPT(config: Omit<GPTConfig, 'id' | 'createdAt' | 'updatedAt' | 'files' | 'actions'>): Promise<GPTConfig> {
    const id = `gpt-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO gpts (id, name, description, instructions, conversation_starters, avatar, capabilities, model_id, is_active, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      config.name,
      config.description,
      config.instructions,
      JSON.stringify(config.conversationStarters),
      config.avatar || null,
      JSON.stringify(config.capabilities),
      config.modelId,
      config.isActive ? 1 : 0,
      now,
      now,
      config.userId
    );

    return {
      id,
      ...config,
      files: [],
      actions: [],
      createdAt: now,
      updatedAt: now
    };
  }

  async getGPT(id: string): Promise<GPTConfig | null> {
    const stmt = this.db.prepare('SELECT * FROM gpts WHERE id = ?');
    const row = stmt.get(id) as any;

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
      userId: row.user_id
    };
  }

  async getAllGPTs(userId: string): Promise<GPTConfig[]> {
    const stmt = this.db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC');
    const rows = stmt.all(userId) as any[];

    const gpts: GPTConfig[] = [];
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
        userId: row.user_id
      });
    }

    return gpts;
  }

  async updateGPT(id: string, updates: Partial<Omit<GPTConfig, 'id' | 'createdAt' | 'files' | 'actions'>>): Promise<GPTConfig | null> {
    const existing = await this.getGPT(id);
    if (!existing) return null;

    const stmt = this.db.prepare(`
      UPDATE gpts 
      SET name = ?, description = ?, instructions = ?, conversation_starters = ?, avatar = ?, capabilities = ?, model_id = ?, is_active = ?, updated_at = ?
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
      new Date().toISOString(),
      id
    );

    return await this.getGPT(id);
  }

  async deleteGPT(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM gpts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // File Management
  async uploadFile(gptId: string, file: { name: string; content: string; mimeType: string; size: number }): Promise<GPTFile> {
    const id = `file-${crypto.randomUUID()}`;
    const filename = `${id}-${file.name}`;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO gpt_files (id, gpt_id, filename, original_name, mime_type, size, content, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, gptId, filename, file.name, file.mimeType, file.size, file.content, now);

    return {
      id,
      gptId,
      filename,
      originalName: file.name,
      mimeType: file.mimeType,
      size: file.size,
      content: file.content,
      uploadedAt: now,
      isActive: true
    };
  }

  async getGPTFiles(gptId: string): Promise<GPTFile[]> {
    const stmt = this.db.prepare('SELECT * FROM gpt_files WHERE gpt_id = ? AND is_active = 1 ORDER BY uploaded_at DESC');
    const rows = stmt.all(gptId) as any[];

    return rows.map(row => ({
      id: row.id,
      gptId: row.gpt_id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      content: row.content,
      uploadedAt: row.uploaded_at,
      isActive: Boolean(row.is_active)
    }));
  }

  async deleteFile(fileId: string): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE gpt_files SET is_active = 0 WHERE id = ?');
    const result = stmt.run(fileId);
    return result.changes > 0;
  }

  // Action Management
  async createAction(gptId: string, action: Omit<GPTAction, 'id' | 'gptId' | 'createdAt'>): Promise<GPTAction> {
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
      JSON.stringify(action.headers),
      JSON.stringify(action.parameters),
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

  async getGPTActions(gptId: string): Promise<GPTAction[]> {
    const stmt = this.db.prepare('SELECT * FROM gpt_actions WHERE gpt_id = ? AND is_active = 1 ORDER BY created_at DESC');
    const rows = stmt.all(gptId) as any[];

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

  async deleteAction(actionId: string): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE gpt_actions SET is_active = 0 WHERE id = ?');
    const result = stmt.run(actionId);
    return result.changes > 0;
  }

  // Runtime Management
  async loadGPTForRuntime(gptId: string): Promise<GPTRuntime | null> {
    const config = await this.getGPT(gptId);
    if (!config) return null;

    const runtime: GPTRuntime = {
      config,
      context: '',
      memory: new Map(),
      lastUsed: new Date().toISOString()
    };

    this.runtimeGPTs.set(gptId, runtime);
    return runtime;
  }

  getRuntimeGPT(gptId: string): GPTRuntime | null {
    return this.runtimeGPTs.get(gptId) || null;
  }

  async executeAction(actionId: string, parameters: Record<string, any> = {}): Promise<any> {
    const stmt = this.db.prepare('SELECT * FROM gpt_actions WHERE id = ? AND is_active = 1');
    const action = stmt.get(actionId) as any;

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

  // Avatar Generation
  generateAvatar(name: string, _description: string): string {
    // Simple SVG avatar generation based on name and description
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

  // Context Management
  async getGPTContext(gptId: string): Promise<string> {
    const runtime = this.getRuntimeGPT(gptId);
    if (!runtime) return '';

    const contextParts: string[] = [];

    // Add GPT instructions
    if (runtime.config.instructions) {
      contextParts.push(`Instructions: ${runtime.config.instructions}`);
    }

    // Add file contents
    for (const file of runtime.config.files) {
      if (file.isActive && file.mimeType.startsWith('text/')) {
        try {
          const content = Buffer.from(file.content, 'base64').toString('utf-8');
          contextParts.push(`File "${file.originalName}": ${content.substring(0, 1000)}...`);
        } catch (error) {
          console.error('Error reading file content:', error);
        }
      }
    }

    // Add conversation context
    if (runtime.context) {
      contextParts.push(`Context: ${runtime.context}`);
    }

    return contextParts.join('\n\n');
  }

  async updateGPTContext(gptId: string, context: string): Promise<void> {
    const runtime = this.getRuntimeGPT(gptId);
    if (runtime) {
      runtime.context = context;
      runtime.lastUsed = new Date().toISOString();
    }
  }

  // Cleanup
  async cleanup(): Promise<void> {
    this.db.close();
  }
}
