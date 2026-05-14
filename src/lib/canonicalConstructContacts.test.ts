import {
  buildMissingCanonicalConstructContacts,
  isSystemConstructId,
} from "./canonicalConstructContacts";

describe("canonical construct address-book contacts", () => {
  it("adds only non-system public certification constructs without transcript content", () => {
    const contacts = buildMissingCanonicalConstructContacts({
      existingConstructIds: [],
      now: 123,
    });

    expect(contacts.map((contact) => contact.constructId)).toEqual([
      "katana-001",
      "sera-001",
      "nova-001",
    ]);
    expect(contacts.every((contact) => contact.messages.length === 0)).toBe(true);
    expect(contacts.every((contact) => contact.hydrationSource === "canonical-contact")).toBe(true);
    expect(contacts.every((contact) => contact.hydrationComplete === false)).toBe(true);
  });

  it("does not duplicate constructs already present from VVAULT or AIs", () => {
    const contacts = buildMissingCanonicalConstructContacts({
      existingConstructIds: ["nova-001", "SERA-001"],
      now: 123,
    });

    expect(contacts.map((contact) => contact.constructId)).toEqual([
      "katana-001",
    ]);
  });

  it("keeps system constructs out of the address book lane", () => {
    expect(isSystemConstructId("zen-001")).toBe(true);
    expect(isSystemConstructId("lin-001")).toBe(true);
    expect(isSystemConstructId("val-001")).toBe(true);
    expect(isSystemConstructId("code")).toBe(true);
    expect(isSystemConstructId("katana-001")).toBe(false);
  });
});
