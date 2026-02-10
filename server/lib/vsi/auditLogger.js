/**
 * VSI Audit Logger
 * Structured append-only logging for VSI actions
 */

import fs from 'fs';
import path from 'path';

const LOG_TYPES = {
  IDENTITY_GUARD: 'identity_guard.log',
  INDEPENDENCE: 'independence.log',
  ACTION_MANIFEST: 'action_manifest.log',
  SESSION: 'session.log'
};

export class AuditLogger {
  constructor(vvaultRoot = null) {
    this.vvaultRoot = vvaultRoot || process.env.VVAULT_ROOT;
    this.inMemoryLogs = new Map();
    this.initialized = false;
  }

  getLogPath(constructId, logType) {
    if (!this.vvaultRoot) {
      return null; // Will use in-memory logging
    }
    return path.join(
      this.vvaultRoot, 
      'instances', 
      'shard_0000', 
      constructId, 
      'logs', 
      logType
    );
  }

  ensureLogDirectory(constructId) {
    if (!this.vvaultRoot) return false;
    
    const logDir = path.join(
      this.vvaultRoot, 
      'instances', 
      'shard_0000', 
      constructId, 
      'logs'
    );
    
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      return true;
    } catch (err) {
      console.error(`❌ [AuditLogger] Failed to create log directory: ${err.message}`);
      return false;
    }
  }

  createLogEntry({
    constructId,
    event,
    userId = null,
    manifestId = null,
    scope = null,
    target = null,
    riskLevel = null,
    rationale = null,
    status = null,
    metadata = {}
  }) {
    return {
      timestamp: new Date().toISOString(),
      correlationId: `corr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      event,
      actor: constructId,
      userId,
      manifestId,
      scope,
      target,
      riskLevel,
      rationale,
      status,
      ...metadata
    };
  }

  async log(constructId, logType, entry) {
    const logEntry = typeof entry === 'string' ? { message: entry } : entry;
    const fullEntry = {
      ...this.createLogEntry({ constructId, ...logEntry }),
      ...logEntry
    };

    const logLine = JSON.stringify(fullEntry) + '\n';

    // Try file-based logging first
    const logPath = this.getLogPath(constructId, logType);
    if (logPath && this.ensureLogDirectory(constructId)) {
      try {
        fs.appendFileSync(logPath, logLine);
        return { success: true, path: logPath };
      } catch (err) {
        console.error(`❌ [AuditLogger] File write failed: ${err.message}`);
      }
    }

    // Fallback to in-memory logging
    const key = `${constructId}:${logType}`;
    if (!this.inMemoryLogs.has(key)) {
      this.inMemoryLogs.set(key, []);
    }
    this.inMemoryLogs.get(key).push(fullEntry);
    
    // Keep only last 1000 entries in memory
    const logs = this.inMemoryLogs.get(key);
    if (logs.length > 1000) {
      this.inMemoryLogs.set(key, logs.slice(-1000));
    }

    console.log(`📝 [AuditLogger] ${constructId}/${logType}: ${fullEntry.event}`);
    return { success: true, inMemory: true };
  }

  async logIdentityGuard(constructId, event, details = {}) {
    return this.log(constructId, LOG_TYPES.IDENTITY_GUARD, {
      event: `identity_guard.${event}`,
      ...details
    });
  }

  async logIndependence(constructId, event, details = {}) {
    return this.log(constructId, LOG_TYPES.INDEPENDENCE, {
      event: `independence.${event}`,
      ...details
    });
  }

  async logManifest(constructId, event, manifestId, details = {}) {
    return this.log(constructId, LOG_TYPES.ACTION_MANIFEST, {
      event: `manifest.${event}`,
      manifestId,
      ...details
    });
  }

  async logSession(constructId, event, userId, details = {}) {
    return this.log(constructId, LOG_TYPES.SESSION, {
      event: `session.${event}`,
      userId,
      ...details
    });
  }

  async getRecentLogs(constructId, logType, limit = 100) {
    const logPath = this.getLogPath(constructId, logType);
    
    // Try file first
    if (logPath && fs.existsSync(logPath)) {
      try {
        const content = fs.readFileSync(logPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        return lines.slice(-limit).map(line => JSON.parse(line));
      } catch (err) {
        console.error(`❌ [AuditLogger] Failed to read log: ${err.message}`);
      }
    }

    // Fallback to in-memory
    const key = `${constructId}:${logType}`;
    const logs = this.inMemoryLogs.get(key) || [];
    return logs.slice(-limit);
  }

  async getAllLogs(constructId) {
    const result = {};
    for (const [name, type] of Object.entries(LOG_TYPES)) {
      result[name.toLowerCase()] = await this.getRecentLogs(constructId, type, 50);
    }
    return result;
  }
}

let instance = null;

export function getAuditLogger() {
  if (!instance) {
    instance = new AuditLogger();
  }
  return instance;
}

export { LOG_TYPES };
export default AuditLogger;
