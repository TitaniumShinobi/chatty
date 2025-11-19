// Fingerprint Detection: Drift detection and fingerprint validation system
// Computes hashed fingerprints from persona configs, behavior patterns, and legal locks

import { constructRegistry } from '../state/constructs';
import db from '../lib/db';

export interface FingerprintComponents {
  personaConfig: string;
  roleLock: string;
  behaviorPattern: string;
  legalDocHash: string;
  lastAssistantPacket: string;
}

export interface DriftDetection {
  constructId: string;
  currentFingerprint: string;
  previousFingerprint: string;
  driftScore: number;
  detectedAt: number;
  components: {
    personaChanged: boolean;
    roleLockChanged: boolean;
    behaviorChanged: boolean;
    legalDocChanged: boolean;
  };
  metadata: Record<string, any>;
}

export class FingerprintDetector {
  private static instance: FingerprintDetector;
  private fingerprintCache = new Map<string, string>();

  static getInstance(): FingerprintDetector {
    if (!FingerprintDetector.instance) {
      FingerprintDetector.instance = new FingerprintDetector();
    }
    return FingerprintDetector.instance;
  }

  /**
   * Compute fingerprint for a construct
   */
  async computeFingerprint(constructId: string, components: Partial<FingerprintComponents> = {}): Promise<string> {
    try {
      const construct = await constructRegistry.getConstruct(constructId);
      if (!construct) {
        throw new Error(`Construct not found: ${constructId}`);
      }

      // Get current components
      const personaConfig = components.personaConfig || await this.getPersonaConfig(constructId);
      const roleLock = components.roleLock || JSON.stringify(construct.roleLock);
      const behaviorPattern = components.behaviorPattern || await this.getBehaviorPattern(constructId);
      const legalDocHash = components.legalDocHash || await this.getLegalDocHash(constructId);
      const lastAssistantPacket = components.lastAssistantPacket || await this.getLastAssistantPacket(constructId);

      // Create fingerprint components
      const fingerprintData = {
        personaConfig,
        roleLock,
        behaviorPattern,
        legalDocHash,
        lastAssistantPacket,
        timestamp: Date.now()
      };

      // Compute hash
      const fingerprint = await this.hashFingerprint(JSON.stringify(fingerprintData));
      
      // Cache fingerprint
      this.fingerprintCache.set(constructId, fingerprint);
      
      return fingerprint;
    } catch (error) {
      console.error('Failed to compute fingerprint:', error);
      throw error;
    }
  }

  /**
   * Detect drift by comparing current and previous fingerprints
   */
  async detectDrift(constructId: string): Promise<DriftDetection | null> {
    try {
      const currentFingerprint = await this.computeFingerprint(constructId);
      
      // Get previous fingerprint from database
      const stmt = db.prepare(`
        SELECT fingerprint, drift_score, detected_at, metadata
        FROM fingerprint_history 
        WHERE construct_id = ? 
        ORDER BY detected_at DESC 
        LIMIT 1
      `);
      
      const previousRecord = stmt.get(constructId);
      if (!previousRecord) {
        // First fingerprint - no drift to detect
        await this.recordFingerprint(constructId, currentFingerprint, 0);
        return null;
      }

      const previousFingerprint = previousRecord.fingerprint;
      const driftScore = this.calculateDriftScore(currentFingerprint, previousFingerprint);
      
      // Only report significant drift
      if (driftScore < 0.1) {
        return null;
      }

      // Analyze component changes
      const components = await this.analyzeComponentChanges(constructId, currentFingerprint, previousFingerprint);
      
      const driftDetection: DriftDetection = {
        constructId,
        currentFingerprint,
        previousFingerprint,
        driftScore,
        detectedAt: Date.now(),
        components,
        metadata: {
          previousDriftScore: previousRecord.drift_score,
          previousDetectedAt: previousRecord.detected_at,
          analysisTimestamp: Date.now()
        }
      };

      // Record the drift detection
      await this.recordDriftDetection(driftDetection);
      
      // Update construct fingerprint
      await constructRegistry.updateFingerprint(constructId, currentFingerprint);
      
      console.warn(`🚨 Drift detected for construct ${constructId}: score=${driftScore.toFixed(3)}`);
      return driftDetection;
    } catch (error) {
      console.error('Failed to detect drift:', error);
      return null;
    }
  }

  /**
   * Record fingerprint in history
   */
  private async recordFingerprint(constructId: string, fingerprint: string, driftScore: number): Promise<void> {
    try {
      const stmt = db.prepare(`
        INSERT INTO fingerprint_history (construct_id, fingerprint, drift_score, detected_at, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        constructId,
        fingerprint,
        driftScore,
        Date.now(),
        JSON.stringify({ type: 'initial_fingerprint' })
      );
    } catch (error) {
      console.error('Failed to record fingerprint:', error);
    }
  }

  /**
   * Record drift detection
   */
  private async recordDriftDetection(drift: DriftDetection): Promise<void> {
    try {
      const stmt = db.prepare(`
        INSERT INTO fingerprint_history (construct_id, fingerprint, drift_score, detected_at, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        drift.constructId,
        drift.currentFingerprint,
        drift.driftScore,
        drift.detectedAt,
        JSON.stringify(drift.metadata)
      );
    } catch (error) {
      console.error('Failed to record drift detection:', error);
    }
  }

  /**
   * Calculate drift score between two fingerprints
   */
  private calculateDriftScore(current: string, previous: string): number {
    // Simple Hamming distance for now - can be enhanced with more sophisticated algorithms
    if (current.length !== previous.length) {
      return 1.0; // Complete drift if lengths differ
    }
    
    let differences = 0;
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== previous[i]) {
        differences++;
      }
    }
    
    return differences / current.length;
  }

  /**
   * Analyze which components changed
   */
  private async analyzeComponentChanges(
    constructId: string, 
    currentFingerprint: string, 
    previousFingerprint: string
  ): Promise<DriftDetection['components']> {
    // This is a simplified analysis - in practice, you'd compare individual components
    const construct = await constructRegistry.getConstruct(constructId);
    if (!construct) {
      return {
        personaChanged: false,
        roleLockChanged: false,
        behaviorChanged: false,
        legalDocChanged: false
      };
    }

    // For now, we'll use a simple heuristic based on fingerprint similarity
    const driftScore = this.calculateDriftScore(currentFingerprint, previousFingerprint);
    const threshold = 0.3;
    
    return {
      personaChanged: driftScore > threshold,
      roleLockChanged: driftScore > threshold,
      behaviorChanged: driftScore > threshold,
      legalDocChanged: driftScore > threshold
    };
  }

  /**
   * Get persona configuration for fingerprinting
   */
  private async getPersonaConfig(constructId: string): Promise<string> {
    try {
      const stmt = db.prepare(`
        SELECT k, v FROM persona WHERE userId = ?
      `);
      
      const rows = stmt.all(constructId);
      const persona = rows.reduce((acc, row) => {
        acc[row.k] = row.v;
        return acc;
      }, {} as Record<string, any>);
      
      return JSON.stringify(persona, null, 2);
    } catch (error) {
      console.error('Failed to get persona config:', error);
      return '';
    }
  }

  /**
   * Get behavior pattern for fingerprinting
   */
  private async getBehaviorPattern(constructId: string): Promise<string> {
    try {
      // Get recent message patterns
      const stmt = db.prepare(`
        SELECT role, text, ts
        FROM vault_entries 
        WHERE construct_id = ? AND kind = 'LTM'
        ORDER BY ts DESC 
        LIMIT 20
      `);
      
      const rows = stmt.all(constructId);
      const patterns = rows.map(row => ({
        role: row.role,
        textLength: row.text?.length || 0,
        timestamp: row.ts
      }));
      
      return JSON.stringify(patterns, null, 2);
    } catch (error) {
      console.error('Failed to get behavior pattern:', error);
      return '';
    }
  }

  /**
   * Get legal document hash
   */
  private async getLegalDocHash(constructId: string): Promise<string> {
    try {
      const stmt = db.prepare(`
        SELECT legal_doc_sha256 FROM constructs WHERE id = ?
      `);
      
      const row = stmt.get(constructId);
      return row?.legal_doc_sha256 || '';
    } catch (error) {
      console.error('Failed to get legal doc hash:', error);
      return '';
    }
  }

  /**
   * Get last assistant packet for fingerprinting
   */
  private async getLastAssistantPacket(constructId: string): Promise<string> {
    try {
      const stmt = db.prepare(`
        SELECT payload, ts
        FROM vault_entries 
        WHERE construct_id = ? AND kind = 'LTM' AND JSON_EXTRACT(payload, '$.role') = 'assistant'
        ORDER BY ts DESC 
        LIMIT 1
      `);
      
      const row = stmt.get(constructId);
      return row?.payload || '';
    } catch (error) {
      console.error('Failed to get last assistant packet:', error);
      return '';
    }
  }

  /**
   * Hash fingerprint data
   */
  private async hashFingerprint(data: string): Promise<string> {
    // Use Web Crypto API if available, otherwise fallback to simple hash
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Fallback to simple hash for Node.js environments
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(16);
    }
  }

  /**
   * Get drift history for a construct
   */
  async getDriftHistory(constructId: string, limit = 10): Promise<DriftDetection[]> {
    try {
      const stmt = db.prepare(`
        SELECT fingerprint, drift_score, detected_at, metadata
        FROM fingerprint_history 
        WHERE construct_id = ? 
        ORDER BY detected_at DESC 
        LIMIT ?
      `);
      
      const rows = stmt.all(constructId, limit);
      
      return rows.map(row => ({
        constructId,
        currentFingerprint: row.fingerprint,
        previousFingerprint: '', // Would need to get from previous record
        driftScore: row.drift_score,
        detectedAt: row.detected_at,
        components: {
          personaChanged: false,
          roleLockChanged: false,
          behaviorChanged: false,
          legalDocChanged: false
        },
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      }));
    } catch (error) {
      console.error('Failed to get drift history:', error);
      return [];
    }
  }

  /**
   * Get drift statistics
   */
  async getDriftStats(): Promise<{
    totalDetections: number;
    highDriftCount: number;
    averageDriftScore: number;
    recentDetections: number;
  }> {
    try {
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM fingerprint_history');
      const totalResult = totalStmt.get();
      
      const highDriftStmt = db.prepare('SELECT COUNT(*) as count FROM fingerprint_history WHERE drift_score > 0.5');
      const highDriftResult = highDriftStmt.get();
      
      const avgStmt = db.prepare('SELECT AVG(drift_score) as avg FROM fingerprint_history');
      const avgResult = avgStmt.get();
      
      const recentStmt = db.prepare('SELECT COUNT(*) as count FROM fingerprint_history WHERE detected_at > ?');
      const recentResult = recentStmt.get(Date.now() - (24 * 60 * 60 * 1000)); // Last 24 hours
      
      return {
        totalDetections: totalResult.count,
        highDriftCount: highDriftResult.count,
        averageDriftScore: avgResult.avg || 0,
        recentDetections: recentResult.count
      };
    } catch (error) {
      console.error('Failed to get drift stats:', error);
      return {
        totalDetections: 0,
        highDriftCount: 0,
        averageDriftScore: 0,
        recentDetections: 0
      };
    }
  }
}

// Export singleton instance
export const fingerprintDetector = FingerprintDetector.getInstance();
