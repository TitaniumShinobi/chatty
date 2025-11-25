/**
 * Context Lock Mechanism
 * 
 * Locks persona based on dominant session context to prevent breaking character.
 * Ensures persona continuity across message boundaries.
 */

import type { PersonaSignal } from './PersonaDetectionEngine';

export interface ContextLock {
  personaSignal: PersonaSignal;
  lockedAt: number;
  messageCount: number;
  maxMessages?: number; // Lock duration in messages (undefined = until explicit unlock)
  remainingMessages?: number; // Calculated: maxMessages - messageCount
  reason: string;
  evidence: string[];
}

export class ContextLockManager {
  private activeLocks: Map<string, ContextLock> = new Map();
  private readonly DEFAULT_LOCK_DURATION = 10; // Default: lock for 10 messages

  /**
   * Lock persona based on signal
   */
  lockPersona(
    personaSignal: PersonaSignal,
    threadId: string,
    duration?: number,
    reason?: string
  ): ContextLock {
    const maxMessages = duration || this.DEFAULT_LOCK_DURATION;
    const lock: ContextLock = {
      personaSignal,
      lockedAt: Date.now(),
      messageCount: 0,
      maxMessages,
      remainingMessages: maxMessages,
      reason: reason || 'Dominant workspace context detected',
      evidence: personaSignal.evidence.slice(0, 5)
    };

    this.activeLocks.set(threadId, lock);
    return lock;
  }

  /**
   * Determine if persona should be locked
   */
  shouldLockPersona(
    personaSignal: PersonaSignal,
    currentPersona: string,
    threadId: string
  ): boolean {
    // Check if already locked
    const existingLock = this.activeLocks.get(threadId);
    if (existingLock) {
      // If locked to same persona, maintain lock
      if (existingLock.personaSignal.constructId === personaSignal.constructId) {
        return true;
      }
      // If locked to different persona, check if new signal is stronger
      if (personaSignal.confidence > existingLock.personaSignal.confidence + 0.2) {
        // New signal is significantly stronger, allow re-lock
        return true;
      }
      // Otherwise maintain existing lock
      return false;
    }

    // Lock if high confidence and strong relationship anchors
    const hasStrongAnchors = personaSignal.relationshipAnchors.some(
      a => a.significance > 0.8
    );
    const hasHighConfidence = personaSignal.confidence > 0.75;
    
    // Also lock if persona is different from current and signal is strong
    const isDifferentPersona = personaSignal.constructId !== currentPersona;
    
    return (hasHighConfidence && hasStrongAnchors) || 
           (isDifferentPersona && personaSignal.confidence > 0.8);
  }

  /**
   * Get active lock for thread
   */
  getLock(threadId: string): ContextLock | null {
    const lock = this.activeLocks.get(threadId);
    if (!lock) return null;

    // Update remaining messages
    if (lock.maxMessages !== undefined) {
      lock.remainingMessages = Math.max(0, lock.maxMessages - lock.messageCount);
    }

    // Check if lock has expired (by message count)
    if (lock.maxMessages !== undefined && lock.messageCount >= lock.maxMessages) {
      this.activeLocks.delete(threadId);
      return null;
    }

    return lock;
  }

  /**
   * Increment message count for lock
   */
  incrementMessageCount(threadId: string): void {
    const lock = this.activeLocks.get(threadId);
    if (lock) {
      lock.messageCount++;
      
      // Update remaining messages
      if (lock.maxMessages !== undefined) {
        lock.remainingMessages = Math.max(0, lock.maxMessages - lock.messageCount);
      }
      
      // Auto-unlock if duration exceeded
      if (lock.maxMessages !== undefined && lock.messageCount >= lock.maxMessages) {
        this.activeLocks.delete(threadId);
      }
    }
  }

  /**
   * Explicitly unlock persona
   */
  unlockPersona(threadId: string): boolean {
    return this.activeLocks.delete(threadId);
  }

  /**
   * Check if lock is active and should be enforced
   */
  isLocked(threadId: string): boolean {
    return this.getLock(threadId) !== null;
  }

  /**
   * Get locked persona signal
   */
  getLockedPersona(threadId: string): PersonaSignal | null {
    const lock = this.getLock(threadId);
    return lock ? lock.personaSignal : null;
  }

  /**
   * Clear all locks (useful for testing)
   */
  clearAllLocks(): void {
    this.activeLocks.clear();
  }

  /**
   * Clear lock for specific thread
   */
  clearLock(threadId: string): void {
    this.activeLocks.delete(threadId);
  }
}

// Singleton instance
export const contextLockManager = new ContextLockManager();
