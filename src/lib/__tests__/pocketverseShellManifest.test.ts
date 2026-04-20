import {
  CHATTY_POCKETVERSE_SHELL_MANIFEST,
  POCKETVERSE_PRODUCT_SHELL_MANIFESTS,
  type PocketverseShellManifest,
  validatePocketverseShellManifest,
} from "../pocketverseShellManifest";

function cloneShell(shell: PocketverseShellManifest): PocketverseShellManifest {
  return JSON.parse(JSON.stringify(shell));
}

describe("pocketverseShellManifest", () => {
  it("validates Chatty, Quantum, Code, and VVAULT shell manifests", () => {
    expect(POCKETVERSE_PRODUCT_SHELL_MANIFESTS.map((shell) => shell.productId).sort()).toEqual([
      "chatty",
      "code",
      "quantum",
      "vvault",
    ]);

    for (const shell of POCKETVERSE_PRODUCT_SHELL_MANIFESTS) {
      const validation = validatePocketverseShellManifest(shell);

      expect(validation).toMatchObject({
        ok: true,
        errors: [],
        plaintextContactLeaks: [],
        rematerializationStages: [
          "declared",
          "shell-manifest-valid",
          "not-yet-cloud-sealed",
          "not-yet-hardware-approved",
        ],
      });
      expect(shell.requiredFiles.length).toBeGreaterThan(0);
      expect(shell.clonePolicy.localBodyAuthority).toBe(false);
      expect(shell.clonePolicy.cleanRoomRequired).toBe(true);
    }
  });

  it("rejects local body authority", () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    (shell.clonePolicy as any).localBodyAuthority = true;

    const validation = validatePocketverseShellManifest(shell);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("clonePolicy.localBodyAuthority must be false.");
  });

  it("rejects shell manifests without clean-room materialization", () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    (shell.clonePolicy as any).cleanRoomRequired = false;

    const validation = validatePocketverseShellManifest(shell);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("clonePolicy.cleanRoomRequired must be true.");
  });

  it("rejects missing capsule, glyph, and seed identity", () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    shell.capsuleId = "";
    shell.glyphId = "";
    shell.seedRef = "";

    const validation = validatePocketverseShellManifest(shell);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        "capsuleId is required.",
        "glyphId is required.",
        "seedRef is required.",
      ]),
    );
  });

  it("rejects plaintext contact details in public shell metadata", () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const syntheticContact = ["seed", "invalid.test"].join("@");
    shell.source.ref = `local-snapshot://${syntheticContact}/chatty`;

    const validation = validatePocketverseShellManifest(shell);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("Public shell manifest contains plaintext contact details.");
    expect(validation.plaintextContactLeaks).toContain(syntheticContact);
  });

  it("requires nonempty required files", () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    shell.requiredFiles = [];

    const validation = validatePocketverseShellManifest(shell);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("requiredFiles must be nonempty.");
  });

  it("requires email and phone leak detection patterns", () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    shell.forbiddenPlaintextPatterns = ["secret-token"];

    const validation = validatePocketverseShellManifest(shell);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        "forbiddenPlaintextPatterns must include an email detection pattern.",
        "forbiddenPlaintextPatterns must include a phone detection pattern.",
      ]),
    );
  });
});
