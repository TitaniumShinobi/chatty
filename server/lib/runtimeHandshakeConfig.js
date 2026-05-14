import {
  isLocalOrigin,
  resolveDoorContract,
} from "./chattyVvaultDoorConfig.js";

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

function normalizeOrigins(values) {
  const deduped = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeOrigin(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function buildTargetMismatchProblems(door, explicitOrigins = []) {
  const problems = [];
  const normalized = explicitOrigins.map((origin) => normalizeOrigin(origin)).filter(Boolean);
  if (!normalized.length) return problems;

  if (door.selectedDoor === "public" && normalized.some((origin) => isLocalOrigin(origin))) {
    problems.push("door_public_with_localhost_target");
  }
  if (door.selectedDoor === "private" && normalized.some((origin) => !isLocalOrigin(origin))) {
    problems.push("door_private_with_production_target");
  }

  return problems;
}

export function resolveRuntimeHandshakeConfig(env = process.env) {
  const door = resolveDoorContract(env);
  const explicitOrigins = [
    env.FRONTEND_URL,
    env.PUBLIC_APP_URL,
    env.PUBLIC_CALLBACK_BASE,
    env.VVAULT_API_BASE_URL,
    env.VVAULT_URL,
    env.VVAULT_BASE_URL,
    env.AUTH_API_BASE_URL,
    env.AUTH_PUBLIC_ORIGIN,
  ];

  const vvaultServiceToken = trimString(env.VVAULT_SERVICE_TOKEN) || null;
  const problems = [
    ...door.problems,
    ...buildTargetMismatchProblems(door, explicitOrigins),
  ];

  const vvaultTargets = door.vvaultOrigin
    ? [
        {
          name: door.selectedDoor,
          origin: door.vvaultOrigin,
          token: vvaultServiceToken,
          sessionBridgePath: door.sessionBridgePath,
        },
      ]
    : [];

  const allowedBrowserOrigins = normalizeOrigins(door.allowedBrowserOrigins);

  if (door.selectedDoor === "public" && allowedBrowserOrigins.some((origin) => isLocalOrigin(origin))) {
    problems.push("door_public_with_localhost_target");
  }
  if (door.selectedDoor === "private" && allowedBrowserOrigins.some((origin) => !isLocalOrigin(origin))) {
    problems.push("door_private_with_production_target");
  }

  return {
    environment: door.selectedDoor === "public" ? "production" : "development",
    isProduction: door.selectedDoor === "public",
    selectedDoor: door.selectedDoor,
    doorContractVersion: door.version,
    doorContractPath: door.path,
    publicOrigin: door.chattyPublicOrigin,
    chattyApiOrigin: door.chattyApiOrigin,
    callbackBase: door.chattyApiOrigin,
    cookieDomain:
      door.selectedDoor === "public" ? trimString(env.AUTH_COOKIE_DOMAIN) || ".thewreck.org" : null,
    authApiBaseUrl: door.authApiOrigin,
    authPublicOrigin: door.authPublicOrigin,
    authCookieName: door.authCookieName,
    authCookieDomain:
      door.selectedDoor === "public" ? trimString(env.AUTH_COOKIE_DOMAIN) || ".thewreck.org" : null,
    enableSharedAuthBrowserLogin:
      door.selectedDoor === "public"
        ? trimString(env.ENABLE_SHARED_AUTH_BROWSER_LOGIN).toLowerCase() !== "false"
        : trimString(env.ENABLE_SHARED_AUTH_BROWSER_LOGIN).toLowerCase() === "true",
    vvaultTargets,
    vvaultOrigin: door.vvaultOrigin,
    vvaultApiBaseUrl: door.vvaultOrigin,
    sessionBridgePath: door.sessionBridgePath,
    allowLegacyVvaultExchange: door.allowLegacyExchange,
    allowedBrowserOrigins,
    problems: Array.from(new Set(problems)),
    ok: Array.from(new Set(problems)).length === 0,
  };
}

export function assertRuntimeHandshakeSafety(env = process.env) {
  const config = resolveRuntimeHandshakeConfig(env);
  return {
    ok: config.ok,
    selectedDoor: config.selectedDoor,
    doorContractVersion: config.doorContractVersion,
    problems: [...config.problems],
    environment: config.environment,
    publicOrigin: config.publicOrigin,
    chattyApiOrigin: config.chattyApiOrigin,
    callbackBase: config.callbackBase,
    authApiBaseUrl: config.authApiBaseUrl,
    authPublicOrigin: config.authPublicOrigin,
    authCookieName: config.authCookieName,
    authCookieDomain: config.authCookieDomain,
    enableSharedAuthBrowserLogin: config.enableSharedAuthBrowserLogin,
    vvaultTargets: config.vvaultTargets.map(
      ({ name, origin, sessionBridgePath }) => ({ name, origin, sessionBridgePath }),
    ),
    allowedBrowserOrigins: [...config.allowedBrowserOrigins],
    allowLegacyVvaultExchange: config.allowLegacyVvaultExchange,
    sessionBridgePath: config.sessionBridgePath,
  };
}
