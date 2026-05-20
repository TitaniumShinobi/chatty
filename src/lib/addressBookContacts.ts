export const CHATTY_ADDRESS_BOOK_CONTACT_ORDER = [
  "nova-001",
  "sera-001",
  "katana-001",
];

const CHATTY_ADDRESS_BOOK_CONTACTS = new Set(CHATTY_ADDRESS_BOOK_CONTACT_ORDER);

export type AddressBookSortableContact = {
  title?: string | null;
  constructId?: string | null;
  runtimeId?: string | null;
  id?: string | null;
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

function getContactConstructId(contact: AddressBookSortableContact): string {
  return (
    normalizeAddressBookConstructId(contact.constructId) ||
    normalizeAddressBookConstructId(contact.runtimeId) ||
    normalizeAddressBookConstructId(contact.id) ||
    ""
  );
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
