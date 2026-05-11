import {
  deriveAddressBookConstructId,
  resolveAddressBookAvatar,
} from "./addressBookAvatarPolicy";

describe("address book avatar policy", () => {
  it("does not give Sera a generated canonical avatar fallback when no explicit avatar exists", () => {
    expect(resolveAddressBookAvatar({ constructId: "sera-001" })).toEqual({
      constructId: "sera-001",
      avatarSrc: null,
      avatarSource: "none",
    });
  });

  it("preserves explicit Nova avatar data instead of canonicalizing it", () => {
    const avatar = "data:image/svg+xml;base64,bm92YQ==";

    expect(
      resolveAddressBookAvatar({
        constructId: "nova-001",
        avatar,
      }),
    ).toEqual({
      constructId: "nova-001",
      avatarSrc: avatar,
      avatarSource: "explicit",
    });
  });

  it("does not derive canonical avatar routes for Sera, Nova, Katana, or Hydro without explicit avatars", () => {
    expect(resolveAddressBookAvatar({ constructId: "sera-001" })).toEqual({
      constructId: "sera-001",
      avatarSrc: null,
      avatarSource: "none",
    });
    expect(resolveAddressBookAvatar({ constructId: "nova-001" })).toEqual({
      constructId: "nova-001",
      avatarSrc: null,
      avatarSource: "none",
    });
    expect(resolveAddressBookAvatar({ constructId: "katana-001" })).toEqual({
      constructId: "katana-001",
      avatarSrc: null,
      avatarSource: "none",
    });
    expect(resolveAddressBookAvatar({ constructId: "hydro-001" })).toEqual({
      constructId: "hydro-001",
      avatarSrc: null,
      avatarSource: "none",
    });
  });

  it("allows trusted same-construct backend avatar routes for normal GPT contacts", () => {
    const constructIds = ["sera-001", "nova-001", "katana-001", "hydro-001"];

    for (const constructId of constructIds) {
      expect(
        resolveAddressBookAvatar({
          constructId,
          avatar: `/api/ais/${constructId}/avatar?v=vvault-identity-v2`,
          allowBackendAvatarRoute: true,
        }),
      ).toEqual({
        constructId,
        avatarSrc: `/api/ais/${constructId}/avatar?v=vvault-identity-v2`,
        avatarSource: "explicit",
      });
    }
  });

  it("allows trusted GPT metadata routes without frontend generation", () => {
    const avatarByConstruct = new Map([
      ["nova-001", "/api/ais/nova-001/avatar?v=vvault-identity-v2"],
    ]);

    expect(
      resolveAddressBookAvatar({
        constructId: "nova-001",
        gptAvatarByConstructId: avatarByConstruct,
      }),
    ).toEqual({
      constructId: "nova-001",
      avatarSrc: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
      avatarSource: "explicit",
    });
  });

  it("rejects generated canonical avatar routes unless they are trusted same-construct backend routes", () => {
    expect(
      resolveAddressBookAvatar({
        constructId: "sera-001",
        avatar: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
      }),
    ).toEqual({
      constructId: "sera-001",
      avatarSrc: null,
      avatarSource: "none",
    });

    expect(
      resolveAddressBookAvatar({
        constructId: "katana-001",
        avatar: "/api/ais/katana-001/avatar?v=vvault-identity-v2",
      }),
    ).toEqual({
      constructId: "katana-001",
      avatarSrc: null,
      avatarSource: "none",
    });

    expect(
      resolveAddressBookAvatar({
        constructId: "hydro-001",
        avatar: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
      }),
    ).toEqual({
      constructId: "hydro-001",
      avatarSrc: null,
      avatarSource: "none",
    });

    expect(
      resolveAddressBookAvatar({
        constructId: "hydro-001",
        avatar: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
        allowBackendAvatarRoute: true,
      }),
    ).toEqual({
      constructId: "hydro-001",
      avatarSrc: null,
      avatarSource: "none",
    });
  });

  it("rejects every generated canonical avatar route when the frontend tries to invent it", () => {
    const generatedRoutes = [
      "/api/ais/sera-001/avatar",
      "/api/ais/sera-001/avatar?v=vvault-identity-v2",
      "/api/ais/nova-001/avatar",
      "/api/ais/nova-001/avatar?v=vvault-identity-v2",
      "/api/ais/katana-001/avatar?v=vvault-identity-v2",
      "/api/ais/hydro-001/avatar?cache=bust",
    ];
    const constructIds = ["sera-001", "nova-001", "katana-001", "hydro-001", "lin-001"];

    for (const constructId of constructIds) {
      for (const avatar of generatedRoutes) {
        expect(resolveAddressBookAvatar({ constructId, avatar })).toEqual({
          constructId,
          avatarSrc: null,
          avatarSource: "none",
        });
      }
    }
  });

  it("filters placeholder avatar values before applying policy", () => {
    expect(
      resolveAddressBookAvatar({
        constructId: "katana-001",
        avatar: "avatar",
        avatarUrl: "null",
      }).avatarSrc,
    ).toBeNull();
    expect(
      resolveAddressBookAvatar({
        constructId: "sera-001",
        avatar: "",
      }).avatarSource,
    ).toBe("none");
  });

  it("derives Sera construct ids from contact and thread ids without creating a fallback", () => {
    expect(deriveAddressBookConstructId({ id: "sera-001_contact" })).toBe("sera-001");
    expect(deriveAddressBookConstructId({ id: "sera-001_chat_with_sera-001" })).toBe("sera-001");
    expect(resolveAddressBookAvatar({ id: "sera-001_contact" }).avatarSrc).toBeNull();
    expect(resolveAddressBookAvatar({ id: "katana-001_contact" }).avatarSrc).toBeNull();
  });

  it("uses GPT metadata avatars as explicit address-book avatars", () => {
    const avatarByConstruct = new Map([["nova-001", "data:image/svg+xml;base64,bm92YQ=="]]);

    expect(
      resolveAddressBookAvatar({
        constructId: "nova-001",
        gptAvatarByConstructId: avatarByConstruct,
      }),
    ).toEqual({
      constructId: "nova-001",
      avatarSrc: "data:image/svg+xml;base64,bm92YQ==",
      avatarSource: "explicit",
    });
  });
});
