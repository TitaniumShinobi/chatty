import {
  buildCanonicalConstructAvatarUrl,
  normalizeAvatarUrl,
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
