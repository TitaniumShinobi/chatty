export type User = { sub: string; email: string; name: string; picture?: string };

export async function fetchMe() {
  const r = await fetch("/api/me", { credentials: "include" });
  if (!r.ok) return null;
  const j = await r.json();
  return j.ok ? j.user : null;
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
    return data.user || null;
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
    return data.user || null;
  } catch (error) {
    console.error("Signup error:", error);
    return null;
  }
}

export async function logout() {
  await fetch("/api/logout", { method: "POST", credentials: "include" });
  window.location.reload();
}
