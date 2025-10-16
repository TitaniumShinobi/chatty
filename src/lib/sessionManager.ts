// src/lib/sessionManager.ts
import type { User } from './auth';
import { getUserId } from './auth';

export interface SessionData {
  user: User;
  timestamp: number;
  sessionId: string;
}

/**
 * Manages user sessions and ensures proper isolation
 */
export class SessionManager {
  private static instance: SessionManager;
  private currentSession: SessionData | null = null;
  
  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Initialize session from localStorage or API
   */
  async initializeSession(): Promise<User | null> {
    try {
      // Try to get session from localStorage first
      const storedSession = localStorage.getItem('auth:session');
      if (storedSession) {
        const sessionData = JSON.parse(storedSession);
        if (sessionData.user && this.isValidSession(sessionData)) {
          this.currentSession = {
            user: sessionData.user,
            timestamp: Date.now(),
            sessionId: this.generateSessionId()
          };
          return sessionData.user;
        }
      }

      // If no valid session, try to fetch from API
      const response = await fetch('/api/me', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.user) {
          const user = {
            ...data.user,
            sub: data.user.sub || data.user.id || data.user.email
          };
          
          // Store session
          this.setSession(user);
          return user;
        }
      }

      return null;
    } catch (error) {
      console.error('Session initialization failed:', error);
      return null;
    }
  }

  /**
   * Set current session
   */
  setSession(user: User): void {
    const sessionData = {
      user,
      timestamp: Date.now(),
      sessionId: this.generateSessionId()
    };

    this.currentSession = sessionData;
    localStorage.setItem('auth:session', JSON.stringify({ user }));
    
    console.log(`✅ Session set for user: ${user.email} (${getUserId(user)})`);
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionData | null {
    return this.currentSession;
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentSession?.user || null;
  }

  /**
   * Check if user has switched
   */
  hasUserSwitched(newUser: User): boolean {
    if (!this.currentSession) return false;
    
    const currentUserId = getUserId(this.currentSession.user);
    const newUserId = getUserId(newUser);
    
    return currentUserId !== newUserId;
  }

  /**
   * Clear current session
   */
  clearSession(): void {
    this.currentSession = null;
    localStorage.removeItem('auth:session');
    console.log('🧹 Session cleared');
  }

  /**
   * Validate session data
   */
  private isValidSession(sessionData: any): boolean {
    return (
      sessionData &&
      sessionData.user &&
      sessionData.user.email &&
      (sessionData.user.sub || sessionData.user.id || sessionData.user.email)
    );
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if session is expired (24 hours)
   */
  isSessionExpired(): boolean {
    if (!this.currentSession) return true;
    
    const now = Date.now();
    const sessionAge = now - this.currentSession.timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    return sessionAge > maxAge;
  }

  /**
   * Refresh session if needed
   */
  async refreshSessionIfNeeded(): Promise<User | null> {
    if (this.isSessionExpired()) {
      console.log('🔄 Session expired, refreshing...');
      this.clearSession();
      return await this.initializeSession();
    }
    
    return this.getCurrentUser();
  }

  /**
   * Get session info for debugging
   */
  getSessionInfo(): any {
    return {
      hasSession: !!this.currentSession,
      userId: this.currentSession ? getUserId(this.currentSession.user) : null,
      userEmail: this.currentSession?.user.email || null,
      sessionId: this.currentSession?.sessionId || null,
      timestamp: this.currentSession?.timestamp || null,
      isExpired: this.isSessionExpired()
    };
  }
}

// Export singleton instance
export const sessionManager = SessionManager.getInstance();
