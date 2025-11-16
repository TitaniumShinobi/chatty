// SingletonThreadManager: Enforces single active thread per construct via leasing
// Implements thread integrity with lease tokens and expiration

import db from '../../lib/db';
import { constructRegistry } from '../../state/constructs';

export interface ThreadLease {
  id: string;
  constructId: string;
  threadId: string;
  leaseToken: string;
  expiresAt: number;
  createdAt: number;
}

export interface ThreadInfo {
  id: string;
  constructId: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export class SingletonThreadManager {
  private static instance: SingletonThreadManager;
  private activeLeases = new Map<string, ThreadLease>(); // key: constructId
  private leaseTokens = new Map<string, ThreadLease>(); // key: leaseToken

  static getInstance(): SingletonThreadManager {
    if (!SingletonThreadManager.instance) {
      SingletonThreadManager.instance = new SingletonThreadManager();
    }
    return SingletonThreadManager.instance;
  }

  /**
   * Create a new thread for a construct
   */
  async createThread(constructId: string, title?: string): Promise<ThreadInfo> {
    try {
      const threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();
      
      const stmt = db.prepare(`
        INSERT INTO threads (id, construct_id, title, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(threadId, constructId, title || null, now, now, 1);
      
      const threadInfo: ThreadInfo = {
        id: threadId,
        constructId,
        title,
        createdAt: now,
        updatedAt: now,
        isActive: true
      };
      
      console.log(`🧵 Created thread: ${threadId} for construct: ${constructId}`);
      return threadInfo;
    } catch (error) {
      console.error('Failed to create thread:', error);
      throw error;
    }
  }

  /**
   * Acquire a lease for a thread (enforces single active thread per construct)
   */
  async acquireLease(constructId: string, threadId: string, durationMs = 300000): Promise<string> {
    try {
      // Check if construct exists
      const construct = await constructRegistry.getConstruct(constructId);
      if (!construct) {
        throw new Error(`Construct not found: ${constructId}`);
      }
      
      // Check if thread exists and belongs to construct
      const threadStmt = db.prepare(`
        SELECT id FROM threads 
        WHERE id = ? AND construct_id = ? AND is_active = 1
      `);
      const thread = threadStmt.get(threadId, constructId);
      if (!thread) {
        throw new Error(`Thread not found or inactive: ${threadId}`);
      }
      
      // Release any existing lease for this construct
      await this.releaseLease(constructId);
      
      // Create new lease
      const leaseId = `lease_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const leaseToken = `token_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
      const now = Date.now();
      const expiresAt = now + durationMs;
      
      const stmt = db.prepare(`
        INSERT INTO thread_leases (id, construct_id, thread_id, lease_token, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(leaseId, constructId, threadId, leaseToken, expiresAt, now);
      
      const lease: ThreadLease = {
        id: leaseId,
        constructId,
        threadId,
        leaseToken,
        expiresAt,
        createdAt: now
      };
      
      // Update caches
      this.activeLeases.set(constructId, lease);
      this.leaseTokens.set(leaseToken, lease);
      
      console.log(`🔐 Acquired lease: ${leaseToken} for thread: ${threadId} (expires: ${new Date(expiresAt).toISOString()})`);
      return leaseToken;
    } catch (error) {
      console.error('Failed to acquire lease:', error);
      throw error;
    }
  }

  /**
   * Release a lease
   */
  async releaseLease(constructId: string, leaseToken?: string): Promise<void> {
    try {
      let lease: ThreadLease | undefined;
      
      if (leaseToken) {
        lease = this.leaseTokens.get(leaseToken);
      } else {
        lease = this.activeLeases.get(constructId);
      }
      
      if (!lease) {
        console.warn(`No active lease found for construct: ${constructId}`);
        return;
      }
      
      // Remove from database
      const stmt = db.prepare(`
        DELETE FROM thread_leases 
        WHERE id = ? AND construct_id = ?
      `);
      
      stmt.run(lease.id, constructId);
      
      // Update caches
      this.activeLeases.delete(constructId);
      this.leaseTokens.delete(lease.leaseToken);
      
      console.log(`🔓 Released lease: ${lease.leaseToken} for construct: ${constructId}`);
    } catch (error) {
      console.error('Failed to release lease:', error);
      throw error;
    }
  }

  /**
   * Validate a lease token
   */
  validateLease(leaseToken: string): ThreadLease | null {
    const lease = this.leaseTokens.get(leaseToken);
    if (!lease) {
      return null;
    }
    
    // Check if lease has expired
    if (Date.now() > lease.expiresAt) {
      console.warn(`Lease expired: ${leaseToken}`);
      this.leaseTokens.delete(leaseToken);
      this.activeLeases.delete(lease.constructId);
      return null;
    }
    
    return lease;
  }

  /**
   * Get active thread for a construct
   */
  getActiveThread(constructId: string): ThreadInfo | null {
    const lease = this.activeLeases.get(constructId);
    if (!lease) {
      return null;
    }
    
    // Validate lease is still active
    if (Date.now() > lease.expiresAt) {
      console.warn(`Active lease expired for construct: ${constructId}`);
      this.activeLeases.delete(constructId);
      this.leaseTokens.delete(lease.leaseToken);
      return null;
    }
    
    try {
      const stmt = db.prepare(`
        SELECT id, construct_id, title, created_at, updated_at, is_active
        FROM threads 
        WHERE id = ? AND construct_id = ?
      `);
      
      const row = stmt.get(lease.threadId, constructId);
      if (!row) {
        return null;
      }
      
      return {
        id: row.id,
        constructId: row.construct_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: Boolean(row.is_active)
      };
    } catch (error) {
      console.error('Failed to get active thread:', error);
      return null;
    }
  }

  /**
   * Get all threads for a construct
   */
  async getThreads(constructId: string): Promise<ThreadInfo[]> {
    try {
      const stmt = db.prepare(`
        SELECT id, construct_id, title, created_at, updated_at, is_active
        FROM threads 
        WHERE construct_id = ?
        ORDER BY updated_at DESC
      `);
      
      const rows = stmt.all(constructId);
      
      return rows.map(row => ({
        id: row.id,
        constructId: row.construct_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: Boolean(row.is_active)
      }));
    } catch (error) {
      console.error('Failed to get threads:', error);
      return [];
    }
  }

  /**
   * Update thread title
   */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE threads 
        SET title = ?, updated_at = ? 
        WHERE id = ?
      `);
      
      stmt.run(title, Date.now(), threadId);
      console.log(`📝 Updated thread title: ${threadId} -> ${title}`);
    } catch (error) {
      console.error('Failed to update thread title:', error);
      throw error;
    }
  }

  /**
   * Deactivate a thread
   */
  async deactivateThread(threadId: string): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE threads 
        SET is_active = 0, updated_at = ? 
        WHERE id = ?
      `);
      
      stmt.run(Date.now(), threadId);
      
      // Release any active lease for this thread
      const lease = Array.from(this.activeLeases.values()).find(l => l.threadId === threadId);
      if (lease) {
        await this.releaseLease(lease.constructId, lease.leaseToken);
      }
      
      console.log(`🔒 Deactivated thread: ${threadId}`);
    } catch (error) {
      console.error('Failed to deactivate thread:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired leases
   */
  async cleanupExpiredLeases(): Promise<number> {
    try {
      const now = Date.now();
      
      const stmt = db.prepare(`
        DELETE FROM thread_leases 
        WHERE expires_at < ?
      `);
      
      const result = stmt.run(now);
      
      // Update caches
      for (const [constructId, lease] of this.activeLeases.entries()) {
        if (lease.expiresAt < now) {
          this.activeLeases.delete(constructId);
          this.leaseTokens.delete(lease.leaseToken);
        }
      }
      
      console.log(`🧹 Cleaned up ${result.changes} expired leases`);
      return result.changes;
    } catch (error) {
      console.error('Failed to cleanup expired leases:', error);
      return 0;
    }
  }

  /**
   * Get lease statistics
   */
  getStats(): {
    activeLeases: number;
    totalLeases: number;
    expiredLeases: number;
  } {
    try {
      const activeCount = this.activeLeases.size;
      
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM thread_leases');
      const totalResult = totalStmt.get();
      
      const expiredStmt = db.prepare('SELECT COUNT(*) as count FROM thread_leases WHERE expires_at < ?');
      const expiredResult = expiredStmt.get(Date.now());
      
      return {
        activeLeases: activeCount,
        totalLeases: totalResult.count,
        expiredLeases: expiredResult.count
      };
    } catch (error) {
      console.error('Failed to get lease stats:', error);
      return {
        activeLeases: 0,
        totalLeases: 0,
        expiredLeases: 0
      };
    }
  }
}

// Export singleton instance
export const threadManager = SingletonThreadManager.getInstance();
