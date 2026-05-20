import { resolveAddressBookAvatar } from "./addressBookAvatarPolicy";

export const CHATTY_ADDRESS_BOOK_CONTACT_ORDER = [
  "nova-001",
  "sera-001",
  "katana-001",
];

const CHATTY_ADDRESS_BOOK_CONTACTS = new Set(CHATTY_ADDRESS_BOOK_CONTACT_ORDER);
const CHATTY_ADDRESS_BOOK_CONTACT_NAMES: Record<string, string> = {
  "nova-001": "Nova",
  "sera-001": "Sera",
  "katana-001": "Katana",
};

export type AddressBookContactSource = "vvault" | "gpt" | "shell";

export type AddressBookSortableContact = {
  title?: string | null;
  constructId?: string | null;
  runtimeId?: string | null;
  id?: string | null;
};

export type AddressBookContactRecord = AddressBookSortableContact & {
  messages?: unknown[] | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  archived?: boolean | null;
  isPrimary?: boolean | null;
  isIndexHydrated?: boolean | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  [key: string]: unknown;
};

export type StableAddressBookContact = AddressBookContactRecord & {
  id: string;
  title: string;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  constructId: string;
  runtimeId: string;
  isPrimary: boolean;
  isIndexHydrated: boolean;
  addressBookSource: AddressBookContactSource;
  isAddressBookShell: boolean;
};

export type AddressBookContactSelection = {
  constructId: string;
  threadId: string;
  title: string;
};

export function normalizeAddressBookConstructId(
  constructId: unknown,
): string | null {
  if (typeof constructId !== "string") return null;
  const normalized = constructId.trim().toLowerCase();
  return normalized || null;
}

export function isAddressBookConstructVisible(constructId: unknown): boolean {
  const normalized = normalizeAddressBookConstructId(constructId);
  if (!normalized) return false;
  if (normalized.includes("/")) return false;
  return CHATTY_ADDRESS_BOOK_CONTACTS.has(normalized);
}

export function getAddressBookContactName(constructId: unknown): string | null {
  const normalized = normalizeAddressBookConstructId(constructId);
  if (!normalized || !isAddressBookConstructVisible(normalized)) return null;
  return CHATTY_ADDRESS_BOOK_CONTACT_NAMES[normalized] || null;
}

export function getCanonicalAddressBookThreadId(constructId: unknown): string | null {
  const normalized = normalizeAddressBookConstructId(constructId);
  if (!normalized || !isAddressBookConstructVisible(normalized)) return null;
  return `${normalized}_chat_with_${normalized}`;
}

function getConstructIdFromContactId(id: unknown): string | null {
  const normalized = normalizeAddressBookConstructId(id);
  if (!normalized) return null;
  if (normalized.endsWith("_contact")) {
    return normalizeAddressBookConstructId(normalized.slice(0, -"_contact".length));
  }
  const canonicalMatch = normalized.match(/^([a-z0-9-]+)_chat_with_\1$/i);
  return canonicalMatch?.[1] || normalized;
}

function getContactConstructId(contact: AddressBookSortableContact): string {
  return (
    normalizeAddressBookConstructId(contact.constructId) ||
    normalizeAddressBookConstructId(contact.runtimeId) ||
    getConstructIdFromContactId(contact.id) ||
    ""
  );
}

export function resolveAddressBookContactSelection(
  contact: AddressBookSortableContact | string | null | undefined,
): AddressBookContactSelection | null {
  const candidate =
    typeof contact === "string"
      ? { id: contact }
      : contact;
  if (!candidate) return null;

  const constructId = getContactConstructId(candidate);
  if (!isAddressBookConstructVisible(constructId)) return null;

  const threadId = getCanonicalAddressBookThreadId(constructId);
  const title = getAddressBookContactName(constructId);
  if (!threadId || !title) return null;

  return {
    constructId,
    threadId,
    title,
  };
}

function getPinnedIndex(contact: AddressBookSortableContact): number {
  const constructId = getContactConstructId(contact);
  const index = CHATTY_ADDRESS_BOOK_CONTACT_ORDER.indexOf(constructId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function isAddressBookConstructPinned(constructId: unknown): boolean {
  void constructId;
  return false;
}

export function compareAddressBookContacts(
  a: AddressBookSortableContact,
  b: AddressBookSortableContact,
): number {
  const pinnedDelta = getPinnedIndex(a) - getPinnedIndex(b);
  if (pinnedDelta !== 0) return pinnedDelta;

  const titleA = (a.title || getContactConstructId(a)).trim().toLowerCase();
  const titleB = (b.title || getContactConstructId(b)).trim().toLowerCase();
  return titleA.localeCompare(titleB);
}

function coerceTimestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function createAddressBookShellContact(constructId: string): StableAddressBookContact {
  const title = getAddressBookContactName(constructId) || constructId;
  const id = getCanonicalAddressBookThreadId(constructId) || constructId;
  return {
    id,
    title,
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    archived: false,
    constructId,
    runtimeId: constructId,
    isPrimary: false,
    isIndexHydrated: true,
    avatar: null,
    avatarUrl: null,
    addressBookSource: "shell",
    isAddressBookShell: true,
  };
}

function normalizeAddressBookContactRecord(
  record: AddressBookContactRecord,
  source: AddressBookContactSource,
): StableAddressBookContact | null {
  const constructId = normalizeAddressBookConstructId(record.constructId);
  if (!constructId || !isAddressBookConstructVisible(constructId)) return null;
  const shell = createAddressBookShellContact(constructId);
  const title = getAddressBookContactName(constructId) || shell.title;
  const id = getCanonicalAddressBookThreadId(constructId) || shell.id;
  const resolvedAvatar = resolveAddressBookAvatar({
    constructId,
    avatar: record.avatar,
    avatarUrl: record.avatarUrl,
    allowTrustedBackendAvatarRoute: true,
  }).avatarSrc;

  return {
    ...shell,
    ...record,
    id,
    title,
    messages: Array.isArray(record.messages) ? record.messages : [],
    createdAt: coerceTimestamp(record.createdAt, shell.createdAt),
    updatedAt: coerceTimestamp(record.updatedAt, shell.updatedAt),
    archived: record.archived === true,
    constructId,
    runtimeId:
      normalizeAddressBookConstructId(record.runtimeId) || shell.runtimeId,
    isPrimary: record.isPrimary === true,
    isIndexHydrated:
      typeof record.isIndexHydrated === "boolean"
        ? record.isIndexHydrated
        : source !== "vvault",
    avatar: resolvedAvatar,
    avatarUrl: resolvedAvatar,
    addressBookSource: source,
    isAddressBookShell: source === "shell",
  };
}

export function buildStableAddressBookContacts({
  conversationThreads = [],
  gptContactCards = [],
}: {
  conversationThreads?: AddressBookContactRecord[] | null;
  gptContactCards?: AddressBookContactRecord[] | null;
}): StableAddressBookContact[] {
  const byConstructId = new Map<string, StableAddressBookContact>();

  for (const record of conversationThreads || []) {
    if (typeof record.title === "string" && record.title.endsWith(".md")) {
      continue;
    }
    const normalized = normalizeAddressBookContactRecord(record, "vvault");
    if (normalized && !byConstructId.has(normalized.constructId)) {
      byConstructId.set(normalized.constructId, normalized);
    }
  }

  for (const record of gptContactCards || []) {
    const normalized = normalizeAddressBookContactRecord(record, "gpt");
    if (normalized && !byConstructId.has(normalized.constructId)) {
      byConstructId.set(normalized.constructId, normalized);
    }
  }

  return CHATTY_ADDRESS_BOOK_CONTACT_ORDER.map(
    (constructId) =>
      byConstructId.get(constructId) || createAddressBookShellContact(constructId),
  );
}
