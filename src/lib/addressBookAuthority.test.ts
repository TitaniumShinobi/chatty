import { hasLiveVvaultAddressBookAuthority } from "./addressBookAuthority";

describe("hasLiveVvaultAddressBookAuthority", () => {
  it("does not treat snapshot hydration as live VVAULT authority", () => {
    expect(
      hasLiveVvaultAddressBookAuthority({
        conversationHydrationMode: "snapshot",
        vvaultFailureInfo: null,
        hasAddressBookVvaultLoadError: false,
      }),
    ).toBe(false);
  });

  it("requires a live index/full hydration with no failure state", () => {
    expect(
      hasLiveVvaultAddressBookAuthority({
        conversationHydrationMode: "index",
        vvaultFailureInfo: null,
        hasAddressBookVvaultLoadError: false,
      }),
    ).toBe(true);

    expect(
      hasLiveVvaultAddressBookAuthority({
        conversationHydrationMode: "full",
        vvaultFailureInfo: null,
        hasAddressBookVvaultLoadError: false,
      }),
    ).toBe(true);
  });

  it("fails closed when VVAULT load/auth state is degraded", () => {
    expect(
      hasLiveVvaultAddressBookAuthority({
        conversationHydrationMode: "index",
        vvaultFailureInfo: {
          classification: "auth-needed",
          message: "AUTH_REQUIRED",
          status: 401,
        },
        hasAddressBookVvaultLoadError: false,
      }),
    ).toBe(false);

    expect(
      hasLiveVvaultAddressBookAuthority({
        conversationHydrationMode: "full",
        vvaultFailureInfo: null,
        hasAddressBookVvaultLoadError: true,
      }),
    ).toBe(false);
  });
});
