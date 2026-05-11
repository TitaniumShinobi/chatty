import { resolveRequestUser } from "../auth/lib/supabaseUserResolver.js";
import { resolveSupabaseUser } from "./resolveSupabaseUser.js";
import { getSharedSupabaseUserId } from "./vvaultSharedAuthIdentity.js";
import { resolveVvaultBridgeIdentity } from "./vvaultBridgeIdentity.js";

function resetIdentityTrace(req, requireSupabaseUserId) {
  req.vvaultIdentityTrace = {
    branchEntered: null,
    branchResolved: null,
    branchRejected: null,
    branchTrail: [],
    requireSupabaseUserId: requireSupabaseUserId === true,
  };
}

function markIdentityBranch(req, label, outcome = "entered") {
  if (!req?.vvaultIdentityTrace) return;
  req.vvaultIdentityTrace.branchEntered = label;
  req.vvaultIdentityTrace.branchTrail.push(label);
  if (outcome === "resolved") {
    req.vvaultIdentityTrace.branchResolved = label;
  }
  if (outcome === "rejected") {
    req.vvaultIdentityTrace.branchRejected = label;
  }
}

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

export async function resolveVvaultRequestUser(req, options = {}) {
  const resolveSupabaseUserImpl = options.resolveSupabaseUserImpl || resolveSupabaseUser;
  const resolveRequestUserImpl = options.resolveRequestUserImpl || resolveRequestUser;
  const resolveBridgeIdentityImpl =
    options.resolveBridgeIdentityImpl || resolveVvaultBridgeIdentity;
  const requireSupabaseUserId = options.requireSupabaseUserId === true;
  const sessionResolutionTimeoutMs =
    options.supabaseSessionTimeoutMs ??
    process.env.VVAULT_SUPABASE_SESSION_TIMEOUT_MS;
  const mappingResolutionTimeoutMs =
    options.supabaseMappingTimeoutMs ??
    process.env.VVAULT_SUPABASE_MAPPING_TIMEOUT_MS;
  const sharedSupabaseUserId = getSharedSupabaseUserId(req);
  const chattyUserId =
    req?.user?.id || req?.user?.sub || req?.user?.email || null;

  req.vvaultIdentityFailure = null;
  resetIdentityTrace(req, requireSupabaseUserId);

  if (sharedSupabaseUserId) {
    markIdentityBranch(req, "shared_supabase_uid", "resolved");
    return {
      supabaseUserId: sharedSupabaseUserId,
      chattyUserId,
      userId: sharedSupabaseUserId,
    };
  }

  const shouldAttemptBridgeIdentity =
    typeof resolveBridgeIdentityImpl === "function" &&
    (req?.authSource === "shared" || req?.sharedAuthUser);

  if (shouldAttemptBridgeIdentity) {
    const bridgeIdentity = await resolveBridgeIdentityImpl(req, {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.bridgeIdentityTimeoutMs,
    });
    if (bridgeIdentity?.ok && bridgeIdentity.supabaseUserId) {
      markIdentityBranch(req, "bridge_identity_ok", "resolved");
      return {
        supabaseUserId: bridgeIdentity.supabaseUserId,
        chattyUserId,
        userId: bridgeIdentity.supabaseUserId,
      };
    }
    markIdentityBranch(req, "bridge_identity_failed");
  }

  try {
    const user = await resolveWithTimeout(
      () => resolveSupabaseUserImpl(req),
      sessionResolutionTimeoutMs,
      "resolveSupabaseUser",
    );
    const supabaseUserId = user.id;
    const userId = supabaseUserId;
    if (!userId) {
      throw new Error("no user");
    }
    req.vvaultIdentityFailure = null;
    markIdentityBranch(req, "supabase_cookie_ok", "resolved");
    return { supabaseUserId, chattyUserId: null, userId };
  } catch {
    markIdentityBranch(req, "supabase_cookie_failed");
    try {
      const resolved = await resolveWithTimeout(
        () => resolveRequestUserImpl(req),
        mappingResolutionTimeoutMs,
        "resolveRequestUser",
      );
      if (resolved?.supabaseUserId || resolved?.chattyUserId) {
        const supabaseUserId = resolved.supabaseUserId || null;
        const chattyUserId = resolved.chattyUserId || null;
        const userId = supabaseUserId || (requireSupabaseUserId ? null : chattyUserId);
        if (userId || (!requireSupabaseUserId && chattyUserId)) {
          req.vvaultIdentityFailure = null;
          markIdentityBranch(req, "mapping_ok", "resolved");
          return { supabaseUserId, chattyUserId, userId };
        }
      }
    } catch {
      // Fall through to JWT fallback below.
    }

    markIdentityBranch(req, "mapping_failed");

    if (requireSupabaseUserId) {
      markIdentityBranch(req, "require_supabase_reject", "rejected");
      return null;
    }

    if (req?.user?.uid || req?.user?.id || req?.user?.sub) {
      const fallbackId = req.user.uid || req.user.id || req.user.sub;
      req.vvaultIdentityFailure = null;
      return { supabaseUserId: null, chattyUserId: fallbackId, userId: fallbackId };
    }

    return null;
  }
}
