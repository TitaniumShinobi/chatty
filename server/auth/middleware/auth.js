import jwt from "jsonwebtoken";
import process from "node:process";
import { getVvaultServiceTokens } from "../../lib/vvaultBridgeConfig.js";
import { resolveRuntimeHandshakeConfig } from "../../lib/runtimeHandshakeConfig.js";
import {
  buildSharedAuthGateFailureLog,
  logVvaultIdentityDiagnostics,
} from "../../lib/vvaultIdentityDiagnostics.js";

function normalizeOrigin(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getChattyCookieName() {
  return process.env.COOKIE_NAME || "sid";
}

function getChattyJwtSecret() {
  return process.env.JWT_SECRET;
}

function getSharedAuthCookieName() {
  return (process.env.AUTH_COOKIE_NAME || "auth_sid").trim() || "auth_sid";
}

function getSharedAuthApiBaseUrl() {
  return normalizeOrigin(resolveRuntimeHandshakeConfig(process.env).authApiBaseUrl || "");
}

function getRequestPath(req) {
  const originalUrl =
    typeof req?.originalUrl === "string" ? req.originalUrl.trim() : "";
  if (originalUrl) return originalUrl;
  const url = typeof req?.url === "string" ? req.url.trim() : "";
  return url || null;
}

function logSharedAuthFetch(req, result, extra = {}) {
  const sharedReason = result?.ok ? null : result?.reason || null;
  const payload = {
    rid: req?._rid || null,
    method: typeof req?.method === "string" ? req.method : null,
    requestPath: getRequestPath(req),
    bridgePath: "/api/me",
    sharedReason,
    httpStatus: result?.httpStatus ?? null,
    timeoutMs: result?.timeoutMs ?? null,
    elapsedMs: extra.elapsedMs ?? null,
    failureClass:
      result?.ok === true
        ? null
        : extra.failureClass ||
          (sharedReason === "shared_auth_timeout"
            ? "timeout"
            : sharedReason === "shared_auth_unavailable"
              ? "transport_error"
              : sharedReason === "shared_auth_required" ||
                  sharedReason === "shared_auth_unauthenticated" ||
                  sharedReason === "no_shared_auth_cookie"
                ? "auth_required"
                : "bridge_failure"),
    errorClass: extra.errorClass ?? null,
    errorMessage: extra.errorMessage ?? null,
  };

  if (result?.ok) {
    console.info("ℹ️ [SharedAuthBridge]", payload);
    return;
  }

  console.warn("⚠️ [SharedAuthBridge]", payload);
}

function normalizeTimeoutMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function resolveWithTimeout(task, timeoutMs, timeoutValueFactory) {
  const boundedTimeoutMs = normalizeTimeoutMs(timeoutMs, 1500);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(
        typeof timeoutValueFactory === "function"
          ? timeoutValueFactory(boundedTimeoutMs)
          : timeoutValueFactory,
      );
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

function parseCookieHeader(headerValue = "") {
  if (!headerValue || typeof headerValue !== "string") return {};
  return headerValue.split(";").reduce((accumulator, part) => {
    const [rawKey, ...valueParts] = part.trim().split("=");
    if (!rawKey) return accumulator;
    accumulator[rawKey] = decodeURIComponent(valueParts.join("=") || "");
    return accumulator;
  }, {});
}

function getRequestCookieHeader(req) {
  return typeof req?.headers?.cookie === "string" ? req.headers.cookie : "";
}

function getSharedAuthHeaders(req) {
  const headers = {
    cookie: getRequestCookieHeader(req),
  };
  if (req?.headers?.["user-agent"]) {
    headers["user-agent"] = req.headers["user-agent"];
  }
  if (req?.headers?.["x-forwarded-for"]) {
    headers["x-forwarded-for"] = req.headers["x-forwarded-for"];
  }
  return headers;
}

function normalizeSharedSessionUser(user) {
  if (!user || typeof user !== "object") return null;
  const id = String(user.id || user.sub || "").trim();
  const email = String(user.email || "").trim();
  if (!id || !email) return null;

  const uid = String(user.uid || "").trim();
  const fallbackName = email.includes("@") ? email.split("@")[0] : "User";
  const name = String(user.name || fallbackName).trim() || fallbackName;

  return {
    id,
    sub: String(user.sub || id).trim() || id,
    uid: uid || id,
    email,
    name,
    picture: user.picture || null,
    auth_provider: String(user.auth_provider || "shared_auth").trim() || "shared_auth",
    ...(typeof user.given_name === "string" && user.given_name.trim() ? { given_name: user.given_name.trim() } : {}),
    ...(typeof user.family_name === "string" && user.family_name.trim() ? { family_name: user.family_name.trim() } : {}),
    ...(typeof user.locale === "string" && user.locale.trim() ? { locale: user.locale.trim() } : {}),
  };
}

function readChattySession(req) {
  const cookieName = getChattyCookieName();
  const jwtSecret = getChattyJwtSecret();
  const raw = req.cookies?.[cookieName];

  if (!raw) {
    return { ok: false, reason: "no_cookie" };
  }
  if (!jwtSecret) {
    return { ok: false, reason: "missing_jwt_secret" };
  }

  try {
    const decoded = jwt.verify(raw, jwtSecret);
    return { ok: true, user: decoded, source: "chatty" };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "TokenExpiredError" ? "expired_jwt" : "invalid_jwt",
      error,
    };
  }
}

async function readSharedAuthSession(req, fetchImpl = globalThis.fetch, options = {}) {
  const authApiBaseUrl = getSharedAuthApiBaseUrl();
  if (!authApiBaseUrl) {
    return { ok: false, reason: "shared_auth_unconfigured" };
  }

  const rawCookieHeader = getRequestCookieHeader(req);
  const sharedCookieName = getSharedAuthCookieName();
  const sharedCookieValue = parseCookieHeader(rawCookieHeader)[sharedCookieName];
  if (!sharedCookieValue) {
    return { ok: false, reason: "no_shared_auth_cookie" };
  }

  if (typeof fetchImpl !== "function") {
    return { ok: false, reason: "shared_auth_unavailable" };
  }

  const startedAt = Date.now();
  try {
    const controller = typeof AbortController === "function"
      ? new AbortController()
      : null;
    const response = await resolveWithTimeout(
      () =>
        fetchImpl(`${authApiBaseUrl}/api/me`, {
          method: "GET",
          headers: getSharedAuthHeaders(req),
          redirect: "manual",
          ...(controller ? { signal: controller.signal } : {}),
        }),
      options.timeoutMs ?? process.env.AUTH_API_TIMEOUT_MS,
      (timeoutMs) => {
        controller?.abort?.();
        return { __timedOut: true, timeoutMs };
      },
    );

    if (response?.__timedOut) {
      const result = {
        ok: false,
        reason: "shared_auth_timeout",
        timeoutMs: response.timeoutMs,
      };
      logSharedAuthFetch(req, result, {
        elapsedMs: Date.now() - startedAt,
      });
      return result;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.ok !== true || !data?.user) {
      const result = {
        ok: false,
        reason: response.status === 401 ? "shared_auth_unauthenticated" : "shared_auth_error",
        httpStatus: response.status,
        payload: data,
      };
      logSharedAuthFetch(req, result, {
        elapsedMs: Date.now() - startedAt,
      });
      return result;
    }

    const normalizedUser = normalizeSharedSessionUser(data.user);
    if (!normalizedUser) {
      const result = {
        ok: false,
        reason: "shared_auth_invalid_payload",
        httpStatus: response.status,
        payload: data,
      };
      logSharedAuthFetch(req, result, {
        elapsedMs: Date.now() - startedAt,
      });
      return result;
    }

    const result = {
      ok: true,
      source: "shared",
      user: normalizedUser,
      httpStatus: response.status,
    };
    logSharedAuthFetch(req, result, {
      elapsedMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const result = {
      ok: false,
      reason: "shared_auth_unavailable",
      error,
    };
    logSharedAuthFetch(req, result, {
      elapsedMs: Date.now() - startedAt,
      errorClass: error?.name || typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
}

function applySharedAuthContextToRequest(req, sharedSession, hydrateRequestUser = true) {
  if (!sharedSession?.ok) return;
  req.sharedAuthUser = sharedSession.user;
  if (hydrateRequestUser) {
    req.user = sharedSession.user;
    req.authSource = sharedSession.source;
  }
}

function buildSharedAuthFailureResult(sharedSession) {
  return {
    ok: false,
    reason: sharedSession?.reason || "shared_auth_required",
    sharedReason: sharedSession?.reason || null,
    sharedStatus: sharedSession?.httpStatus || null,
  };
}

function normalizeSharedAuthFailureReason(reason) {
  switch (reason) {
    case "no_shared_auth_cookie":
    case "shared_auth_unauthenticated":
      return "shared_auth_required";
    default:
      return reason || "shared_auth_required";
  }
}

export function classifySharedAuthFailure(reason) {
  const normalizedReason = normalizeSharedAuthFailureReason(reason);

  switch (normalizedReason) {
    case "shared_auth_unconfigured":
    case "shared_auth_invalid_payload":
    case "shared_auth_error":
      return {
        status: 502,
        error: "Shared VVAULT auth bridge is misconfigured",
        errorCode: "AUTH_BRIDGE_MISCONFIGURED",
        reason: normalizedReason,
      };
    case "shared_auth_unavailable":
    case "shared_auth_timeout":
      return {
        status: 503,
        error: "Shared VVAULT auth bridge is unavailable",
        errorCode: "AUTH_BRIDGE_MISCONFIGURED",
        reason: normalizedReason,
      };
    default:
      return {
        status: 401,
        error: "Shared VVAULT authentication required",
        errorCode: "AUTH_REQUIRED",
        reason: normalizedReason,
      };
  }
}

export async function resolveSharedAuthContext(req, options = {}) {
  if (req._sharedAuthContext) {
    applySharedAuthContextToRequest(
      req,
      req._sharedAuthContext,
      options.hydrateRequestUser !== false,
    );
    return req._sharedAuthContext;
  }

  if (!req._sharedAuthContextPromise) {
    req._sharedAuthContextPromise = (async () => {
      const sharedSession = await readSharedAuthSession(req, options.fetchImpl, {
        timeoutMs: options.sharedAuthTimeoutMs ?? options.timeoutMs,
      });
      return sharedSession.ok
        ? sharedSession
        : buildSharedAuthFailureResult(sharedSession);
    })();
  }

  const resolved = await req._sharedAuthContextPromise;
  req._sharedAuthContext = resolved;
  applySharedAuthContextToRequest(
    req,
    resolved,
    options.hydrateRequestUser !== false,
  );
  return resolved;
}

export async function resolvePreferredAuthContext(req, options = {}) {
  if (req._preferredAuthContext) {
    return req._preferredAuthContext;
  }

  if (!req._preferredAuthContextPromise) {
    req._preferredAuthContextPromise = (async () => {
      const nativeSession = readChattySession(req);
      if (nativeSession.ok) {
        req.user = nativeSession.user;
        req.authSource = nativeSession.source;
        return nativeSession;
      }

      const sharedSession = await resolveSharedAuthContext(req, {
        fetchImpl: options.fetchImpl,
        sharedAuthTimeoutMs: options.sharedAuthTimeoutMs,
        hydrateRequestUser: true,
      });
      if (sharedSession.ok) {
        return sharedSession;
      }

      return {
        ok: false,
        reason: sharedSession.reason || nativeSession.reason || "auth_unavailable",
        nativeReason: nativeSession.reason || null,
        sharedReason: sharedSession.reason || null,
        sharedStatus: sharedSession.httpStatus || null,
      };
    })();
  }

  const resolved = await req._preferredAuthContextPromise;
  req._preferredAuthContext = resolved;
  return resolved;
}

export function attachAuthIfPresent(req, _res, next) {
  const nativeSession = readChattySession(req);
  if (!nativeSession.ok) {
    return next();
  }

  req.user = nativeSession.user;
  req.authSource = nativeSession.source;

  return next();
}

export function requireAuth(req, res, next) {
  const nativeSession = readChattySession(req);
  if (!nativeSession.ok) {
    return res.status(401).json({ ok: false });
  }

  req.user = nativeSession.user;
  req.authSource = nativeSession.source;
  return next();
}

export async function requirePreferredAuth(req, res, next) {
  const authContext = await resolvePreferredAuthContext(req);
  if (authContext.ok) {
    return next();
  }
  return res.status(401).json({
    ok: false,
    error: "Authentication required",
    errorCode: "AUTH_REQUIRED",
  });
}

export async function requireSharedAuth(req, res, next) {
  const sharedAuthContext = await resolveSharedAuthContext(req, {
    hydrateRequestUser: true,
  });
  if (sharedAuthContext.ok && sharedAuthContext.source === "shared") {
    return next();
  }

  const failure = classifySharedAuthFailure(
    sharedAuthContext.sharedReason || sharedAuthContext.reason,
  );
  logVvaultIdentityDiagnostics(
    "shared_auth_gate_failure",
    buildSharedAuthGateFailureLog(req, sharedAuthContext, failure),
  );
  return res.status(failure.status).json({
    ok: false,
    error: failure.error,
    errorCode: failure.errorCode,
    reason: failure.reason,
  });
}

export function requireAuthOrServiceToken(req, res, next) {
  const tokens = getVvaultServiceTokens();
  const authHeader = req.headers?.authorization || "";
  if (tokens.length && tokens.some((token) => authHeader === `Bearer ${token}`)) {
    const userId = (req.headers["x-chatty-user-id"] || "").toString().trim();
    const email = (req.headers["x-chatty-user-email"] || "").toString().trim();
    if (userId) {
      req.user = { sub: userId, id: userId, ...(email && { email }) };
    }
    return next();
  }
  return requireAuth(req, res, next);
}

export async function requirePreferredAuthOrServiceToken(req, res, next) {
  const tokens = getVvaultServiceTokens();
  const authHeader = req.headers?.authorization || "";
  if (tokens.length && tokens.some((token) => authHeader === `Bearer ${token}`)) {
    const userId = (req.headers["x-chatty-user-id"] || "").toString().trim();
    const email = (req.headers["x-chatty-user-email"] || "").toString().trim();
    if (userId) {
      req.user = { sub: userId, id: userId, ...(email && { email }) };
    }
    req.authSource = "service_token";
    return next();
  }
  return requirePreferredAuth(req, res, next);
}
