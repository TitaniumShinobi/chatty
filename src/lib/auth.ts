export type User = { sub: string; email: string; name: string; picture?: string };

// Helper function to get user ID with fallbacks
export function getUserId(user: User): string {
  return user.sub || user.id || user.email || 'unknown';
}

export async function fetchMe() {
  const r = await fetch("/api/me", { credentials: "include" });
  if (!r.ok) return null;
  const j = await r.json();
  if (j.ok && j.user) {
    // Ensure user has a sub field (fallback to id or email)
    const user = {
      ...j.user,
      sub: j.user.sub || j.user.id || j.user.email
    };
    
    // Store session in localStorage for persistence
    localStorage.setItem('auth:session', JSON.stringify({ user }));
    
    return user;
  }
  return null;
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

export async function signupWithEmail(email: string, password: string, name: string): Promise<User | null> {
  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      throw new Error("Signup failed");
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
    return null;
  }
}

export async function logout() {
  // Clear auth session from localStorage
  localStorage.removeItem('auth:session');
  
  await fetch("/api/logout", { method: "POST", credentials: "include" });
  window.location.reload();
}
