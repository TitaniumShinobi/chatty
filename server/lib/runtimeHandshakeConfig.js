import {
  resolveConfiguredCallbackBase,
  resolveConfiguredCookieDomain,
  resolveConfiguredPublicOrigin,
} from "./publicOriginConfig.js";

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

function normalizeOrigin(value) {
  const parsed = parseHttpUrl(value);
  return parsed ? parsed.origin : null;
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isLocalOrigin(value) {
  const parsed = parseHttpUrl(value);
  return parsed ? isLoopbackHostname(parsed.hostname) : false;
}

function parseTargets(rawTargets) {
  const targets = [];
  for (const rawPart of String(rawTargets || "").split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const [nameRaw, originRaw, tokenRaw] = part.split("|");
    const name = trimString(nameRaw);
    const origin = normalizeOrigin(originRaw);
    const token = trimString(tokenRaw) || null;
    if (!name || !origin) continue;
    targets.push({ name, origin, token });
  }
  return targets;
}

function buildDefaultDevOrigins() {
  return [
    "http://localhost:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5000",
  ];
}

function dedupeOrigins(origins) {
  const values = new Set();
  for (const origin of origins) {
    const normalized = normalizeOrigin(origin);
    if (normalized) values.add(normalized);
  }
  return Array.from(values);
}

function buildVvaultTargets(env, isProduction) {
  const explicitTargets = parseTargets(env.VVAULT_TARGETS);
  if (explicitTargets.length > 0) {
    if (isProduction && explicitTargets.some((target) => isLocalOrigin(target.origin))) {
      return {
        targets: [],
        problems: ["VVAULT_TARGETS_localhost"],
      };
    }
    return { targets: explicitTargets, problems: [] };
  }

  const explicitOrigin = normalizeOrigin(
    env.VVAULT_API_BASE_URL || env.VVAULT_URL || env.VVAULT_BASE_URL,
  );

  if (explicitOrigin) {
    if (isProduction && isLocalOrigin(explicitOrigin)) {
      return {
        targets: [],
        problems: ["VVAULT_API_BASE_URL_localhost"],
      };
    }
    return {
      targets: [
        {
          name: isProduction ? "production" : "local",
          origin: explicitOrigin,
          token: trimString(env.VVAULT_SERVICE_TOKEN) || null,
        },
      ],
      problems: [],
    };
  }

  if (isProduction) {
    return {
      targets: [],
      problems: ["VVAULT_API_BASE_URL"],
    };
  }

  return {
    targets: [
      {
        name: "local",
        origin: "http://127.0.0.1:8000",
        token: trimString(env.VVAULT_SERVICE_TOKEN) || null,
      },
    ],
    problems: [],
  };
}

export function resolveRuntimeHandshakeConfig(env = process.env) {
  const isProduction = env.NODE_ENV === "production";
  const publicOrigin =
    resolveConfiguredPublicOrigin(env) ||
    (isProduction ? null : normalizeOrigin(env.FRONTEND_URL || env.PUBLIC_APP_URL) || "http://localhost:5173");
  const callbackBase =
    resolveConfiguredCallbackBase(env) ||
    (isProduction ? null : normalizeOrigin(env.PUBLIC_CALLBACK_BASE) || "http://localhost:5050");
  const authApiBaseUrl = normalizeOrigin(env.AUTH_API_BASE_URL) || (isProduction ? null : `http://127.0.0.1:${trimString(env.AUTH_PORT) || "1111"}`);
  const authCookieName = trimString(env.AUTH_COOKIE_NAME) || "auth_sid";
  const cookieDomain = resolveConfiguredCookieDomain(env);
  const allowLegacyVvaultExchange = trimString(env.VVAULT_ENABLE_LEGACY_CHATTY_SESSION_EXCHANGE).toLowerCase() === "true";
  const vvaultResult = buildVvaultTargets(env, isProduction);
  const vvaultTargets = vvaultResult.targets;
  const vvaultOrigin = vvaultTargets[0]?.origin || null;
  const vvaultApiBaseUrl = vvaultOrigin;
  const allowedBrowserOrigins = isProduction
    ? dedupeOrigins([publicOrigin, trimString(env.POST_LOGIN_REDIRECT)])
    : dedupeOrigins([publicOrigin, ...buildDefaultDevOrigins()]);

  const problems = [...vvaultResult.problems];
  if (isProduction) {
    if (!publicOrigin) problems.push("PUBLIC_ORIGIN");
    else if (isLocalOrigin(publicOrigin)) problems.push("PUBLIC_ORIGIN_localhost");

    if (!callbackBase) problems.push("PUBLIC_CALLBACK_BASE");
    else if (isLocalOrigin(callbackBase)) problems.push("PUBLIC_CALLBACK_BASE_localhost");

    if (!authApiBaseUrl) problems.push("AUTH_API_BASE_URL");
    else if (isLocalOrigin(authApiBaseUrl)) problems.push("AUTH_API_BASE_URL_localhost");

    if (allowedBrowserOrigins.some((origin) => isLocalOrigin(origin))) {
      problems.push("ALLOWED_BROWSER_ORIGINS_localhost");
    }
  }

  return {
    environment: isProduction ? "production" : "development",
    isProduction,
    publicOrigin,
    callbackBase,
    cookieDomain,
    authApiBaseUrl,
    authCookieName,
    vvaultTargets,
    vvaultOrigin,
    vvaultApiBaseUrl,
    allowLegacyVvaultExchange,
    allowedBrowserOrigins,
    problems,
    ok: problems.length === 0,
  };
}

export function assertRuntimeHandshakeSafety(env = process.env) {
  const config = resolveRuntimeHandshakeConfig(env);
  return {
    ok: config.ok,
    problems: [...config.problems],
    environment: config.environment,
    publicOrigin: config.publicOrigin,
    callbackBase: config.callbackBase,
    authApiBaseUrl: config.authApiBaseUrl,
    vvaultTargets: config.vvaultTargets.map(({ name, origin }) => ({ name, origin })),
    allowedBrowserOrigins: [...config.allowedBrowserOrigins],
    allowLegacyVvaultExchange: config.allowLegacyVvaultExchange,
  };
}
