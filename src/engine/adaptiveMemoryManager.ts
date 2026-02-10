// adaptiveMemoryManager.ts - Adaptive memory management with intelligent pruning

import { MemoryStore } from './memory/MemoryStore.js';
import { PersonaBrain } from './memory/PersonaBrain.js';

export interface MemoryConfig {
  maxContextLength: number;
  maxHistoryMessages: number;
  maxTriples: number;
  enableSmartPruning: boolean;
  enableContextCompression: boolean;
  enableImportanceScoring: boolean;
}

export interface MemoryMetrics {
  contextLength: number;
  historyLength: number;
  tripleCount: number;
  personaKeys: number;
  pruningEvents: number;
  compressionEvents: number;
  lastPruned: number;
}

export interface ImportanceScore {
  message: string;
  score: number;
  reasons: string[];
}

export class AdaptiveMemoryManager {
  private memory: MemoryStore;
  private brain: PersonaBrain;
  private config: MemoryConfig;
  private metrics: MemoryMetrics;
  private importanceCache = new Map<string, ImportanceScore>();

  constructor(
    memory: MemoryStore,
    brain: PersonaBrain,
    config: Partial<MemoryConfig> = {}
  ) {
    this.memory = memory;
    this.brain = brain;
    this.config = {
      maxContextLength: 8000,
      maxHistoryMessages: 20,
      maxTriples: 100,
      enableSmartPruning: true,
      enableContextCompression: true,
      enableImportanceScoring: true,
      ...config
    };
    this.metrics = {
      contextLength: 0,
      historyLength: 0,
      tripleCount: 0,
      personaKeys: 0,
      pruningEvents: 0,
      compressionEvents: 0,
      lastPruned: 0
    };
  }

  /**
   * Manage memory for a user with adaptive pruning
   */
  async manageMemory(userId: string): Promise<{
    pruned: boolean;
    compressed: boolean;
    metrics: MemoryMetrics;
  }> {
    const context = this.brain.getContext(userId);
    this.updateMetrics(context);
    
    let pruned = false;
    let compressed = false;

    // Check if memory management is needed
    if (this.needsMemoryManagement()) {
      if (this.config.enableSmartPruning) {
        pruned = await this.smartPruning(userId);
      }
      
      if (this.config.enableContextCompression && !pruned) {
        compressed = await this.compressContext(userId);
      }
    }

    return { pruned, compressed, metrics: this.metrics };
  }

  /**
   * Update memory metrics
   */
  private updateMetrics(context: any): void {
    this.metrics.contextLength = JSON.stringify(context).length;
    this.metrics.historyLength = context.history?.length || 0;
    this.metrics.tripleCount = context.triples?.length || 0;
    this.metrics.personaKeys = Object.keys(context.persona || {}).length;
  }

  /**
   * Check if memory management is needed
   */
  private needsMemoryManagement(): boolean {
    return (
      this.metrics.contextLength > this.config.maxContextLength ||
      this.metrics.historyLength > this.config.maxHistoryMessages ||
      this.metrics.tripleCount > this.config.maxTriples
    );
  }

  /**
   * Smart pruning based on importance scoring
   */
  private async smartPruning(userId: string): Promise<boolean> {
    const _context = this.brain.getContext(userId);
    const messages = this.memory['messages'].get(userId) || [];
    
    if (messages.length <= this.config.maxHistoryMessages) {
      return false;
    }

    // Score messages by importance
    const scoredMessages = await this.scoreMessageImportance(messages);
    
    // Keep most important messages
    const keepCount = Math.floor(this.config.maxHistoryMessages * 0.8); // Keep 80%
    const sortedMessages = scoredMessages.sort((a, b) => b.score - a.score);
    const messagesToKeep = sortedMessages.slice(0, keepCount);
    
    // Rebuild memory with pruned messages
    this.memory['messages'].delete(userId);
    for (const msg of messagesToKeep) {
      this.memory.append(userId, msg.role, msg.text);
    }

    this.metrics.pruningEvents++;
    this.metrics.lastPruned = Date.now();
    
    return true;
  }

  /**
   * Score message importance
   */
  private async scoreMessageImportance(messages: any[]): Promise<Array<any & { score: number }>> {
    return messages.map(msg => ({
      ...msg,
      score: this.calculateImportanceScore(msg.text)
    }));
  }

  /**
   * Calculate importance score for a message
   */
  private calculateImportanceScore(text: string): number {
    // Check cache first
    if (this.importanceCache.has(text)) {
      return this.importanceCache.get(text)!.score;
    }

    let score = 0;
    const reasons: string[] = [];

    // Length factor (longer messages often more important)
    const lengthScore = Math.min(text.length / 100, 2);
    score += lengthScore;
    if (lengthScore > 1) reasons.push('long message');

    // Question factor
    if (/\?/.test(text)) {
      score += 1.5;
      reasons.push('contains question');
    }

    // Keyword importance
    const importantKeywords = [
      'important', 'critical', 'urgent', 'help', 'problem', 'error',
      'explain', 'how', 'why', 'what', 'when', 'where',
      'philosophy', 'meaning', 'life', 'purpose', 'emotion',
      'code', 'function', 'algorithm', 'bug', 'fix'
    ];
    
    const keywordMatches = importantKeywords.filter(keyword => 
      new RegExp(`\\b${keyword}\\b`, 'i').test(text)
    );
    
    score += keywordMatches.length * 0.5;
    if (keywordMatches.length > 0) {
      reasons.push(`keywords: ${keywordMatches.join(', ')}`);
    }

    // Personal reference factor
    if (/my|i am|i'm|i have|i need/i.test(text)) {
      score += 0.8;
      reasons.push('personal reference');
    }

    // Technical content factor
    if (/function|class|variable|import|export|const|let|var/i.test(text)) {
      score += 1.2;
      reasons.push('technical content');
    }

    // Emotional content factor
    if (/feel|emotion|happy|sad|angry|excited|worried|anxious/i.test(text)) {
      score += 1.0;
      reasons.push('emotional content');
    }

    // Recent messages get slight boost
    const age = Date.now() - (text as any).ts;
    const ageHours = age / (1000 * 60 * 60);
    if (ageHours < 1) {
      score += 0.5;
      reasons.push('recent message');
    }

    const result = { message: text, score, reasons };
    this.importanceCache.set(text, result);
    
    return score;
  }

  /**
   * Compress context by summarizing older messages
   */
  private async compressContext(userId: string): Promise<boolean> {
    const _context = this.brain.getContext(userId);
    const messages = this.memory['messages'].get(userId) || [];
    
    if (messages.length <= this.config.maxHistoryMessages * 0.8) {
      return false;
    }

    // Group messages by time periods
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;
    
    const recentMessages = messages.filter(m => now - m.ts < oneHour);
    const todayMessages = messages.filter(m => now - m.ts < oneDay && now - m.ts >= oneHour);
    const olderMessages = messages.filter(m => now - m.ts >= oneDay);

    if (olderMessages.length === 0) {
      return false;
    }

    // Summarize older messages
    const summary = await this.summarizeMessages(olderMessages);
    
    // Replace older messages with summary
    const summaryMessage = {
      role: 'system' as const,
      text: `[Previous conversation summary: ${summary}]`,
      ts: now
    };

    // Rebuild memory with compressed context
    this.memory['messages'].delete(userId);
    
    // Add summary first (store as user message since system role not supported)
    this.memory.append(userId, 'user', summaryMessage.text);
    
    // Add recent messages
    for (const msg of [...todayMessages, ...recentMessages]) {
      this.memory.append(userId, msg.role, msg.text);
    }

    this.metrics.compressionEvents++;
    
    return true;
  }

  /**
   * Summarize a group of messages
   */
  private async summarizeMessages(messages: any[]): Promise<string> {
    if (messages.length === 0) return '';
    
    // Simple summarization logic
    const topics = new Set<string>();
    const questions = new Set<string>();
    const keyPoints = new Set<string>();
    
    for (const msg of messages) {
      const text = msg.text.toLowerCase();
      
      // Extract topics
      if (text.includes('code') || text.includes('programming')) topics.add('programming');
      if (text.includes('philosophy') || text.includes('meaning')) topics.add('philosophy');
      if (text.includes('emotion') || text.includes('feeling')) topics.add('emotions');
      if (text.includes('help') || text.includes('problem')) topics.add('help');
      
      // Extract questions
      const questionMatches = msg.text.match(/[^.!?]*\?/g);
      if (questionMatches) {
        questionMatches.forEach((q: string) => questions.add(q.trim()));
      }
      
      // Extract key points (simple heuristic)
      if (text.length > 50 && !text.includes('?')) {
        keyPoints.add(msg.text.substring(0, 100) + '...');
      }
    }
    
    const summaryParts = [];
    if (topics.size > 0) {
      summaryParts.push(`Topics: ${Array.from(topics).join(', ')}`);
    }
    if (questions.size > 0) {
      summaryParts.push(`Questions: ${Array.from(questions).slice(0, 3).join('; ')}`);
    }
    if (keyPoints.size > 0) {
      summaryParts.push(`Key points: ${Array.from(keyPoints).slice(0, 2).join('; ')}`);
    }
    
    return summaryParts.join('. ');
  }

  /**
   * Get memory health status
   */
  getMemoryHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    if (this.metrics.contextLength > this.config.maxContextLength) {
      issues.push('Context too large');
      recommendations.push('Enable smart pruning or context compression');
    }
    
    if (this.metrics.historyLength > this.config.maxHistoryMessages) {
      issues.push('Too many history messages');
      recommendations.push('Reduce max history messages or enable pruning');
    }
    
    if (this.metrics.tripleCount > this.config.maxTriples) {
      issues.push('Too many knowledge triples');
      recommendations.push('Clean up old triples or increase limit');
    }
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.length > 0) {
      status = issues.length > 2 ? 'critical' : 'warning';
    }
    
    return { status, issues, recommendations };
  }

  /**
   * Clear importance cache
   */
  clearCache(): void {
    this.importanceCache.clear();
  }

  /**
   * Get current metrics
   */
  getMetrics(): MemoryMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
