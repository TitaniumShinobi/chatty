import { getAddressBookEmptyMessage } from "./addressBookEmptyState";

describe("getAddressBookEmptyMessage", () => {
  it("prefers a clear VVAULT unavailable message when the connection is down", () => {
    expect(
      getAddressBookEmptyMessage({
        isVVAULTConnected: false,
        hasAddressBookLoadError: false,
      }),
    ).toBe("VVAULT contacts unavailable");
  });

  it("reports a generic address book issue when VVAULT is up but address book loading failed", () => {
    expect(
      getAddressBookEmptyMessage({
        isVVAULTConnected: true,
        hasAddressBookLoadError: true,
      }),
    ).toBe("Address book unavailable");
  });

  it("uses the true empty-state copy only when the address book is healthy but empty", () => {
    expect(
      getAddressBookEmptyMessage({
        isVVAULTConnected: true,
        hasAddressBookLoadError: false,
      }),
    ).toBe("No contacts yet");
  });
});
