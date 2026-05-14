import type { Thread } from "./threadUtils";

export interface CanonicalConstructContact {
  constructId: string;
  title: string;
}

export const SYSTEM_CONSTRUCT_IDS = new Set([
  "zen",
  "zen-001",
  "lin",
  "lin-001",
  "val",
  "val-001",
  "code",
  "code-001",
  "codex",
  "codex-001",
  "synth",
  "synth-001",
]);

export function isSystemConstructId(constructId: string | null | undefined): boolean {
  return typeof constructId === "string" && SYSTEM_CONSTRUCT_IDS.has(constructId.toLowerCase());
}

export const ADDRESS_BOOK_CERTIFICATION_CONSTRUCT_CONTACTS: CanonicalConstructContact[] = [
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

  return ADDRESS_BOOK_CERTIFICATION_CONSTRUCT_CONTACTS
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
