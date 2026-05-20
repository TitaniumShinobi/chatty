import {
  compareAddressBookContacts,
  isAddressBookConstructPinned,
  isAddressBookConstructVisible,
} from "./addressBookContacts";

describe("address book contact visibility and order", () => {
  it("keeps exactly the three Chatty Address Book contacts visible", () => {
    expect(isAddressBookConstructVisible("nova-001")).toBe(true);
    expect(isAddressBookConstructVisible("sera-001")).toBe(true);
    expect(isAddressBookConstructVisible("katana-001")).toBe(true);
    expect(isAddressBookConstructVisible("zen-001")).toBe(false);
    expect(isAddressBookConstructVisible("lin-001")).toBe(false);
    expect(isAddressBookConstructVisible("val-001")).toBe(false);
    expect(isAddressBookConstructVisible("hydro-001")).toBe(false);
    expect(isAddressBookConstructVisible("synth")).toBe(false);
    expect(isAddressBookConstructVisible("synth-001")).toBe(false);
    expect(isAddressBookConstructVisible("db-override-test-001")).toBe(false);
    expect(isAddressBookConstructVisible("db-override-test-002")).toBe(false);
  });

  it("does not treat Hydro work-file paths as Address Book contacts", () => {
    expect(
      isAddressBookConstructVisible(
        "instances/hydro-001/code/chatty/Fix looping basic work.md",
      ),
    ).toBe(false);
    expect(isAddressBookConstructPinned("hydro-001")).toBe(false);
  });

  it("does not pin system, workbench, or contact rows in the Address Book", () => {
    expect(isAddressBookConstructPinned("zen-001")).toBe(false);
    expect(isAddressBookConstructPinned("lin-001")).toBe(false);
    expect(isAddressBookConstructPinned("val-001")).toBe(false);
    expect(isAddressBookConstructPinned("nova-001")).toBe(false);
    expect(isAddressBookConstructPinned("sera-001")).toBe(false);
    expect(isAddressBookConstructPinned("katana-001")).toBe(false);
  });

  it("uses stable contact order instead of recency shuffling", () => {
    const ordered = [
      { constructId: "katana-001", title: "Katana" },
      { constructId: "zen-001", title: "Zen" },
      { constructId: "val-001", title: "Val" },
      { constructId: "nova-001", title: "Nova" },
      { constructId: "lin-001", title: "Lin" },
      { constructId: "sera-001", title: "Sera" },
    ].sort(compareAddressBookContacts);

    expect(ordered.map((contact) => contact.constructId)).toEqual([
      "nova-001",
      "sera-001",
      "katana-001",
      "lin-001",
      "val-001",
      "zen-001",
    ]);
  });
});
