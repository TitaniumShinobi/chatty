// VaultSummarizer: Compressed checkpoints for memory management
// Implements periodic summarization to control memory growth

import { VaultStore, VaultSummary } from './VaultStore';
import { constructRegistry } from '../../state/constructs';

export interface SummaryConfig {
  maxEntriesBeforeSummary: number;
  summaryInterval: number; // milliseconds
  compressionRatio: number; // 0.1 = 10% of original size
  preserveRecentEntries: number; // Always keep N recent entries
}

export interface SummaryResult {
  summaryId: number;
  originalEntryCount: number;
  compressedEntryCount: number;
  compressionRatio: number;
  startTime: number;
  endTime: number;
  content: string;
}

export class VaultSummarizer {
  private static instance: VaultSummarizer;
  private summarySchedules = new Map<string, NodeJS.Timeout>();
  private defaultConfig: SummaryConfig = {
    maxEntriesBeforeSummary: 1000,
    summaryInterval: 24 * 60 * 60 * 1000, // 24 hours
    compressionRatio: 0.1,
    preserveRecentEntries: 50
  };

  static getInstance(): VaultSummarizer {
    if (!VaultSummarizer.instance) {
      VaultSummarizer.instance = new VaultSummarizer();
    }
    return VaultSummarizer.instance;
  }

  /**
   * Start automatic summarization for a construct
   */
  startSummarization(constructId: string, config: Partial<SummaryConfig> = {}): void {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    // Clear existing schedule
    this.stopSummarization(constructId);
    
    // Set up new schedule
    const interval = setInterval(async () => {
      await this.performSummarization(constructId, finalConfig);
    }, finalConfig.summaryInterval);
    
    this.summarySchedules.set(constructId, interval);
    console.log(`📊 Started summarization for construct: ${constructId} (interval: ${finalConfig.summaryInterval}ms)`);
  }

  /**
   * Stop automatic summarization for a construct
   */
  stopSummarization(constructId: string): void {
    const interval = this.summarySchedules.get(constructId);
    if (interval) {
      clearInterval(interval);
      this.summarySchedules.delete(constructId);
      console.log(`⏹️ Stopped summarization for construct: ${constructId}`);
    }
  }

  /**
   * Perform summarization for a construct
   */
  async performSummarization(constructId: string, config: SummaryConfig): Promise<SummaryResult | null> {
    try {
      const construct = await constructRegistry.getConstruct(constructId);
      if (!construct) {
        console.warn(`Construct not found for summarization: ${constructId}`);
        return null;
      }

      const vaultStore = construct.vaultStore;
      const stats = await vaultStore.getStats();
      
      // Check if summarization is needed
      if (stats.totalEntries < config.maxEntriesBeforeSummary) {
        console.log(`📊 Summarization not needed for construct ${constructId}: ${stats.totalEntries} entries`);
        return null;
      }

      console.log(`📊 Starting summarization for construct ${constructId}: ${stats.totalEntries} entries`);
      
      // Get entries to summarize
      const entries = await vaultStore.search({
        constructId,
        kind: 'LTM',
        limit: stats.totalEntries - config.preserveRecentEntries
      });

      if (entries.length === 0) {
        console.log(`📊 No entries to summarize for construct ${constructId}`);
        return null;
      }

      // Create summary content
      const summaryContent = await this.createSummaryContent(entries, config);
      
      // Create summary entry
      const startTime = Math.min(...entries.map(e => e.timestamp));
      const endTime = Math.max(...entries.map(e => e.timestamp));
      
      await vaultStore.createSummary(
        'AUTOMATIC',
        summaryContent,
        startTime,
        endTime
      );

      // Remove summarized entries (except recent ones)
      const entriesToRemove = entries.slice(0, -config.preserveRecentEntries);
      await this.removeSummarizedEntries(vaultStore, entriesToRemove);

      const result: SummaryResult = {
        summaryId: Date.now(),
        originalEntryCount: entries.length,
        compressedEntryCount: 1, // One summary entry
        compressionRatio: 1 / entries.length,
        startTime,
        endTime,
        content: summaryContent
      };

      console.log(`✅ Summarization completed for construct ${constructId}: ${result.originalEntryCount} → ${result.compressedEntryCount} entries`);
      return result;
    } catch (error) {
      console.error('Failed to perform summarization:', error);
      return null;
    }
  }

  /**
   * Create summary content from entries
   */
  private async createSummaryContent(entries: any[], config: SummaryConfig): Promise<string> {
    // Group entries by time periods
    const timeGroups = this.groupEntriesByTime(entries);
    
    const summaryParts: string[] = [];
    
    for (const [period, periodEntries] of timeGroups.entries()) {
      const periodSummary = await this.summarizePeriod(period, periodEntries, config);
      summaryParts.push(periodSummary);
    }
    
    return summaryParts.join('\n\n---\n\n');
  }

  /**
   * Group entries by time periods
   */
  private groupEntriesByTime(entries: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    
    for (const entry of entries) {
      const date = new Date(entry.timestamp);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      if (!groups.has(period)) {
        groups.set(period, []);
      }
      groups.get(period)!.push(entry);
    }
    
    return groups;
  }

  /**
   * Summarize a time period
   */
  private async summarizePeriod(period: string, entries: any[], config: SummaryConfig): Promise<string> {
    const userMessages = entries.filter(e => e.payload?.role === 'user').map(e => e.payload?.content || '');
    const assistantMessages = entries.filter(e => e.payload?.role === 'assistant').map(e => e.payload?.content || '');
    
    const summary = `
## ${period}

**Conversation Summary:**
- User messages: ${userMessages.length}
- Assistant responses: ${assistantMessages.length}
- Key topics discussed: ${this.extractKeyTopics(userMessages, assistantMessages).join(', ')}

**Recent User Inputs:**
${userMessages.slice(-5).map((msg, i) => `${i + 1}. ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`).join('\n')}

**Assistant Responses:**
${assistantMessages.slice(-3).map((msg, i) => `${i + 1}. ${msg.substring(0, 150)}${msg.length > 150 ? '...' : ''}`).join('\n')}
    `.trim();
    
    return summary;
  }

  /**
   * Extract key topics from messages
   */
  private extractKeyTopics(userMessages: string[], assistantMessages: string[]): string[] {
    const allText = [...userMessages, ...assistantMessages].join(' ').toLowerCase();
    
    // Simple keyword extraction - can be enhanced with NLP
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
    
    const words = allText.split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    return Object.entries(words)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Remove summarized entries from vault
   */
  private async removeSummarizedEntries(vaultStore: VaultStore, entries: any[]): Promise<void> {
    // This would need to be implemented in VaultStore
    // For now, we'll just log what would be removed
    console.log(`🗑️ Would remove ${entries.length} summarized entries`);
  }

  /**
   * Get summarization status for all constructs
   */
  async getSummarizationStatus(): Promise<Record<string, {
    isScheduled: boolean;
    lastSummary?: number;
    entryCount: number;
    nextSummary?: number;
  }>> {
    const status: Record<string, any> = {};
    
    try {
      const constructs = await constructRegistry.getAllConstructs();
      
      for (const construct of constructs) {
        const vaultStore = construct.vaultStore;
        const stats = await vaultStore.getStats();
        const summaries = await vaultStore.getVaultSummaryMeta();
        
        status[construct.id] = {
          isScheduled: this.summarySchedules.has(construct.id),
          lastSummary: summaries[0]?.createdAt,
          entryCount: stats.totalEntries,
          nextSummary: this.summarySchedules.has(construct.id) ? Date.now() + this.defaultConfig.summaryInterval : undefined
        };
      }
    } catch (error) {
      console.error('Failed to get summarization status:', error);
    }
    
    return status;
  }

  /**
   * Force summarization for a construct
   */
  async forceSummarization(constructId: string, config: Partial<SummaryConfig> = {}): Promise<SummaryResult | null> {
    const finalConfig = { ...this.defaultConfig, ...config };
    return await this.performSummarization(constructId, finalConfig);
  }

  /**
   * Cleanup old summaries
   */
  async cleanupOldSummaries(olderThanDays = 30): Promise<number> {
    try {
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      
      const stmt = db.prepare(`
        DELETE FROM vault_summaries 
        WHERE created_at < ?
      `);
      
      const result = stmt.run(cutoffTime);
      console.log(`🧹 Cleaned up ${result.changes} old summaries`);
      return result.changes;
    } catch (error) {
      console.error('Failed to cleanup old summaries:', error);
      return 0;
    }
  }

  /**
   * Get summarization statistics
   */
  async getStats(): Promise<{
    totalSchedules: number;
    totalSummaries: number;
    averageCompressionRatio: number;
    lastSummaryTime?: number;
  }> {
    try {
      const totalSchedules = this.summarySchedules.size;
      
      const summaryStmt = db.prepare('SELECT COUNT(*) as count FROM vault_summaries');
      const summaryResult = summaryStmt.get();
      
      const lastStmt = db.prepare('SELECT MAX(created_at) as last FROM vault_summaries');
      const lastResult = lastStmt.get();
      
      return {
        totalSchedules,
        totalSummaries: summaryResult.count,
        averageCompressionRatio: 0.1, // Would need to calculate from actual data
        lastSummaryTime: lastResult.last
      };
    } catch (error) {
      console.error('Failed to get summarization stats:', error);
      return {
        totalSchedules: 0,
        totalSummaries: 0,
        averageCompressionRatio: 0
      };
    }
  }
}

// Export singleton instance
export const vaultSummarizer = VaultSummarizer.getInstance();
