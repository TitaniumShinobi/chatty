import { buildCanonicalConstructAvatarUrl, normalizeAvatarUrl } from "./avatarUrl";

export type AddressBookAvatarSource = "explicit" | "none";

export interface AddressBookAvatarInput {
  id?: unknown;
  constructId?: unknown;
  runtimeId?: unknown;
  threadId?: unknown;
  conversationId?: unknown;
  avatar?: unknown;
  avatarUrl?: unknown;
  gptAvatarByConstructId?: Map<string, string> | Record<string, unknown> | null;
  allowBackendAvatarRoute?: boolean;
  allowCanonicalAvatarRouteFallback?: boolean;
}

export interface AddressBookAvatarResolution {
  constructId: string | null;
  avatarSrc: string | null;
  avatarSource: AddressBookAvatarSource;
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function deriveAddressBookConstructId(contact: AddressBookAvatarInput): string | null {
  const explicit = toNonEmptyString(contact.constructId);
  if (explicit) return explicit;
  return null;
}

function getMappedAvatar(
  avatarByConstructId: AddressBookAvatarInput["gptAvatarByConstructId"],
  constructId: string | null,
): string | null {
  if (!avatarByConstructId || !constructId) return null;
  if (avatarByConstructId instanceof Map) {
    return normalizeAvatarUrl(avatarByConstructId.get(constructId));
  }
  return normalizeAvatarUrl(toNonEmptyString(avatarByConstructId[constructId]));
}

function getGeneratedCanonicalAvatarRouteConstructId(value: string): string | null {
  const match = value.match(/^\/api\/ais\/([^/?#]+)\/avatar(?:[?#]|$)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function isAllowedBackendAvatarRoute(
  value: string,
  constructId: string | null,
  allowBackendAvatarRoute: boolean,
): boolean {
  const routeConstructId = getGeneratedCanonicalAvatarRouteConstructId(value);
  if (!routeConstructId) return true;
  return allowBackendAvatarRoute && Boolean(constructId) && routeConstructId === constructId;
}

export function resolveAddressBookAvatar(
  contact: AddressBookAvatarInput,
): AddressBookAvatarResolution {
  const constructId = deriveAddressBookConstructId(contact);
  const candidates = [
    {
      avatar: getMappedAvatar(contact.gptAvatarByConstructId, constructId),
      allowBackendAvatarRoute: true,
    },
    {
      avatar: normalizeAvatarUrl(toNonEmptyString(contact.avatar)),
      allowBackendAvatarRoute: Boolean(contact.allowBackendAvatarRoute),
    },
    {
      avatar: normalizeAvatarUrl(toNonEmptyString(contact.avatarUrl)),
      allowBackendAvatarRoute: Boolean(contact.allowBackendAvatarRoute),
    },
  ];

  for (const candidate of candidates) {
    if (
      candidate.avatar &&
      isAllowedBackendAvatarRoute(
        candidate.avatar,
        constructId,
        candidate.allowBackendAvatarRoute,
      )
    ) {
      return {
        constructId,
        avatarSrc: candidate.avatar,
        avatarSource: "explicit",
      };
    }
  }

  if (contact.allowCanonicalAvatarRouteFallback && constructId) {
    return {
      constructId,
      avatarSrc: buildCanonicalConstructAvatarUrl(constructId),
      avatarSource: "explicit",
    };
  }

  return {
    constructId,
    avatarSrc: null,
    avatarSource: "none",
  };
}
