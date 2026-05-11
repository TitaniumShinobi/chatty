import * as fs from "fs";
import * as path from "path";

const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

interface AddressBookAvatarSourceSet {
  policySource: string;
  layoutSource: string;
  sidebarSource: string;
}

function assertAddressBookAvatarSourceOwnership({
  policySource,
  layoutSource,
  sidebarSource,
}: AddressBookAvatarSourceSet): void {
  expect(policySource).not.toContain("buildCanonicalConstructAvatarUrl");
  expect(policySource).not.toContain("sera-canonical");
  expect(policySource).not.toMatch(/constructId\s*={0,2}={1,2}\s*["']sera-001["']/);
  expect(policySource).not.toMatch(/["'`]\/api\/ais\/[^"'`]+\/avatar/);
  expect(layoutSource).not.toContain("buildCanonicalConstructAvatarUrl");
  expect(sidebarSource).not.toContain("buildCanonicalConstructAvatarUrl");
  expect(layoutSource).not.toMatch(/\/api\/ais\/[^"'`]+\/avatar/);
  expect(sidebarSource).not.toMatch(/\/api\/ais\/[^"'`]+\/avatar/);
  expect(layoutSource).toContain("resolveAddressBookAvatar");
  expect(sidebarSource).toContain("normalizeAvatarUrl");
  expect(sidebarSource).not.toContain("resolveAddressBookAvatar");
}

describe("address book avatar source guard", () => {
  const policySource = readSource("src/lib/addressBookAvatarPolicy.ts");
  const layoutSource = readSource("src/components/Layout.tsx");
  const sidebarSource = readSource("src/components/Sidebar.tsx");

  it("keeps canonical avatar construction out of Layout and Sidebar", () => {
    assertAddressBookAvatarSourceOwnership({ policySource, layoutSource, sidebarSource });
  });

  it("keeps address-book avatar policy routed through the resolver", () => {
    assertAddressBookAvatarSourceOwnership({ policySource, layoutSource, sidebarSource });
  });

  it("keeps Sera-specific avatar exceptions out of address-book policy", () => {
    assertAddressBookAvatarSourceOwnership({ policySource, layoutSource, sidebarSource });
  });

  it("fails if the address-book resolver adds a Sera-only avatar fallback", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource:
          'if (constructId === "sera-001") return { avatarSrc: "/api/ais/sera-001/avatar?v=vvault-identity-v2", avatarSource: "sera-canonical" };',
        layoutSource: "const avatar = resolveAddressBookAvatar(contact);",
        sidebarSource:
          "const avatar = normalizeAvatarUrl(conversation.avatar) || normalizeAvatarUrl(conversation.avatarUrl);",
      }),
    ).toThrow();
  });

  it("fails if Layout imports or calls canonical avatar construction", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource:
          'import { buildCanonicalConstructAvatarUrl, resolveAddressBookAvatar } from "../lib/addressBookAvatarPolicy";',
        sidebarSource: "const avatar = normalizeAvatarUrl(conversation.avatar);",
      }),
    ).toThrow();
  });

  it("fails if Sidebar contains raw canonical avatar policy", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource: "const avatar = resolveAddressBookAvatar(contact);",
        sidebarSource:
          'const avatar = normalizeAvatarUrl(conversation.avatar) || "/api/ais/nova-001/avatar";',
      }),
    ).toThrow();
  });

  it("fails if Sidebar starts owning address-book avatar resolution", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource: "const avatar = resolveAddressBookAvatar(contact);",
        sidebarSource:
          "const avatar = normalizeAvatarUrl(conversation.avatar) || resolveAddressBookAvatar(conversation).avatarSrc;",
      }),
    ).toThrow();
  });

  it("allows Sidebar to render normalized avatars without owning canonical policy", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource: "const avatar = resolveAddressBookAvatar(contact);",
        sidebarSource:
          "const avatar = normalizeAvatarUrl(conversation.avatar) || normalizeAvatarUrl(conversation.avatarUrl);",
      }),
    ).not.toThrow();
  });
});
