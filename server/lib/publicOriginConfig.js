function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseHttpUrl(value) {
  const candidate = trimString(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function isLocalhostHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLocalUrl(value) {
  const parsed = parseHttpUrl(value);
  return parsed ? isLocalhostHostname(parsed.hostname) : false;
}

function normalizeOriginString(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  return parsed.origin;
}

function buildHttpsOriginFromDomain(domain) {
  const trimmed = trimString(domain);
  return trimmed ? `https://${trimmed}` : null;
}

export function resolveConfiguredPublicOrigin(env = process.env) {
  const candidates = [
    env.PUBLIC_APP_URL,
    env.FRONTEND_URL,
    env.POST_LOGIN_REDIRECT,
    env.PUBLIC_CALLBACK_BASE,
    buildHttpsOriginFromDomain(env.CANONICAL_DOMAIN),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOriginString(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function resolveConfiguredCallbackBase(env = process.env) {
  const candidates = [
    env.PUBLIC_CALLBACK_BASE,
    env.PUBLIC_APP_URL,
    env.FRONTEND_URL,
    env.POST_LOGIN_REDIRECT,
    buildHttpsOriginFromDomain(env.CANONICAL_DOMAIN),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOriginString(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function resolveConfiguredCanonicalDomain(env = process.env) {
  const explicit = trimString(env.CANONICAL_DOMAIN);
  if (explicit) return explicit;

  const parsed =
    parseHttpUrl(env.PUBLIC_APP_URL) ||
    parseHttpUrl(env.FRONTEND_URL) ||
    parseHttpUrl(env.POST_LOGIN_REDIRECT) ||
    parseHttpUrl(env.PUBLIC_CALLBACK_BASE);

  return parsed?.hostname || null;
}

export function resolveConfiguredCookieDomain(env = process.env) {
  const explicit = trimString(env.COOKIE_DOMAIN);
  if (explicit) return explicit;

  const canonical = resolveConfiguredCanonicalDomain(env);
  if (canonical && !isLocalhostHostname(canonical)) return canonical;
  return undefined;
}

export function assertProductionPublicOriginSafety(env = process.env) {
  const callbackBase = resolveConfiguredCallbackBase(env);
  const publicOrigin = resolveConfiguredPublicOrigin(env);
  const problems = [];

  if (!callbackBase) {
    problems.push("PUBLIC_CALLBACK_BASE");
  } else if (isLocalUrl(callbackBase)) {
    problems.push("PUBLIC_CALLBACK_BASE_localhost");
  }

  if (!publicOrigin) {
    problems.push("FRONTEND_URL_or_PUBLIC_APP_URL");
  } else if (isLocalUrl(publicOrigin)) {
    problems.push("PUBLIC_ORIGIN_localhost");
  }

  return {
    ok: problems.length === 0,
    callbackBase,
    publicOrigin,
    problems,
  };
}

export function isConfiguredCanonicalOrigin(origin, env = process.env) {
  const normalized = normalizeOriginString(origin);
  if (!normalized) return false;
  return normalized === resolveConfiguredPublicOrigin(env);
}
