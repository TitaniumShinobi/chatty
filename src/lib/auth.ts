export type User = { sub: string; email: string; name: string; picture?: string };

export function getUserId(user: User | null | undefined): string | null {
  if (!user) return null;
  // Handle both User type (with sub) and any user object that might have id
  return (user as any).sub || (user as any).id || user.email || null;
}

export async function fetchMe() {
  const r = await fetch("/api/me", { credentials: "include" });
  if (!r.ok) return null;
  const j = await r.json();
  return j.ok ? j.user : null;
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
  // Check OAuth health before attempting login
  fetch("/api/auth/google/health")
    .then(r => r.json())
    .then(health => {
      if (!health.oauth_configured) {
        console.error('❌ [Auth] OAuth not properly configured:', health);
        alert('Google authentication is not properly configured. Please contact support.');
        return;
      }
  // hard navigate so cookies flow through; rely on server redirect back
  window.location.href = "/api/auth/google";
    })
    .catch(error => {
      console.error('❌ [Auth] Failed to check OAuth health:', error);
      // Proceed anyway - might be a temporary network issue
      window.location.href = "/api/auth/google";
    });
}

export function loginWithMicrosoft() {
  window.location.href = "/api/auth/microsoft";
}

export function loginWithApple() {
  window.location.href = "/api/auth/apple";
}

export function loginWithGithub() {
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
    return data.user || null;
  } catch (error) {
    console.error("Login error:", error);
    return null;
  }
}

export async function signupWithEmail(
  email: string, 
  password: string, 
  confirmPassword: string, 
  name: string, 
  turnstileToken?: string
): Promise<User | null> {
  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ 
        email, 
        password, 
        confirmPassword,
        name,
        turnstileToken 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Signup failed");
    }

    const data = await response.json();
    return data.user || null;
  } catch (error: any) {
    console.error("Signup error:", error);
    throw error; // Re-throw so App.tsx can handle the error message
  }
}

export async function logout() {
  await fetch("/api/logout", { method: "POST", credentials: "include" });
  window.location.href = "/";
}
