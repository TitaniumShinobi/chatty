const SUPABASE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSupabaseUuid(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return SUPABASE_UUID_RE.test(trimmed);
}

function normalizeIdentityValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getReqLikeUserAndAuthSource(reqOrUser, authSourceOverride = null) {
  const reqLike =
    reqOrUser && typeof reqOrUser === "object" && "user" in reqOrUser
      ? reqOrUser
      : null;
  const user = reqLike ? reqLike.user : reqOrUser;
  const authSource =
    authSourceOverride || (reqLike ? reqLike.authSource : null) || null;
  return { user, authSource };
}

function getExplicitVvaultUserId(user) {
  const candidates = [
    user?.vvaultUserId,
    user?.vvault_user_id,
    user?.vvault?.userId,
    user?.vvault?.user_id,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIdentityValue(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function getSharedVvaultUserId(reqOrUser, authSourceOverride = null) {
  const { user, authSource } = getReqLikeUserAndAuthSource(
    reqOrUser,
    authSourceOverride,
  );
  if (authSource !== "shared") return null;

  const explicitVvaultUserId = getExplicitVvaultUserId(user);
  if (explicitVvaultUserId) return explicitVvaultUserId;

  const legacyUuidCandidates = [
    user?.uid,
    user?.supabaseUserId,
    user?.supabase_user_id,
    user?.user_id,
    user?.id,
  ];

  for (const candidate of legacyUuidCandidates) {
    const normalized = normalizeIdentityValue(candidate);
    if (isSupabaseUuid(normalized)) return normalized;
  }

  return null;
}

export function getSharedSupabaseUserId(reqOrUser, authSourceOverride = null) {
  const vvaultUserId = getSharedVvaultUserId(reqOrUser, authSourceOverride);
  return isSupabaseUuid(vvaultUserId) ? vvaultUserId : null;
}

export function buildVvaultSessionState(user, authSource = null) {
  const vvaultUserId = getSharedVvaultUserId(user, authSource);
  const supabaseUserId = isSupabaseUuid(vvaultUserId) ? vvaultUserId : null;
  return {
    ready: Boolean(vvaultUserId),
    authSource: authSource || null,
    vvaultUserId,
    supabaseUserId,
    reason: vvaultUserId
      ? null
      : authSource === "shared"
        ? "shared_auth_identity_unavailable"
        : "shared_auth_required",
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

export function buildVvaultSessionStateFromAuthContext(authContext) {
  if (authContext?.ok && authContext?.source === "shared") {
    return buildVvaultSessionState(authContext.user, authContext.source);
  }

  return {
    ready: false,
    authSource: authContext?.source || null,
    vvaultUserId: null,
    supabaseUserId: null,
    reason: normalizeSharedAuthFailureReason(
      authContext?.sharedReason || authContext?.reason,
    ),
  };
}
