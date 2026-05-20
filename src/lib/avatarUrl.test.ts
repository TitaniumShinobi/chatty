import {
  buildCanonicalConstructAvatarUrl,
  normalizeAvatarUrl,
  resolveAvatarFields,
  resolveAvatarValue,
} from "./avatarUrl";

describe("normalizeAvatarUrl", () => {
  it("preserves relative API avatar paths", () => {
    expect(normalizeAvatarUrl("/api/ais/nova-001/avatar")).toBe("/api/ais/nova-001/avatar");
  });

  it("preserves absolute avatar URLs", () => {
    expect(normalizeAvatarUrl("https://cdn.example.com/avatar.png")).toBe(
      "https://cdn.example.com/avatar.png",
    );
  });

  it("filters invalid placeholder values", () => {
    expect(normalizeAvatarUrl("avatar")).toBeNull();
    expect(normalizeAvatarUrl("null")).toBeNull();
    expect(normalizeAvatarUrl("")).toBeNull();
  });
});

describe("buildCanonicalConstructAvatarUrl", () => {
  it("builds the canonical construct avatar endpoint", () => {
    expect(buildCanonicalConstructAvatarUrl("sera-001")).toBe(
      "/api/ais/sera-001/avatar?v=vvault-identity-v2",
    );
  });

  it("appends cache-busting versions when available", () => {
    expect(buildCanonicalConstructAvatarUrl("sera-001", "sha-123")).toBe(
      "/api/ais/sera-001/avatar?v=sha-123",
    );
  });
});

describe("resolveAvatarValue", () => {
  it("keeps an existing valid avatar when a later hydration source is null", () => {
    expect(
      resolveAvatarValue(
        { avatar: "https://cdn.example.com/nova.png" },
        { avatar: null, avatarUrl: "null" },
      ),
    ).toBe("https://cdn.example.com/nova.png");
  });

  it("uses a later valid avatar only when earlier sources are empty", () => {
    expect(
      resolveAvatarValue(
        { avatar: null, avatarUrl: "" },
        { avatarUrl: "/api/ais/nova-001/avatar?v=vvault-identity-v2" },
      ),
    ).toBe("/api/ais/nova-001/avatar?v=vvault-identity-v2");
  });
});

describe("resolveAvatarFields", () => {
  it("returns a normalized avatar pair from the winning source", () => {
    expect(
      resolveAvatarFields(
        { avatar: "avatar", avatarUrl: "null" },
        { avatarUrl: "/api/ais/sera-001/avatar?v=vvault-identity-v2" },
      ),
    ).toEqual({
      avatar: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
      avatarUrl: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
    });
  });

  it("does not let null hydration overwrite both normalized fields", () => {
    expect(
      resolveAvatarFields(
        { avatar: "data:image/svg+xml;base64,bm92YQ==" },
        { avatar: null, avatarUrl: undefined },
      ),
    ).toEqual({
      avatar: "data:image/svg+xml;base64,bm92YQ==",
      avatarUrl: "data:image/svg+xml;base64,bm92YQ==",
    });
  });
});
