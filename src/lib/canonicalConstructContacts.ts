import type { Thread } from "./threadUtils";

export interface CanonicalConstructContact {
  constructId: string;
  title: string;
}

export const PUBLIC_CERTIFICATION_CONSTRUCT_CONTACTS: CanonicalConstructContact[] = [
  { constructId: "lin-001", title: "Lin" },
  { constructId: "zen-001", title: "Zen" },
  { constructId: "katana-001", title: "Katana" },
  { constructId: "sera-001", title: "Sera" },
  { constructId: "nova-001", title: "Nova" },
];

export function buildMissingCanonicalConstructContacts({
  existingConstructIds,
  now = 0,
}: {
  existingConstructIds: Iterable<string | null | undefined>;
  now?: number;
}): Thread[] {
  const existing = new Set(
    Array.from(existingConstructIds)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.toLowerCase()),
  );

  return PUBLIC_CERTIFICATION_CONSTRUCT_CONTACTS
    .filter(({ constructId }) => !existing.has(constructId))
    .map(({ constructId, title }) => ({
      id: `${constructId}_contact`,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      archived: false,
      constructId,
      runtimeId: constructId,
      isPrimary: constructId === "zen-001",
      hydrationSource: "canonical-contact",
      hydrationComplete: false,
      avatar: `/api/ais/${encodeURIComponent(constructId)}/avatar?v=vvault-identity-v2`,
      avatarUrl: `/api/ais/${encodeURIComponent(constructId)}/avatar?v=vvault-identity-v2`,
    }));
}
