export type User = {
  sub: string;
  id?: string;
  email: string;
  name: string;
  picture?: string;
  authSource?: string | null;
  vvaultReady?: boolean;
  vvaultSession?: {
    ready: boolean;
    authSource?: string | null;
    vvaultUserId?: string | null;
    supabaseUserId?: string | null;
    reason?: string | null;
  };
};

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
  const loginUrl = buildGoogleLoginUrl();
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
  window.location.href = loginUrl;
    })
    .catch(error => {
      console.error('❌ [Auth] Failed to check OAuth health:', error);
      // Proceed anyway - might be a temporary network issue
      window.location.href = loginUrl;
    });
}

export function buildGoogleLoginUrl(currentHref?: string) {
  const currentUrl =
    typeof currentHref === "string" && currentHref.trim()
      ? new URL(currentHref)
      : new URL(window.location.href);
  if (isPublicChattyUrl(currentUrl)) {
    const loginUrl = new URL("/api/auth/google", resolveAuthPublicOrigin(currentUrl.href));
    loginUrl.searchParams.set("origin", currentUrl.origin);
    return loginUrl.toString();
  }
  const loginUrl = new URL("/api/auth/google", currentUrl.origin);
  const cliCallback = currentUrl.searchParams.get("cli_callback");
  if (cliCallback) {
    loginUrl.searchParams.set("cli_callback", cliCallback);
  }
  return `${loginUrl.pathname}${loginUrl.search}`;
}

export function loginWithMicrosoft() {
  if (isPublicChattyUrl()) {
    window.location.href = buildHostedProviderLoginUrl("microsoft");
    return;
  }
  window.location.href = "/api/auth/microsoft";
}

export function loginWithApple() {
  if (isPublicChattyUrl()) {
    window.location.href = buildHostedProviderLoginUrl("apple");
    return;
  }
  window.location.href = "/api/auth/apple";
}

export function loginWithGithub() {
  if (isPublicChattyUrl()) {
    window.location.href = buildHostedProviderLoginUrl("github");
    return;
  }
  window.location.href = "/api/auth/github";
}

function getRuntimeEnv(): Record<string, any> {
  try {
    return (0, eval)('typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}');
  } catch {
    return typeof process !== "undefined" && process.env ? process.env : {};
  }
}

function resolveAuthPublicOrigin(currentHref?: string) {
  const env = getRuntimeEnv();
  const configured =
    typeof env.VITE_AUTH_PUBLIC_ORIGIN === "string" && env.VITE_AUTH_PUBLIC_ORIGIN.trim()
      ? env.VITE_AUTH_PUBLIC_ORIGIN.trim()
      : "";
  if (configured) return configured.replace(/\/+$/, "");

  const href =
    typeof currentHref === "string" && currentHref.trim()
      ? currentHref
      : typeof window !== "undefined"
        ? window.location.href
        : "";
  try {
    const currentUrl = new URL(href);
    if (currentUrl.hostname === "chatty.thewreck.org") return "https://auth.thewreck.org";
  } catch {
    // fall through to local auth default
  }
  return "http://localhost:1111";
}

function isPublicChattyUrl(currentUrl?: URL) {
  const url =
    currentUrl ||
    (typeof window !== "undefined" && window.location?.href
      ? new URL(window.location.href)
      : null);
  return url?.hostname === "chatty.thewreck.org";
}

function buildHostedProviderLoginUrl(provider: string, currentHref?: string) {
  const href =
    typeof currentHref === "string" && currentHref.trim()
      ? currentHref
      : window.location.href;
  const currentUrl = new URL(href);
  const loginUrl = new URL(`/api/auth/${provider}`, resolveAuthPublicOrigin(href));
  loginUrl.searchParams.set("origin", currentUrl.origin);
  return loginUrl.toString();
}

export function buildHostedAuthUrl(
  mode: "login" | "signup",
  currentHref?: string,
  reason?: string,
) {
  const href =
    typeof currentHref === "string" && currentHref.trim()
      ? currentHref
      : window.location.href;
  const currentUrl = new URL(href);
  const hostedUrl = new URL("/", resolveAuthPublicOrigin(href));
  hostedUrl.searchParams.set("origin", currentUrl.origin);
  hostedUrl.searchParams.set("mode", mode);
  if (reason) {
    hostedUrl.searchParams.set("reason", reason);
  }
  return hostedUrl.toString();
}

function buildAuthApiUrl(pathname: string, currentHref?: string) {
  const href =
    typeof currentHref === "string" && currentHref.trim()
      ? currentHref
      : typeof window !== "undefined"
        ? window.location.href
        : "";
  if (href) {
    try {
      if (isPublicChattyUrl(new URL(href))) {
        return new URL(pathname, resolveAuthPublicOrigin(href)).toString();
      }
    } catch {
      // fall through to local Chatty API path
    }
  }
  return pathname;
}

export function buildHostedLogoutUrl(currentHref?: string) {
  const href =
    typeof currentHref === "string" && currentHref.trim()
      ? currentHref
      : window.location.href;
  const currentUrl = new URL(href);
  const logoutUrl = new URL("/api/auth/logout", resolveAuthPublicOrigin(href));
  logoutUrl.searchParams.set("origin", currentUrl.origin);
  return logoutUrl.toString();
}

export function buildAuthLogoutApiUrl(currentHref?: string) {
  return new URL("/api/auth/logout", resolveAuthPublicOrigin(currentHref)).toString();
}

export type EmailLoginResult =
  | { ok: true; user: User }
  | {
      ok: false;
      error: string;
      lifeRegistryMatch?: boolean;
      oauthOnly?: boolean;
      credentialLoginUnavailable?: boolean;
      authProvider?: string;
    };

export async function loginWithEmail(email: string, password: string): Promise<EmailLoginResult> {
  try {
    const response = await fetch(buildAuthApiUrl("/api/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok && data?.user) {
      return { ok: true, user: data.user as User };
    }
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "Login failed",
      lifeRegistryMatch: data?.lifeRegistryMatch === true,
      oauthOnly: data?.oauthOnly === true,
      credentialLoginUnavailable: data?.credentialLoginUnavailable === true,
      authProvider: typeof data?.authProvider === "string" ? data.authProvider : undefined,
    };
  } catch (error) {
    console.error("Login error:", error);
    return { ok: false, error: "Login failed" };
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
    const response = await fetch(buildAuthApiUrl("/api/auth/register"), {
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
  const authLogoutUrl = buildAuthLogoutApiUrl();
  clearLocalLogoutState();
  await clearLegacyChattySessionCookie();
  await clearCanonicalAuthSession(authLogoutUrl);
  await assertBrowserSessionSignedOutOrFallback();
  window.location.replace("/");
}

function clearLocalLogoutState() {
  if (typeof window === "undefined") return;
  try {
    for (const key of ["auth:session", "vvault_token", "vvault_user"]) {
      window.localStorage?.removeItem(key);
    }
  } catch {
    // Local state cleanup is best-effort; canonical logout is owned by Auth.
  }
}

async function clearLegacyChattySessionCookie() {
  if (typeof fetch !== "function") return;
  try {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
  } catch {
    // Auth owns canonical logout; this only clears the legacy Chatty cookie when reachable.
  }
}

async function clearCanonicalAuthSession(authLogoutUrl: string) {
  let response: Response;
  try {
    response = await fetch(authLogoutUrl, {
      method: "POST",
      credentials: "include",
    });
  } catch (cause) {
    console.error("❌ [Auth] Canonical auth logout request failed", {
      authLogoutUrl,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    throw new Error("Auth logout failed; canonical session may still be active.");
  }

  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean };
  if (!response.ok || payload.ok !== true) {
    console.error("❌ [Auth] Canonical auth logout failed", {
      status: response.status,
      authLogoutUrl,
    });
    throw new Error("Auth logout failed; canonical session may still be active.");
  }
}

async function assertBrowserSessionSignedOutOrFallback() {
  const response = await fetch("/api/me", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return;
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    user?: unknown;
  };
  if (payload.ok === true && payload.user) {
    const hostedLogoutUrl = buildHostedLogoutUrl();
    console.error("❌ [Auth] Browser session survived JSON logout; falling back to hosted auth logout.");
    window.location.replace(hostedLogoutUrl);
    throw new Error("Logout did not clear the active browser session.");
  }
}
