import crypto from "node:crypto";

import { isSupabaseUuid } from "./vvaultSharedAuthIdentity.js";

const DIAGNOSTICS_FLAG = "VVAULT_IDENTITY_DIAGNOSTICS";
const DIAGNOSTICS_SALT_ENV = "VVAULT_IDENTITY_DIAGNOSTICS_SALT";
const SESSION_KEY_LENGTH = 12;

let warnedMissingSalt = false;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function getRequestPath(req) {
  const originalUrl = normalizeString(req?.originalUrl);
  if (originalUrl) return originalUrl;
  const url = normalizeString(req?.url);
  return url || null;
}

function getRawCookieHeader(req) {
  return typeof req?.headers?.cookie === "string" ? req.headers.cookie : "";
}

function getDiagnosticsSalt() {
  return normalizeString(process.env[DIAGNOSTICS_SALT_ENV]);
}

function hashCookieValue(rawValue, salt) {
  const normalized = normalizeString(rawValue);
  if (!normalized || !salt) return null;
  return crypto
    .createHash("sha256")
    .update(`${normalized}${salt}`)
    .digest("hex")
    .slice(0, SESSION_KEY_LENGTH);
}

function warnMissingSaltOnce() {
  if (warnedMissingSalt) return;
  warnedMissingSalt = true;
  console.warn("⚠️ [VvaultIdentityDiagnostics]", {
    warning: "missing_diagnostics_salt",
    env: DIAGNOSTICS_SALT_ENV,
  });
}

export function isVvaultIdentityDiagnosticsEnabled() {
  return normalizeString(process.env[DIAGNOSTICS_FLAG]).toLowerCase() === "true";
}

export function getRequestSessionKeys(req) {
  if (!isVvaultIdentityDiagnosticsEnabled()) {
    return {
      authSessionKey: null,
      chattySessionKey: null,
    };
  }

  const salt = getDiagnosticsSalt();
  if (!salt) {
    warnMissingSaltOnce();
    return {
      authSessionKey: null,
      chattySessionKey: null,
    };
  }

  const cookies = parseCookieHeader(getRawCookieHeader(req));
  const authCookieName = normalizeString(process.env.AUTH_COOKIE_NAME) || "auth_sid";
  const chattyCookieName = normalizeString(process.env.COOKIE_NAME) || "sid";

  return {
    authSessionKey: hashCookieValue(cookies[authCookieName], salt),
    chattySessionKey: hashCookieValue(cookies[chattyCookieName], salt),
  };
}

export function getComputedUid(user) {
  const uid = normalizeString(user?.uid);
  if (uid) return uid;
  const id = normalizeString(user?.id);
  if (id) return id;
  const sub = normalizeString(user?.sub);
  if (sub) return sub;
  const email = normalizeString(user?.email);
  return email || null;
}

export function getUidState(user) {
  const computedUid = getComputedUid(user);
  if (!computedUid) return "missing";
  if (isSupabaseUuid(computedUid)) return "supabase_uuid";

  const id = normalizeString(user?.id);
  const sub = normalizeString(user?.sub);
  if (computedUid === id || computedUid === sub) {
    return "life_fallback";
  }
  return "non_uuid";
}

export function buildIdentityShape(user) {
  const computedUid = getComputedUid(user);
  const id = normalizeString(user?.id);
  const sub = normalizeString(user?.sub);

  return {
    computedUid,
    uidState: getUidState(user),
    life_user_id_present: Boolean(id || sub),
    supabase_user_id_present: isSupabaseUuid(computedUid),
  };
}

export function buildChattyApiMeIdentityLog(req, authContext, vvaultSession) {
  const sessionKeys = getRequestSessionKeys(req);
  return {
    rid: req?._rid || null,
    requestPath: getRequestPath(req),
    authSessionKey: sessionKeys.authSessionKey,
    chattySessionKey: sessionKeys.chattySessionKey,
    authSource: authContext?.source || req?.authSource || null,
    ...buildIdentityShape(authContext?.user || req?.user),
    vvaultSessionReady: vvaultSession?.ready === true,
    vvaultSessionReason: vvaultSession?.reason || null,
  };
}

export function buildChattyApiMeAuthFailureLog(req, authContext) {
  const sessionKeys = getRequestSessionKeys(req);
  return {
    rid: req?._rid || null,
    requestPath: getRequestPath(req),
    authSessionKey: sessionKeys.authSessionKey,
    chattySessionKey: sessionKeys.chattySessionKey,
    authSource: req?.authSource || null,
    ...buildIdentityShape(req?.user),
    nativeReason: authContext?.nativeReason || authContext?.reason || null,
    sharedReason: authContext?.sharedReason || null,
    sharedStatus: authContext?.sharedStatus || null,
  };
}

export function buildSharedAuthGateFailureLog(req, sharedAuthContext, failure) {
  const sessionKeys = getRequestSessionKeys(req);
  return {
    rid: req?._rid || null,
    requestPath: getRequestPath(req),
    authSessionKey: sessionKeys.authSessionKey,
    chattySessionKey: sessionKeys.chattySessionKey,
    authSource: req?.authSource || null,
    ...buildIdentityShape(req?.user),
    sharedReason:
      sharedAuthContext?.sharedReason || sharedAuthContext?.reason || failure?.reason || null,
    sharedStatus:
      sharedAuthContext?.sharedStatus ||
      sharedAuthContext?.httpStatus ||
      null,
    errorCode: failure?.errorCode || null,
  };
}

export function buildStrictGateIdentityLog(req, resolved, options = {}) {
  const sessionKeys = getRequestSessionKeys(req);
  const trace = req?.vvaultIdentityTrace || {};

  return {
    rid: req?._rid || null,
    requestPath: getRequestPath(req),
    authSessionKey: sessionKeys.authSessionKey,
    chattySessionKey: sessionKeys.chattySessionKey,
    authSource: req?.authSource || null,
    ...buildIdentityShape(req?.user),
    strictGateBranchEntered: trace.branchEntered || null,
    strictGateBranchResolved: trace.branchResolved || null,
    strictGateBranchRejected: trace.branchRejected || null,
    strictGateBranchTrail: Array.isArray(trace.branchTrail)
      ? trace.branchTrail.slice()
      : [],
    requireSupabaseUserId: options.requireSupabaseUserId === true,
    rejectedByRequireSupabaseUserId:
      !resolved &&
      options.requireSupabaseUserId === true &&
      trace.branchRejected === "require_supabase_reject",
    resolvedSupabaseUserId: resolved?.supabaseUserId || null,
    resolvedChattyUserId: resolved?.chattyUserId || null,
  };
}

export function logVvaultIdentityDiagnostics(label, payload) {
  if (!isVvaultIdentityDiagnosticsEnabled()) return null;
  const entry = { label, ...payload };
  console.info("ℹ️ [VvaultIdentityDiagnostics]", entry);
  return entry;
}

export function isStrictConversationIndexRequest(req) {
  const requestPath = getRequestPath(req) || "";
  return requestPath.includes("/api/vvault/conversations/index")
    || requestPath.includes("/conversations/index");
}
