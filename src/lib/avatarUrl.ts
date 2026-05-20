const INVALID_AVATAR_VALUES = new Set(["", "null", "undefined", "avatar"]);
const DEFAULT_CONSTRUCT_AVATAR_VERSION = "vvault-identity-v2";

export interface AvatarLike {
  avatar?: unknown;
  avatarUrl?: unknown;
}

export interface NormalizedAvatarFields {
  avatar: string | null;
  avatarUrl: string | null;
}

export function normalizeAvatarUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;
  if (INVALID_AVATAR_VALUES.has(trimmed.toLowerCase())) return null;

  return trimmed;
}

export function resolveAvatarValue(
  ...sources: Array<AvatarLike | string | null | undefined>
): string | null {
  for (const source of sources) {
    if (!source) continue;

    if (typeof source === "string") {
      const normalized = normalizeAvatarUrl(source);
      if (normalized) return normalized;
      continue;
    }

    const normalizedAvatar = normalizeAvatarUrl(
      typeof source.avatar === "string" ? source.avatar : null,
    );
    if (normalizedAvatar) return normalizedAvatar;

    const normalizedAvatarUrl = normalizeAvatarUrl(
      typeof source.avatarUrl === "string" ? source.avatarUrl : null,
    );
    if (normalizedAvatarUrl) return normalizedAvatarUrl;
  }

  return null;
}

export function resolveAvatarFields(
  ...sources: Array<AvatarLike | string | null | undefined>
): NormalizedAvatarFields {
  const resolved = resolveAvatarValue(...sources);
  return {
    avatar: resolved,
    avatarUrl: resolved,
  };
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
