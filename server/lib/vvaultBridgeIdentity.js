import { getVvaultTargets } from "./vvaultBridgeConfig.js";
import { resolveRuntimeHandshakeConfig } from "./runtimeHandshakeConfig.js";
import { resolveVvaultDirectAuth } from "./vvaultDirectAuth.js";
import {
  buildVvaultSessionStateFromAuthContext,
  getSharedSupabaseUserId,
  isSupabaseUuid,
} from "./vvaultSharedAuthIdentity.js";

function normalizeTimeoutMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function resolveWithTimeout(task, timeoutMs, label) {
  const boundedTimeoutMs = normalizeTimeoutMs(timeoutMs, 1200);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${boundedTimeoutMs}ms`));
    }, boundedTimeoutMs);

    Promise.resolve()
      .then(task)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function getRequestPath(req) {
  const originalUrl =
    typeof req?.originalUrl === "string" ? req.originalUrl.trim() : "";
  if (originalUrl) return originalUrl;
  const url = typeof req?.url === "string" ? req.url.trim() : "";
  return url || null;
}

function getRawCookieHeader(req) {
  return typeof req?.headers?.cookie === "string" ? req.headers.cookie : "";
}

function buildDisplayName(req) {
  const explicitName = String(req?.user?.name || "").trim();
  if (explicitName) return explicitName;
  const email = String(req?.user?.email || "").trim();
  if (email.includes("@")) {
    return email.split("@")[0];
  }
  return "User";
}

function buildBridgeFailure(result, overrides = {}) {
  const baseMessage =
    typeof result?.message === "string" && result.message.trim()
      ? result.message.trim()
      : typeof result?.error === "string" && result.error.trim()
        ? result.error.trim()
        : "VVAULT identity bridge failed";
  return {
    ok: false,
    status: overrides.status ?? result?.status ?? 502,
    errorCode: overrides.errorCode ?? result?.errorCode ?? "VVAULT_UNREACHABLE",
    reason: overrides.reason ?? "vvault_unreachable",
    message: overrides.message ?? baseMessage,
    phase: overrides.phase ?? "session-bridge",
    details: overrides.details ?? result?.details ?? null,
  };
}

function mapDirectAuthFailure(result) {
  switch (result?.errorCode) {
    case "AUTH_REQUIRED":
      return buildBridgeFailure(result, {
        status: result?.status ?? 401,
        errorCode: "AUTH_REQUIRED",
        reason: "shared_auth_required",
        message: result?.message || "Shared authentication required",
      });
    case "AUTH_BRIDGE_MISCONFIGURED":
      return buildBridgeFailure(result, {
        status: result?.status ?? 503,
        errorCode: "AUTH_BRIDGE_MISCONFIGURED",
        reason: "vvault_bridge_unavailable",
        message: result?.message || "VVAULT bridge unavailable",
      });
    default:
      return buildBridgeFailure(result, {
        status: result?.status ?? 502,
        errorCode: "VVAULT_UNREACHABLE",
        reason: "vvault_unreachable",
        message: result?.message || "VVAULT is unreachable",
      });
  }
}

function logBridgeIdentity(req, result, extra = {}) {
  const payload = {
    rid: req?._rid || null,
    method: typeof req?.method === "string" ? req.method : null,
    requestPath: getRequestPath(req),
    phase: result?.phase || null,
    ok: result?.ok === true,
    status: result?.status ?? result?.httpStatus ?? null,
    errorCode: result?.ok ? null : result?.errorCode || null,
    reason: result?.ok ? null : result?.reason || null,
    vvaultUserId: result?.ok ? result?.vvaultUserId || null : null,
    supabaseUserId: result?.ok ? result?.supabaseUserId || null : null,
    elapsedMs: extra.elapsedMs ?? null,
    authMethod: result?.authMethod || null,
    message: result?.ok ? null : result?.message || null,
  };

  if (result?.ok) {
    console.info("ℹ️ [VvaultBridgeIdentity]", payload);
    return;
  }

  console.warn("⚠️ [VvaultBridgeIdentity]", payload);
}

async function timedFetch(fetchImpl, url, init = {}, timeoutMs, label) {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  return resolveWithTimeout(
    () =>
      fetchImpl(url, {
        ...init,
        ...(controller ? { signal: controller.signal } : {}),
      }),
    timeoutMs,
    label,
  ).catch((error) => {
    controller?.abort?.();
    throw error;
  });
}

async function fetchVvaultUserInfo({
  req,
  fetchImpl,
  apiBaseUrl,
  token,
  timeoutMs,
}) {
  const url = `${String(apiBaseUrl || "").replace(/\/+$/, "")}/user-info`;
  let response;
  try {
    response = await timedFetch(
      fetchImpl,
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      timeoutMs,
      "vvault bridge user-info",
    );
  } catch (error) {
    return buildBridgeFailure(
      {
        status: 502,
        errorCode: "VVAULT_UNREACHABLE",
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        errorCode: "VVAULT_UNREACHABLE",
        reason: "vvault_unreachable",
        message:
          error instanceof Error ? error.message : "VVAULT user-info request failed",
        phase: "user-info",
      },
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    return buildBridgeFailure(
      {
        status: response.status,
        errorCode: response.status === 401 ? "AUTH_REQUIRED" : "VVAULT_UNREACHABLE",
        error: data?.error || data?.message || `VVAULT user-info failed with ${response.status}`,
      },
      {
        status: response.status === 401 ? 401 : 502,
        errorCode: response.status === 401 ? "AUTH_REQUIRED" : "VVAULT_UNREACHABLE",
        reason:
          response.status === 401 ? "shared_auth_required" : "vvault_unreachable",
        message:
          data?.error ||
          data?.message ||
          `VVAULT user-info failed with ${response.status}`,
        phase: "user-info",
      },
    );
  }

  const vvaultUserId = String(
    data?.user_id || data?.vvaultUserId || data?.vvault_user_id || "",
  ).trim();
  if (!vvaultUserId) {
    return buildBridgeFailure(
      {
        status: 401,
        errorCode: "AUTH_REQUIRED",
        error: "VVAULT identity is unavailable for the current session.",
      },
      {
        status: 401,
        errorCode: "AUTH_REQUIRED",
        reason: "shared_auth_identity_unavailable",
        message: "VVAULT identity is unavailable for the current session.",
        phase: "user-info",
      },
    );
  }

  return {
    ok: true,
    httpStatus: response.status,
    vvaultUserId,
    supabaseUserId: isSupabaseUuid(vvaultUserId) ? vvaultUserId : null,
    userInfo: data,
  };
}

export function buildVvaultSessionStateFromBridgeIdentity(
  authContext,
  bridgeIdentity,
) {
  const authSource = authContext?.source || "shared";
  const vvaultUserId =
    bridgeIdentity?.vvaultUserId || bridgeIdentity?.supabaseUserId || null;
  if (bridgeIdentity?.ok && vvaultUserId) {
    return {
      ready: true,
      authSource,
      vvaultUserId,
      supabaseUserId: isSupabaseUuid(vvaultUserId) ? vvaultUserId : null,
      reason: null,
    };
  }

  return {
    ready: false,
    authSource,
    vvaultUserId: null,
    supabaseUserId: null,
    reason: bridgeIdentity?.reason || "shared_auth_identity_unavailable",
  };
}

export async function resolveVvaultApiMeSessionState(
  req,
  authContext,
  options = {},
) {
  const vvaultSession = buildVvaultSessionStateFromAuthContext(authContext);
  if (
    vvaultSession.ready === true ||
    authContext?.ok !== true ||
    authContext?.source !== "shared" ||
    vvaultSession.reason !== "shared_auth_identity_unavailable"
  ) {
    return vvaultSession;
  }

  const resolveBridgeIdentityImpl =
    options.resolveBridgeIdentityImpl || resolveVvaultBridgeIdentity;
  if (typeof resolveBridgeIdentityImpl !== "function") {
    return vvaultSession;
  }

  const bridgeIdentity = await resolveBridgeIdentityImpl(req, {
    fetchImpl: options.fetchImpl,
    timeoutMs:
      options.bridgeIdentityTimeoutMs ??
      options.timeoutMs ??
      process.env.VVAULT_BRIDGE_IDENTITY_TIMEOUT_MS,
    targets: options.targets,
  });

  return buildVvaultSessionStateFromBridgeIdentity(authContext, bridgeIdentity);
}

export async function resolveVvaultBridgeIdentity(req, options = {}) {
  if (req?._vvaultBridgeIdentity) {
    return req._vvaultBridgeIdentity;
  }

  if (!req?._vvaultBridgeIdentityPromise) {
    req._vvaultBridgeIdentityPromise = (async () => {
      const existingSupabaseUserId = getSharedSupabaseUserId(req);
      if (existingSupabaseUserId) {
        return {
          ok: true,
          vvaultUserId: existingSupabaseUserId,
          supabaseUserId: existingSupabaseUserId,
          authMethod: "shared_auth_context",
          phase: "shared-auth",
        };
      }

      const fetchImpl = options.fetchImpl || globalThis.fetch;
      if (typeof fetchImpl !== "function") {
        return buildBridgeFailure(
          {
            status: 502,
            errorCode: "VVAULT_UNREACHABLE",
            error: "fetch unavailable",
          },
          {
            status: 502,
            errorCode: "VVAULT_UNREACHABLE",
            reason: "vvault_unreachable",
            message: "Fetch is unavailable for VVAULT bridge identity resolution.",
          },
        );
      }

      const timeoutMs =
        options.timeoutMs ??
        options.bridgeIdentityTimeoutMs ??
        process.env.VVAULT_BRIDGE_IDENTITY_TIMEOUT_MS;
      const bridgeFetchTimeoutMs = normalizeTimeoutMs(timeoutMs, 1200);
      const rawCookieHeader = getRawCookieHeader(req);
      const startedAt = Date.now();
      const directAuth = await resolveVvaultDirectAuth({
        targets: options.targets || getVvaultTargets(),
        rawCookieHeader,
        cookieName: process.env.AUTH_COOKIE_NAME || "auth_sid",
        email: String(req?.user?.email || "").trim(),
        displayName: buildDisplayName(req),
        allowLegacyFallback:
          resolveRuntimeHandshakeConfig(process.env).allowLegacyVvaultExchange,
        fetchImpl: (url, init = {}) =>
          timedFetch(
            fetchImpl,
            url,
            init,
            bridgeFetchTimeoutMs,
            "vvault session-bridge",
          ),
      });

      if (!directAuth?.ok) {
        const failure = mapDirectAuthFailure(directAuth);
        logBridgeIdentity(req, failure, { elapsedMs: Date.now() - startedAt });
        return failure;
      }

      const identity = await fetchVvaultUserInfo({
        req,
        fetchImpl,
        apiBaseUrl: directAuth.apiBaseUrl,
        token: directAuth.token,
        timeoutMs: bridgeFetchTimeoutMs,
      });

      if (!identity.ok) {
        logBridgeIdentity(req, identity, { elapsedMs: Date.now() - startedAt });
        return identity;
      }

      const success = {
        ok: true,
        httpStatus: identity.httpStatus,
        vvaultUserId: identity.vvaultUserId,
        supabaseUserId: identity.supabaseUserId,
        authMethod: directAuth.authMethod || "shared_auth_bridge",
        apiBaseUrl: directAuth.apiBaseUrl,
        phase: "user-info",
      };
      logBridgeIdentity(req, success, { elapsedMs: Date.now() - startedAt });
      return success;
    })();
  }

  const resolved = await req._vvaultBridgeIdentityPromise;
  req._vvaultBridgeIdentity = resolved;
  return resolved;
}
