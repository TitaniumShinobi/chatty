import { resolveRuntimeHandshakeConfig } from "./runtimeHandshakeConfig.js";

function normalizeOrigin(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveRuntimeConfig(configOrEnv = process.env) {
  return configOrEnv && typeof configOrEnv === "object" && "environment" in configOrEnv
    ? configOrEnv
    : resolveRuntimeHandshakeConfig(configOrEnv);
}

export function isSharedAuthBrowserLoginEnabled(configOrEnv = process.env) {
  const config = resolveRuntimeConfig(configOrEnv);
  return Boolean(
    config.enableSharedAuthBrowserLogin &&
    config.authPublicOrigin &&
    config.authApiBaseUrl,
  );
}

export function shouldDelegateGoogleBrowserAuth(configOrEnv = process.env, options = {}) {
  if (!isSharedAuthBrowserLoginEnabled(configOrEnv)) return false;
  return !options.cliCallback;
}

export function buildSharedAuthDelegationUrl(configOrEnv = process.env, pathname, options = {}) {
  const config = resolveRuntimeConfig(configOrEnv);
  if (!config.authPublicOrigin) {
    throw new Error("Shared auth public origin is not configured");
  }

  const url = new URL(pathname, config.authPublicOrigin);
  const origin = normalizeOrigin(options.origin);
  if (origin) {
    url.searchParams.set("origin", origin);
  }
  return url;
}

export function getResponseSetCookieHeaders(response) {
  if (!response?.headers) return [];
  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    return Array.isArray(cookies) ? cookies.filter(Boolean) : [];
  }
  if (typeof response.headers.raw === "function") {
    const raw = response.headers.raw();
    const cookies = raw?.["set-cookie"];
    return Array.isArray(cookies) ? cookies.filter(Boolean) : [];
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}
