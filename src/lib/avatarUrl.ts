const INVALID_AVATAR_VALUES = new Set(["", "null", "undefined", "avatar"]);
const DEFAULT_CONSTRUCT_AVATAR_VERSION = "vvault-identity-v2";

export function normalizeAvatarUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;
  if (INVALID_AVATAR_VALUES.has(trimmed.toLowerCase())) return null;

  return trimmed;
}

export function buildCanonicalConstructAvatarUrl(
  constructId?: string | null,
  version?: string | null,
): string | null {
  if (!constructId || typeof constructId !== "string") return null;
  const trimmed = constructId.trim();
  if (!trimmed) return null;

  const baseUrl = `/api/ais/${encodeURIComponent(trimmed)}/avatar`;
  const resolvedVersion =
    typeof version === "string" && version.trim()
      ? version.trim()
      : DEFAULT_CONSTRUCT_AVATAR_VERSION;
  return `${baseUrl}?v=${encodeURIComponent(resolvedVersion)}`;
}
