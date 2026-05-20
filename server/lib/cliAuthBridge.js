export function normalizeCliCallbackUrl(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  try {
    const url = new URL(rawValue.trim());
    const hostname = String(url.hostname || "").replace(/^\[(.*)\]$/, "$1").toLowerCase();

    if (url.protocol !== "http:") {
      return null;
    }

    if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      return null;
    }

    if (url.pathname !== "/cli-auth-callback") {
      return null;
    }

    if (!url.port) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function buildCliCallbackRedirect(cliCallbackUrl, params = {}) {
  const url = new URL(cliCallbackUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
