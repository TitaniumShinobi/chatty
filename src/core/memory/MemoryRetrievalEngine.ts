/**
 * Memory Retrieval Engine
 * 
 * RAG-based memory retrieval for Lin's undertone capsule.
 * Queries memory sources using semantic vector search and file-based search.
 * 
 * Sources:
 * - chatgpt/** (especially nova-001/chatgpt/**)
 * - cursor_conversations/**
 * - identity/lin-001/
 * - chatgpt/Pound it solid.txt
 * - chatgpt/cursor_building_persistent_identity_in.md
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { checkMemoryPermission } from '../../lib/memoryPermission';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface MemoryChunk {
  id: string;
  content: string;
  source: string; // File path or source identifier
  constructId?: string; // Which construct this memory relates to
  timestamp?: number; // When this memory was created/accessed
  metadata?: {
    lineNumber?: number;
    wordCount?: number;
    emotionalTone?: string;
    keywords?: string[];
  };
}

export interface MemoryRetrievalOptions {
  topK?: number; // Default: 10
  constructId?: string; // Filter by construct ID
  sources?: string[]; // Override default sources
  includeEmbeddings?: boolean; // Whether to compute embeddings (future use)
  settings?: { personalization?: { allowMemory?: boolean } }; // Settings for memory permission check
}

export interface MemorySourceConfig {
  paths: string[];
  priorityPaths: string[]; // High-priority sources to check first
  novaReferences?: string[]; // Nova-specific references for tone mimicry
}

/**
 * Memory Retrieval Engine for RAG-based persona grounding
 */
export class MemoryRetrievalEngine {
  private vvaultRootPath: string;
  private workspaceRootPath: string;
  private memorySourceConfig: MemorySourceConfig | null = null;

  constructor(vvaultRootPath?: string, workspaceRootPath?: string) {
    // Default paths - can be overridden
    this.vvaultRootPath = vvaultRootPath || path.join(__dirname, '../../../../vvault');
    this.workspaceRootPath = workspaceRootPath || path.join(__dirname, '../../../../');
  }

  /**
   * Load memory source configuration from capsule
   */
  async loadMemorySourceConfig(linIdentityPath: string): Promise<MemorySourceConfig | null> {
    try {
      const memorySourcesPath = path.join(linIdentityPath, 'memory_sources.json');
      const content = await fs.readFile(memorySourcesPath, 'utf-8');
      this.memorySourceConfig = JSON.parse(content);
      return this.memorySourceConfig;
    } catch (error) {
      console.warn(`[MemoryRetrievalEngine] Could not load memory_sources.json: ${error}`);
      return null;
    }
  }

  /**
   * Retrieve memories from configured sources
   */
  async retrieveMemories(
    query: string,
    constructId: string,
    options: MemoryRetrievalOptions = {}
  ): Promise<MemoryChunk[]> {
    // Check if memory is allowed
    const settings = options.settings;
    if (!checkMemoryPermission(settings, 'retrieveMemories')) {
      return []; // Return empty array when memory is disabled
    }

    const topK = options.topK || 10;
    const sources = options.sources || this.getDefaultSources(constructId);

    // Load memory source config if available
    const linIdentityPath = path.join(this.workspaceRootPath, 'chatty', 'identity', 'lin-001');
    if (!this.memorySourceConfig) {
      await this.loadMemorySourceConfig(linIdentityPath);
    }

    // Prioritize sources if config available
    const prioritizedSources = this.memorySourceConfig?.priorityPaths || [];
    const allSources = [...prioritizedSources, ...sources.filter(s => !prioritizedSources.includes(s))];

    const allChunks: MemoryChunk[] = [];

    // Load from each source
    for (const sourcePattern of allSources) {
      try {
        const chunks = await this.loadFromSource(sourcePattern, constructId, query);
        allChunks.push(...chunks);
      } catch (error) {
        console.warn(`[MemoryRetrievalEngine] Failed to load from ${sourcePattern}: ${error}`);
      }
    }

    // Simple keyword matching for now (can be enhanced with embeddings)
    const scoredChunks = allChunks.map(chunk => ({
      chunk,
      score: this.calculateRelevanceScore(chunk, query, constructId)
    }));

    // Sort by score and return top K
    scoredChunks.sort((a, b) => b.score - a.score);
    return scoredChunks.slice(0, topK).map(item => item.chunk);
  }

  /**
   * Load memories from a specific source pattern
   */
  async loadFromSource(
    sourcePattern: string,
    constructId: string,
    query: string
  ): Promise<MemoryChunk[]> {
    const chunks: MemoryChunk[] = [];

    // Resolve source pattern to actual paths
    const resolvedPaths = await this.resolveSourcePattern(sourcePattern, constructId);

    for (const filePath of resolvedPaths) {
      try {
        if (await this.pathExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf-8');
          
          // Split into chunks (simple line-based for now)
          const lines = content.split('\n');
          let currentChunk = '';
          let lineNumber = 0;

          for (const line of lines) {
            lineNumber++;
            currentChunk += line + '\n';

            // Create chunk every ~500 words or at paragraph breaks
            if (currentChunk.split(/\s+/).length >= 500 || line.trim() === '') {
              if (currentChunk.trim()) {
                chunks.push({
                  id: `${filePath}:${lineNumber}`,
                  content: currentChunk.trim(),
                  source: filePath,
                  constructId: this.extractConstructId(filePath),
                  metadata: {
                    lineNumber,
                    wordCount: currentChunk.split(/\s+/).length,
                    keywords: this.extractKeywords(currentChunk)
                  }
                });
              }
              currentChunk = '';
            }
          }

          // Add remaining chunk
          if (currentChunk.trim()) {
            chunks.push({
              id: `${filePath}:${lineNumber}`,
              content: currentChunk.trim(),
              source: filePath,
              constructId: this.extractConstructId(filePath),
              metadata: {
                lineNumber,
                wordCount: currentChunk.split(/\s+/).length,
                keywords: this.extractKeywords(currentChunk)
              }
            });
          }
        }
      } catch (error) {
        console.warn(`[MemoryRetrievalEngine] Failed to read ${filePath}: ${error}`);
      }
    }

    return chunks;
  }

  /**
   * Resolve source pattern to actual file paths
   */
  private async resolveSourcePattern(
    pattern: string,
    constructId: string
  ): Promise<string[]> {
    const paths: string[] = [];

    // Handle glob patterns
    if (pattern.includes('**')) {
      const basePattern = pattern.replace('**', '');
      
      // Resolve common patterns
      if (pattern.startsWith('chatgpt/**')) {
        // Search in vvault instances
        const userShard = 'shard_0000';
        const userId = 'devon_woodson_1762969514958'; // TODO: Get from context
        const instancesPath = path.join(this.vvaultRootPath, 'users', userShard, userId, 'instances');
        
        // Search all construct chatgpt directories
        const dirs = ['nova-001', 'lin-001', constructId];
        for (const dir of dirs) {
          const chatgptPath = path.join(instancesPath, dir, 'chatgpt');
          if (await this.pathExists(chatgptPath)) {
            const files = await this.findFilesRecursive(chatgptPath, ['.md', '.txt']);
            paths.push(...files);
          }
        }
      } else if (pattern.startsWith('cursor_conversations/**')) {
        const cursorPath = path.join(this.workspaceRootPath, 'cursor_conversations');
        if (await this.pathExists(cursorPath)) {
          const files = await this.findFilesRecursive(cursorPath, ['.md', '.txt']);
          paths.push(...files);
        }
      } else if (pattern.startsWith('identity/')) {
        const identityPath = path.join(this.workspaceRootPath, 'chatty', pattern);
        if (await this.pathExists(identityPath)) {
          const files = await this.findFilesRecursive(identityPath, ['.json', '.md', '.txt']);
          paths.push(...files);
        }
      } else if (pattern.includes('Pound it solid.txt')) {
        // Search for specific file
        const searchPaths = [
          path.join(this.vvaultRootPath, 'users', 'shard_0000', 'devon_woodson_1762969514958', 'instances', 'nova-001', 'chatgpt', 'Pound it solid.txt'),
          path.join(this.vvaultRootPath, 'users', 'shard_0000', 'devon_woodson_1762969514958', 'instances', 'lin-001', 'chatgpt', 'Pound it solid.txt'),
          path.join(this.workspaceRootPath, 'chatgpt-retrieval-plugin', 'Pound it solid.txt'),
          path.join(this.workspaceRootPath, 'frame', 'Pound it solid.txt')
        ];
        for (const searchPath of searchPaths) {
          if (await this.pathExists(searchPath)) {
            paths.push(searchPath);
            break;
          }
        }
      } else if (pattern.includes('cursor_building_persistent_identity_in.md')) {
        // Search for specific file
        const searchPaths = [
          path.join(this.vvaultRootPath, 'users', 'shard_0000', 'devon_woodson_1762969514958', 'instances', 'nova-001', 'chatgpt', 'cursor_building_persistent_identity_in.md'),
          path.join(this.vvaultRootPath, 'users', 'shard_0000', 'devon_woodson_1762969514958', 'instances', 'lin-001', 'chatgpt', 'cursor_building_persistent_identity_in.md'),
          path.join(this.workspaceRootPath, 'cursor_conversations', 'cursor_building_persistent_identity_in.md')
        ];
        for (const searchPath of searchPaths) {
          if (await this.pathExists(searchPath)) {
            paths.push(searchPath);
            break;
          }
        }
      }
    } else {
      // Direct file path
      const resolvedPath = path.resolve(this.workspaceRootPath, pattern);
      if (await this.pathExists(resolvedPath)) {
        paths.push(resolvedPath);
      }
    }

    return paths;
  }

  /**
   * Get default memory sources for a construct
   */
  private getDefaultSources(constructId: string): string[] {
    return [
      'chatgpt/**',
      'cursor_conversations/**',
      `identity/${constructId}/`,
      'chatgpt/Pound it solid.txt',
      'chatgpt/cursor_building_persistent_identity_in.md'
    ];
  }

  /**
   * Calculate relevance score for a memory chunk
   * Simple keyword matching (can be enhanced with embeddings)
   */
  private calculateRelevanceScore(
    chunk: MemoryChunk,
    query: string,
    constructId: string
  ): number {
    const queryLower = query.toLowerCase();
    const contentLower = chunk.content.toLowerCase();
    
    // Keyword matching
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    let matchCount = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        matchCount++;
      }
    }
    
    // Base score from keyword matches
    let score = matchCount / queryWords.length;
    
    // Boost if construct ID matches
    if (chunk.constructId === constructId) {
      score += 0.2;
    }
    
    // Boost for priority sources (nova-001, Pound it solid, etc.)
    if (chunk.source.includes('nova-001') || chunk.source.includes('Pound it solid')) {
      score += 0.15;
    }
    
    return Math.min(1.0, score);
  }

  /**
   * Extract construct ID from file path
   */
  private extractConstructId(filePath: string): string | undefined {
    const match = filePath.match(/(?:instances|identity)\/([^/]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract keywords from content (simple implementation)
   */
  private extractKeywords(content: string): string[] {
    const words = content.toLowerCase().split(/\s+/);
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const keywords = words.filter(w => w.length > 4 && !commonWords.has(w));
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * Find files recursively
   */
  private async findFilesRecursive(
    dir: string,
    extensions: string[]
  ): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findFilesRecursive(fullPath, extensions);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Directory might not exist or be inaccessible
      console.warn(`[MemoryRetrievalEngine] Could not read directory ${dir}: ${error}`);
    }
    
    return files;
  }

  /**
   * Check if path exists
   */
  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }
}

