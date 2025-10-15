// containmentManager.ts - Containment protocol for crisis management

import Database from 'better-sqlite3';
import path from 'node:path';

// Initialize database connection
const dbPath = path.resolve('./chatty.db');
const db = new Database(dbPath);

// Ensure the containment_state table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS containment_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    active INTEGER DEFAULT 0,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trigger_reason TEXT,
    resolved_at TIMESTAMP
  )
`);

// Prepared statements for performance
const insertContainment = db.prepare(`
  INSERT INTO containment_state (user_id, active, trigger_reason)
  VALUES (?, 1, ?)
`);

const checkContainment = db.prepare(`
  SELECT active, triggered_at, trigger_reason FROM containment_state
  WHERE user_id = ? AND active = 1
  ORDER BY triggered_at DESC
  LIMIT 1
`);

const resolveContainmentStmt = db.prepare(`
  UPDATE containment_state
  SET active = 0, resolved_at = CURRENT_TIMESTAMP
  WHERE user_id = ? AND active = 1
`);

const getContainmentHistoryStmt = db.prepare(`
  SELECT * FROM containment_state
  WHERE user_id = ?
  ORDER BY triggered_at DESC
  LIMIT ?
`);

const getAllActiveContainmentsStmt = db.prepare(`
  SELECT * FROM containment_state
  WHERE active = 1
  ORDER BY triggered_at DESC
`);

export interface ContainmentRecord {
  id: number;
  user_id: string;
  active: number;
  triggered_at: string;
  trigger_reason: string;
  resolved_at: string | null;
}

export interface ContainmentStatus {
  isContained: boolean;
  record?: ContainmentRecord;
  duration?: number; // in milliseconds
}

/**
 * Trigger a containment state for a given user_id and reason
 */
export function triggerContainment(userId: string, reason: string): void {
  if (!userId || typeof userId !== 'string') {
    throw new Error("userId is required and must be a string");
  }
  
  if (!reason || typeof reason !== 'string') {
    throw new Error("reason is required and must be a string");
  }

  // Check if user is already in containment
  const existing = checkContainment.get(userId);
  if (existing) {
    throw new Error(`User ${userId} is already in containment since ${existing.triggered_at}`);
  }

  try {
    insertContainment.run(userId, reason);
    console.log(`🚨 Containment triggered for user ${userId}: ${reason}`);
  } catch (error: any) {
    throw new Error(`Failed to trigger containment: ${error.message}`);
  }
}

/**
 * Check if a user is currently in containment
 */
export function isUserInContainment(userId: string): boolean {
  if (!userId || typeof userId !== 'string') {
    throw new Error("userId is required and must be a string");
  }

  try {
    const result = checkContainment.get(userId);
    return !!result;
  } catch (error: any) {
    console.error(`Error checking containment status: ${error.message}`);
    return false;
  }
}

/**
 * Get detailed containment status for a user
 */
export function getContainmentStatus(userId: string): ContainmentStatus {
  if (!userId || typeof userId !== 'string') {
    throw new Error("userId is required and must be a string");
  }

  try {
    const result = checkContainment.get(userId) as ContainmentRecord | undefined;
    
    if (!result) {
      return { isContained: false };
    }

    const duration = Date.now() - new Date(result.triggered_at).getTime();
    
    return {
      isContained: true,
      record: result,
      duration
    };
  } catch (error: any) {
    console.error(`Error getting containment status: ${error.message}`);
    return { isContained: false };
  }
}

/**
 * Resolve a containment state by setting active = 0 and resolved_at = CURRENT_TIMESTAMP
 */
export function resolveContainment(userId: string): void {
  if (!userId || typeof userId !== 'string') {
    throw new Error("userId is required and must be a string");
  }

  try {
    const result = resolveContainmentStmt.run(userId);
    
    if (result.changes === 0) {
      throw new Error(`No active containment found for user ${userId}`);
    }

    console.log(`✅ Containment resolved for user ${userId}`);
  } catch (error: any) {
    throw new Error(`Failed to resolve containment: ${error.message}`);
  }
}

/**
 * Get containment history for a user
 */
export function getContainmentHistory(userId: string, limit: number = 10): ContainmentRecord[] {
  if (!userId || typeof userId !== 'string') {
    throw new Error("userId is required and must be a string");
  }

  if (limit < 1 || limit > 100) {
    throw new Error("limit must be between 1 and 100");
  }

  try {
    const results = getContainmentHistoryStmt.all(userId, limit) as ContainmentRecord[];
    return results;
  } catch (error: any) {
    console.error(`Error getting containment history: ${error.message}`);
    return [];
  }
}

/**
 * Get all currently active containments
 */
export function getAllActiveContainments(): ContainmentRecord[] {
  try {
    const results = getAllActiveContainmentsStmt.all() as ContainmentRecord[];
    return results;
  } catch (error: any) {
    console.error(`Error getting active containments: ${error.message}`);
    return [];
  }
}

/**
 * Get containment statistics
 */
export function getContainmentStats(): {
  totalContainments: number;
  activeContainments: number;
  resolvedContainments: number;
  averageDuration: number;
} {
  try {
    const totalResult = db.prepare('SELECT COUNT(*) as count FROM containment_state').get() as { count: number };
    const activeResult = db.prepare('SELECT COUNT(*) as count FROM containment_state WHERE active = 1').get() as { count: number };
    const resolvedResult = db.prepare('SELECT COUNT(*) as count FROM containment_state WHERE active = 0 AND resolved_at IS NOT NULL').get() as { count: number };
    
    // Calculate average duration for resolved containments
    const durationResult = db.prepare(`
      SELECT AVG(
        (julianday(resolved_at) - julianday(triggered_at)) * 24 * 60 * 60 * 1000
      ) as avg_duration
      FROM containment_state 
      WHERE active = 0 AND resolved_at IS NOT NULL
    `).get() as { avg_duration: number | null };

    return {
      totalContainments: totalResult.count,
      activeContainments: activeResult.count,
      resolvedContainments: resolvedResult.count,
      averageDuration: durationResult.avg_duration || 0
    };
  } catch (error: any) {
    console.error(`Error getting containment stats: ${error.message}`);
    return {
      totalContainments: 0,
      activeContainments: 0,
      resolvedContainments: 0,
      averageDuration: 0
    };
  }
}

/**
 * Emergency function to resolve all containments (use with caution)
 */
export function resolveAllContainments(): number {
  try {
    const result = db.prepare(`
      UPDATE containment_state 
      SET active = 0, resolved_at = CURRENT_TIMESTAMP 
      WHERE active = 1
    `).run();

    console.log(`🚨 Emergency: Resolved ${result.changes} containments`);
    return result.changes;
  } catch (error: any) {
    throw new Error(`Failed to resolve all containments: ${error.message}`);
  }
}

/**
 * Check if containment should be automatically triggered based on crisis level
 */
export function shouldTriggerContainment(crisisLevel: string, emotionalWeight: number, userId: string): boolean {
  // Don't trigger if already contained
  if (isUserInContainment(userId)) {
    return false;
  }

  // Trigger for critical crisis
  if (crisisLevel === 'critical') {
    return true;
  }

  // Trigger for high crisis with sustained emotional weight
  if (crisisLevel === 'high' && emotionalWeight > 0.8) {
    return true;
  }

  // Trigger for multiple high emotional events in short time
  const recentHistory = getContainmentHistory(userId, 5);
  const recentHighEvents = recentHistory.filter(record => {
    const timeDiff = Date.now() - new Date(record.triggered_at).getTime();
    return timeDiff < 24 * 60 * 60 * 1000; // Within 24 hours
  });

  if (recentHighEvents.length >= 3) {
    return true;
  }

  return false;
}

/**
 * Format containment duration for display
 */
export function formatContainmentDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Close database connection on process exit
process.on('exit', () => {
  db.close();
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
