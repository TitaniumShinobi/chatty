import {
  getSharedSupabaseUserId,
  isSupabaseUuid,
} from "./vvaultSharedAuthIdentity.js";

export function getPreferredSupabaseUserIdFromRequest(req) {
  const sharedSupabaseUserId = getSharedSupabaseUserId(req);
  if (sharedSupabaseUserId) {
    return sharedSupabaseUserId;
  }

  const candidates = [
    req?.user?.supabase_user_id,
    req?.user?.supabaseUserId,
    req?.user?.user_id,
    req?.user?.id,
  ];

  for (const candidate of candidates) {
    if (isSupabaseUuid(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

export function getChattyUserIdFromRequest(req) {
  return req?.user?.id || req?.user?.uid || req?.user?.sub || req?.user?.email || null;
}

export function getAisRequestUserIds(req) {
  return {
    supabaseUserId: getPreferredSupabaseUserIdFromRequest(req),
    chattyUserId: getChattyUserIdFromRequest(req),
  };
}
