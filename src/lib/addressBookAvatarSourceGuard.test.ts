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

function extractResolveAddressBookAvatarObjectCalls(source: string): string[] {
  const calls: string[] = [];
  const needle = "resolveAddressBookAvatar({";
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const start = source.indexOf(needle, searchIndex);
    if (start === -1) break;

    const objectStart = start + "resolveAddressBookAvatar(".length;
    let depth = 0;
    let end = -1;

    for (let index = objectStart; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    if (end === -1) break;
    calls.push(source.slice(start, end));
    searchIndex = end;
  }

  return calls;
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
  expect(sidebarSource).toContain("resolveAvatarFields");
  expect(sidebarSource).not.toContain("resolveAddressBookAvatar");

  const layoutAvatarResolverCalls =
    extractResolveAddressBookAvatarObjectCalls(layoutSource);
  expect(layoutAvatarResolverCalls.length).toBeGreaterThan(0);
  for (const call of layoutAvatarResolverCalls) {
    expect(call).toContain("allowBackendAvatarRoute: true");
  }

  expect(layoutSource).not.toMatch(
    /resolvedAvatar\.avatarSrc[\s\S]{0,500}:\s*(?:threadAvatar|gptAvatar)\.avatar/,
  );
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

  it("keeps both Layout address-book resolver calls trusted for backend avatar routes", () => {
    const layoutAvatarResolverCalls =
      extractResolveAddressBookAvatarObjectCalls(layoutSource);

    expect(layoutAvatarResolverCalls).toHaveLength(2);
    for (const call of layoutAvatarResolverCalls) {
      expect(call).toContain("allowBackendAvatarRoute: true");
    }
  });

  it("keeps VVAULT conversation avatar fields alive before address-book normalization", () => {
    const convAvatarNormalizers =
      layoutSource.match(/const convAvatar = resolveAvatarFields\(conv as any\);/g) || [];
    const convAvatarAssignments =
      layoutSource.match(/avatar:\s*convAvatar\.avatar[\s\S]{0,80}avatarUrl:\s*convAvatar\.avatarUrl/g) || [];

    expect(convAvatarNormalizers).toHaveLength(2);
    expect(convAvatarAssignments).toHaveLength(2);
  });

  it("keeps Sera-specific avatar exceptions out of address-book policy", () => {
    assertAddressBookAvatarSourceOwnership({ policySource, layoutSource, sidebarSource });
  });

  it("fails if the address-book resolver adds a Sera-only avatar fallback", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource:
          'if (constructId === "sera-001") return { avatarSrc: "/api/ais/sera-001/avatar?v=vvault-identity-v2", avatarSource: "sera-canonical" };',
        layoutSource:
          "const avatar = resolveAddressBookAvatar({ ...contact, allowBackendAvatarRoute: true });",
        sidebarSource:
          "const avatar = resolveAvatarFields(conversation).avatar;",
      }),
    ).toThrow();
  });

  it("fails if Layout imports or calls canonical avatar construction", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource:
          'import { buildCanonicalConstructAvatarUrl, resolveAddressBookAvatar } from "../lib/addressBookAvatarPolicy";',
        sidebarSource: "const avatar = resolveAvatarFields(conversation).avatar;",
      }),
    ).toThrow();
  });

  it("fails if Sidebar contains raw canonical avatar policy", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource:
          "const avatar = resolveAddressBookAvatar({ ...contact, allowBackendAvatarRoute: true });",
        sidebarSource:
          'const avatar = resolveAvatarFields(conversation).avatar || "/api/ais/nova-001/avatar";',
      }),
    ).toThrow();
  });

  it("fails if Sidebar starts owning address-book avatar resolution", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource:
          "const avatar = resolveAddressBookAvatar({ ...contact, allowBackendAvatarRoute: true });",
        sidebarSource:
          "const avatar = resolveAvatarFields(conversation).avatar || resolveAddressBookAvatar(conversation).avatarSrc;",
      }),
    ).toThrow();
  });

  it("allows Sidebar to render normalized avatars without owning canonical policy", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource:
          "const avatar = resolveAddressBookAvatar({ ...contact, allowBackendAvatarRoute: true });",
        sidebarSource: "const avatar = resolveAvatarFields(conversation).avatar;",
      }),
    ).not.toThrow();
  });

  it("fails if a Layout resolver call omits backend avatar route trust", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource: `
          const resolvedAvatar = resolveAddressBookAvatar({
            ...contact,
            avatar: threadAvatar.avatar,
            avatarUrl: threadAvatar.avatarUrl,
          });
        `,
        sidebarSource: "const avatar = resolveAvatarFields(conversation).avatar;",
      }),
    ).toThrow();
  });

  it("fails if Layout falls back to a raw avatar after resolver rejection", () => {
    expect(() =>
      assertAddressBookAvatarSourceOwnership({
        policySource: "const avatar = normalizeAvatarUrl(contact.avatar);",
        layoutSource: `
          const resolvedAvatar = resolveAddressBookAvatar({
            ...contact,
            allowBackendAvatarRoute: true,
          });
          return resolvedAvatar.avatarSrc
            ? { ...contact, avatar: resolvedAvatar.avatarSrc }
            : threadAvatar.avatar
              ? { ...contact, avatar: threadAvatar.avatar }
              : contact;
        `,
        sidebarSource: "const avatar = resolveAvatarFields(conversation).avatar;",
      }),
    ).toThrow();
  });
});
