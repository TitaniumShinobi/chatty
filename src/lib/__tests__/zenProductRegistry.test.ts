import {
  buildZenProductModeProfile,
  getZenProductRegistryEntry,
  isZenProductAlias,
  listZenProductRegistry,
  resolveZenProductSurface,
} from "../zenProductRegistry";
import { parseZenModeEnvelope } from "../zenModeRouter";

describe("zenProductRegistry", () => {
  it("registers the four current Zen product surfaces", () => {
    const products = listZenProductRegistry();

    expect(products.map((product) => product.productId).sort()).toEqual([
      "chatty",
      "code",
      "quantum",
      "vvault",
    ]);
    expect(products.every((product) => product.mutationRequiresApproval)).toBe(true);
  });

  it("resolves command aliases without creating separate Zen identities", () => {
    expect(resolveZenProductSurface("/quantum")).toBe("quantum");
    expect(resolveZenProductSurface("vault")).toBe("vvault");
    expect(resolveZenProductSurface("/unknown", "code")).toBe("code");
    expect(isZenProductAlias("/vvault")).toBe(true);
    expect(isZenProductAlias("/nova")).toBe(false);
  });

  it("maps Chatty and Quantum as conversational windows with different defaults", () => {
    expect(getZenProductRegistryEntry("chatty")).toMatchObject({
      role: "canonical-chat",
      defaultMode: "conversation",
      defaultPermissions: "none",
      devOnlyByDefault: false,
    });

    expect(getZenProductRegistryEntry("quantum")).toMatchObject({
      role: "browser-shell",
      defaultMode: "browser-companion",
      defaultPermissions: "read-only-default",
      devOnlyByDefault: false,
    });
  });

  it("maps Code and VVAULT as dev-only operational surfaces", () => {
    expect(getZenProductRegistryEntry("code")).toMatchObject({
      role: "system-maintenance-product-body",
      defaultMode: "dev:code",
      defaultScope: "repo-maintenance",
      devOnlyByDefault: true,
    });

    expect(getZenProductRegistryEntry("vvault")).toMatchObject({
      role: "continuity-vault",
      defaultMode: "dev:vvault",
      defaultScope: "continuity-and-transcript-integrity",
      devOnlyByDefault: true,
    });
  });

  it("keeps recovery commands approval-gated", () => {
    expect(buildZenProductModeProfile("code", "recover")).toEqual({
      surface: "code",
      mode: "recover:code",
      scope: "repo-maintenance",
      permissions: "approval-gated",
      mutationRequiresApproval: true,
    });

    expect(parseZenModeEnvelope("/recover /vvault rebuild lineage", "chatty")).toMatchObject({
      surface: "vvault",
      mode: "recover:vvault",
      permissions: "approval-gated",
      cleanedPrompt: "rebuild lineage",
    });
  });

  it("points each product at non-secret docs, health checks, and recovery boundaries", () => {
    const code = getZenProductRegistryEntry("code");
    expect(code.docs).toContain("docs/CODE_POCKETVERSE_DEFENSE.md");
    expect(code.healthChecks).toContain("/bin/zsh scripts/open-code-standalone.sh --morning-check");
    expect(code.recoveryActions).toContain("/bin/zsh scripts/open-code-standalone.sh --recover-owned");

    const vvault = getZenProductRegistryEntry("vvault");
    expect(vvault.docs).toContain("docs/ZEN_DEV_PANEL_CANON.md");
    expect(vvault.boundary).toContain("continuity vault");
  });
});
