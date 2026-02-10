/**
 * Session Activity Tracker
 * 
 * Monitors user engagement and emits lifecycle events through EventBus.
 * Tracks session activity, detects idle states, and manages session cleanup.
 */

import { eventBus } from './eventBus';
import { determineSessionState, type SessionContext } from './timeAwareness';
import { shouldUseBrowserStubs } from './browserStubs';

export interface SessionData {
  sessionId: string;
  userId: string;
  threadId?: string;
  lastActivity: number;
  state: 'active' | 'idle';
  createdAt: number;
}

export interface SessionActivityTrackerConfig {
  idleTimeout?: number; // Default: 5 minutes (300000ms)
  checkInterval?: number; // Default: 1 minute (60000ms)
  cleanupThreshold?: number; // Default: 24 hours (86400000ms)
  maxSessions?: number; // Default: 1000
}

export class SessionActivityTracker {
  private static instance: SessionActivityTracker;
  private activeSessions: Map<string, SessionData> = new Map();
  private idleTimeout: number;
  private checkInterval: number;
  private cleanupThreshold: number;
  private maxSessions: number;
  private checkIntervalId: NodeJS.Timeout | null = null;
  private isBrowserEnvironment: boolean;

  private constructor(config: SessionActivityTrackerConfig = {}) {
    this.idleTimeout = config.idleTimeout ?? 300000; // 5 minutes
    this.checkInterval = config.checkInterval ?? 60000; // 1 minute
    this.cleanupThreshold = config.cleanupThreshold ?? 86400000; // 24 hours
    this.maxSessions = config.maxSessions ?? 1000;
    this.isBrowserEnvironment = shouldUseBrowserStubs();

    this.startPeriodicChecking();
  }

  static getInstance(config?: SessionActivityTrackerConfig): SessionActivityTracker {
    if (!SessionActivityTracker.instance) {
      SessionActivityTracker.instance = new SessionActivityTracker(config);
    }
    return SessionActivityTracker.instance;
  }

  /**
   * Update activity for a session
   * Emits session_active or session_resumed event based on previous state
   */
  updateActivity(
    sessionId: string,
    userId: string,
    threadId?: string
  ): void {
    const now = Date.now();
    const existingSession = this.activeSessions.get(sessionId);
    const wasIdle = existingSession?.state === 'idle';

    // Calculate idle duration if resuming from idle
    let idleDuration = 0;
    if (wasIdle && existingSession) {
      idleDuration = now - existingSession.lastActivity;
    }

    // Create or update session
    const sessionData: SessionData = {
      sessionId,
      userId,
      threadId,
      lastActivity: now,
      state: 'active',
      createdAt: existingSession?.createdAt ?? now
    };

    // Enforce max sessions limit
    if (!existingSession && this.activeSessions.size >= this.maxSessions) {
      this.cleanupOldestSessions();
    }

    this.activeSessions.set(sessionId, sessionData);

    // Emit appropriate event
    if (wasIdle) {
      eventBus.emit('session_resumed', {
        sessionId,
        userId,
        threadId,
        idleDuration,
        timestamp: now
      });
    } else {
      eventBus.emit('session_active', {
        sessionId,
        userId,
        threadId,
        timestamp: now
      });
    }
  }

  /**
   * Check all sessions for idle state transitions
   * Called periodically by the interval timer
   */
  checkSessions(): void {
    const now = Date.now();
    const sessionsToCheck = Array.from(this.activeSessions.entries());

    for (const [sessionId, session] of sessionsToCheck) {
      const timeSinceActivity = now - session.lastActivity;

      // Check if session should become idle
      if (session.state === 'active' && timeSinceActivity > this.idleTimeout) {
        session.state = 'idle';
        this.activeSessions.set(sessionId, session);

        eventBus.emit('session_idle', {
          sessionId,
          userId: session.userId,
          threadId: session.threadId,
          idleMs: timeSinceActivity,
          timestamp: now
        });
      }

      // Check if session should be cleaned up (long absence)
      if (timeSinceActivity > this.cleanupThreshold) {
        this.endSession(sessionId, 'long_absence');
      }
    }
  }

  /**
   * Explicitly end a session
   */
  endSession(sessionId: string, reason: 'timeout' | 'explicit' | 'long_absence' = 'explicit'): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    eventBus.emit('session_ended', {
      sessionId,
      userId: session.userId,
      threadId: session.threadId,
      reason,
      timestamp: Date.now()
    });

    this.activeSessions.delete(sessionId);
  }

  /**
   * Get current session state
   */
  getSessionState(sessionId: string): SessionData | null {
    return this.activeSessions.get(sessionId) ?? null;
  }

  /**
   * Get session state using time awareness calculations
   */
  getSessionContext(sessionId: string): SessionContext | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    return determineSessionState(session.lastActivity, Date.now());
  }

  /**
   * Start periodic checking for idle sessions
   */
  private startPeriodicChecking(): void {
    if (this.isBrowserEnvironment) {
      // Use setInterval in browser
      this.checkIntervalId = setInterval(() => {
        this.checkSessions();
      }, this.checkInterval) as unknown as NodeJS.Timeout;
    } else {
      // Use setInterval in Node.js
      this.checkIntervalId = setInterval(() => {
        this.checkSessions();
      }, this.checkInterval);
    }
  }

  /**
   * Stop periodic checking
   */
  stopPeriodicChecking(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  /**
   * Clean up oldest sessions when max limit is reached
   */
  private cleanupOldestSessions(): void {
    const sessions = Array.from(this.activeSessions.entries())
      .sort((a, b) => a[1].lastActivity - b[1].lastActivity);

    // Remove oldest 10% of sessions
    const toRemove = Math.max(1, Math.floor(this.maxSessions * 0.1));
    for (let i = 0; i < toRemove; i++) {
      const [sessionId, session] = sessions[i];
      this.endSession(sessionId, 'timeout');
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Map<string, SessionData> {
    return new Map(this.activeSessions);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Clear all sessions (for testing or reset)
   */
  clearAllSessions(): void {
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      this.endSession(sessionId, 'explicit');
    }
  }
}

// Export singleton instance
export const sessionActivityTracker = SessionActivityTracker.getInstance();

