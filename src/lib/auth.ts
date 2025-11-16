import { fetchWithRetry } from './backendReady';

export type User = { sub: string; email: string; name: string; picture?: string; id?: string; uid?: string };

// Helper function to get user ID with fallbacks
export function getUserId(user: User): string {
  return user.sub || user.id || user.email || 'unknown';
}

export async function fetchMe() {
  // Check localStorage first for cached session (instant, no backend needed)
  try {
    const cachedSession = localStorage.getItem('auth:session');
    if (cachedSession) {
      const sessionData = JSON.parse(cachedSession);
      if (sessionData?.user) {
        const user = sessionData.user;
        console.log(`⚡ fetchMe: Using cached session - ${user.email} (ID: ${user.sub || user.id || user.email})`);
        
        // Return cached session immediately, verify with backend in background
        verifySessionInBackground(user);
        return user;
      }
    }
  } catch (error) {
    // Invalid cache, continue to API check
    console.warn('⚠️ fetchMe: Invalid cached session, checking API');
  }

  // No cached session, check API
  try {
    // Use retry logic to handle connection errors during startup
    const r = await fetchWithRetry("/api/me", { credentials: "include" });
    
    if (!r.ok) {
      console.log('🚫 fetchMe: No valid session found');
      // Clear invalid cache
      localStorage.removeItem('auth:session');
      return null;
    }
    
    const j = await r.json();
    if (j.ok && j.user) {
      console.log(`✅ fetchMe: User session found - ${j.user.email} (ID: ${j.user.sub || j.user.id || j.user.email})`);
      
      // Ensure user has a sub field (fallback to id or email)
      const user = {
        ...j.user,
        sub: j.user.sub || j.user.id || j.user.email
      };
      
      // Warn if fallback was needed
      if (!j.user.sub) {
        console.warn('⚠️ User missing sub field, using fallback:', {
          original: j.user,
          fixed: user
        });
      }
      
      // Store session in localStorage for persistence
      localStorage.setItem('auth:session', JSON.stringify({ user }));
    
      return user;
    }
    console.log('🚫 fetchMe: Invalid response format');
    // Clear invalid cache
    localStorage.removeItem('auth:session');
    return null;
  } catch (error) {
    // Check if it's a connection error (backend not ready)
    const isConnectionError = 
      error instanceof TypeError && 
      (error.message.includes('Failed to fetch') || 
       error.message.includes('ECONNREFUSED') ||
       error.message.includes('NetworkError'));
    
    if (isConnectionError) {
      // If we have a cached session, use it even if backend isn't ready
      const cachedSession = localStorage.getItem('auth:session');
      if (cachedSession) {
        try {
          const sessionData = JSON.parse(cachedSession);
          if (sessionData?.user) {
            console.log(`⚡ fetchMe: Backend not ready, using cached session - ${sessionData.user.email}`);
            return sessionData.user;
          }
        } catch {
          // Invalid cache, continue
        }
      }
      console.warn('⚠️ fetchMe: Backend not ready yet, no cached session available');
    } else {
      console.error('❌ fetchMe error:', error);
    }
    return null;
  }
}

/**
 * Verify session with backend in background (non-blocking)
 */
async function verifySessionInBackground(user: User): Promise<void> {
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    if (r.ok) {
      const j = await r.json();
      if (j.ok && j.user) {
        // Update cache with fresh data
        const freshUser = {
          ...j.user,
          sub: j.user.sub || j.user.id || j.user.email
        };
        localStorage.setItem('auth:session', JSON.stringify({ user: freshUser }));
        console.log('✅ fetchMe: Session verified and cache updated');
      } else {
        // Session invalid, clear cache
        localStorage.removeItem('auth:session');
        console.warn('⚠️ fetchMe: Session invalid, cache cleared');
      }
    }
  } catch (error) {
    // Silently fail - verification is optional
    console.debug('ℹ️ fetchMe: Background verification failed (non-critical)');
  }
}

// Google Sign-In API implementation
declare global {
  interface Window {
    gapi: any;
  }
}

export function initializeGoogleSignIn() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google Sign-In can only be initialized in browser'));
      return;
    }

    // Load Google API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('auth2', () => {
        const auth2 = window.gapi.auth2.init({
          client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // Replace with actual client ID
          fetch_basic_profile: true
        });
        resolve(auth2);
      });
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function attachGoogleProfileImage() {
  return new Promise((resolve, reject) => {
    window.gapi.load('auth2', () => {
      const auth2 = window.gapi.auth2.init({
        client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // Replace with actual client ID
        fetch_basic_profile: true
      });
      
      auth2.then(() => {
        if (auth2.isSignedIn.get()) {
          const user = auth2.currentUser.get();
          const imageUrl = user.getBasicProfile().getImageUrl();
          resolve(imageUrl);
        } else {
          auth2.signIn().then(() => {
            const user = auth2.currentUser.get();
            const imageUrl = user.getBasicProfile().getImageUrl();
            resolve(imageUrl);
          }).catch(reject);
        }
      }).catch(reject);
    });
  });
}

export function loginWithGoogle() {
  // hard navigate so cookies flow through; rely on server redirect back
  window.location.href = "/api/auth/google";
}

export function loginWithMicrosoft() {
  // hard navigate so cookies flow through; rely on server redirect back
  window.location.href = "/api/auth/microsoft";
}

export function loginWithApple() {
  // hard navigate so cookies flow through; rely on server redirect back
  window.location.href = "/api/auth/apple";
}

export function loginWithGithub() {
  // hard navigate so cookies flow through; rely on server redirect back
  window.location.href = "/api/auth/github";
}

export async function loginWithEmail(email: string, password: string): Promise<User | null> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error("Login failed");
    }

    const data = await response.json();
    if (data.user) {
      // Ensure user has a sub field (fallback to id or email)
      const user = {
        ...data.user,
        sub: data.user.sub || data.user.id || data.user.email
      };
      
      // Store session in localStorage for persistence
      localStorage.setItem('auth:session', JSON.stringify({ user }));
      
      return user;
    }
    return null;
  } catch (error) {
    console.error("Login error:", error);
    return null;
  }
}

export async function signupWithEmail(email: string, password: string, confirmPassword: string, name: string, turnstileToken?: string): Promise<User | null> {
  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password, confirmPassword, name, turnstileToken }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Signup failed");
    }

    const data = await response.json();
    if (data.user) {
      // Ensure user has a sub field (fallback to id or email)
      const user = {
        ...data.user,
        sub: data.user.sub || data.user.id || data.user.email
      };
      
      // Store session in localStorage for persistence
      localStorage.setItem('auth:session', JSON.stringify({ user }));
      
      return user;
    }
    return null;
  } catch (error) {
    console.error("Signup error:", error);
    throw error; // Re-throw to let the UI handle the error
  }
}

export async function logout() {
  // Clear auth session from localStorage
  localStorage.removeItem('auth:session');
  
  await fetch("/api/logout", { method: "POST", credentials: "include" });
  window.location.reload();
}
