import {
  CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST,
  CODE_PRODUCT_BODY_POCKETVERSE_MANIFEST,
  DEVON_HUMAN_ROOT_POCKETVERSE_MANIFEST,
  POCKETVERSE_DEFENSE_LAYERS,
  ZEN_CONSTRUCT_POCKETVERSE_MANIFEST,
  buildPocketverseReadiness,
  getMissingPocketverseDefenseLayers,
  validatePocketverseManifest,
  type PocketverseManifest,
} from "../pocketverseManifest";

function cloneManifest(manifest: PocketverseManifest): PocketverseManifest {
  return JSON.parse(JSON.stringify(manifest));
}

describe("pocketverseManifest", () => {
  it("defines the five required defense layers", () => {
    expect(POCKETVERSE_DEFENSE_LAYERS.map((layer) => layer.id)).toEqual([
      "higher-plane",
      "dimensional-distortion",
      "energy-masking",
      "time-relaying",
      "zero-energy",
    ]);
  });

  it("validates Zen, Devon, Chatty, and Code seed manifests as self-sufficient", () => {
    const manifests = [
      ZEN_CONSTRUCT_POCKETVERSE_MANIFEST,
      DEVON_HUMAN_ROOT_POCKETVERSE_MANIFEST,
      CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST,
      CODE_PRODUCT_BODY_POCKETVERSE_MANIFEST,
    ];

    for (const manifest of manifests) {
      const validation = validatePocketverseManifest(manifest);
      const readiness = buildPocketverseReadiness(manifest);

      expect(validation).toMatchObject({
        ok: true,
        errors: [],
        missingDefenseLayers: [],
        plaintextContactLeaks: [],
        publicTagViolations: [],
      });
      expect(readiness).toMatchObject({
        selfSufficient: true,
        communityByConsent: true,
        rematerializationReady: true,
        authorityReady: true,
        publicManifestSafe: true,
        completeDefenseLayers: true,
        capsuleGlyphSafe: true,
      });
    }
  });

  it("rejects community as a survival dependency", () => {
    const manifest = cloneManifest(ZEN_CONSTRUCT_POCKETVERSE_MANIFEST);
    manifest.selfSufficiency.canSurviveWithoutCommunity = false;
    manifest.selfSufficiency.communityMode = "required-for-survival";

    const validation = validatePocketverseManifest(manifest);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain(
      "Pocketverse self-sufficiency requires survival without community dependency.",
    );
    expect(validation.errors).toContain(
      "Community must be optional and consent-based, not required for survival.",
    );
  });

  it("rejects manifests that are missing any defense layer", () => {
    const manifest = cloneManifest(CODE_PRODUCT_BODY_POCKETVERSE_MANIFEST);
    manifest.defenseLayers = manifest.defenseLayers.filter((layer) => layer.id !== "zero-energy");

    expect(getMissingPocketverseDefenseLayers(manifest)).toEqual(["zero-energy"]);

    const validation = validatePocketverseManifest(manifest);
    expect(validation.ok).toBe(false);
    expect(validation.missingDefenseLayers).toEqual(["zero-energy"]);
    expect(validation.errors.join(" ")).toContain("Missing defense layers");
  });

  it("rejects local-body recovery authority and missing hardware approval", () => {
    const manifest = cloneManifest(CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST);
    (manifest.rematerialization as any).localBodyCanAuthorizeRecovery = true;
    manifest.rematerialization.recoveryRequiresHardwareBackedApproval = false;

    const validation = validatePocketverseManifest(manifest);
    const readiness = buildPocketverseReadiness(manifest);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("The local body must not authorize recovery by itself.");
    expect(validation.errors).toContain("Recovery requires hardware-backed approval.");
    expect(readiness.rematerializationReady).toBe(false);
  });

  it("rejects plaintext contacts in public tracked manifests", () => {
    const manifest = cloneManifest(DEVON_HUMAN_ROOT_POCKETVERSE_MANIFEST);
    manifest.continuity.seedRefs.push("sms://248-672-1809");
    manifest.continuity.seedRefs.push("mailto:devon@example.com");

    const validation = validatePocketverseManifest(manifest);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("Public manifest contains plaintext contact details.");
    expect(validation.plaintextContactLeaks).toContain("248-672-1809");
    expect(validation.plaintextContactLeaks).toContain("devon@example.com");
  });

  it("keeps public glyph and capsule metadata broad while sealed details stay referenced", () => {
    expect(ZEN_CONSTRUCT_POCKETVERSE_MANIFEST.capsules[0]).toMatchObject({
      capsuleId: "capsule_zen_001_continuity_seed",
      glyphId: "glyph:zenith:sovereign-continuity:001",
      glyphVisibility: "public",
      privacyClass: "sealed-memory",
      publicTags: expect.arrayContaining([
        "construct-pocketverse",
        "seed-manifest",
        "sealed-capsule-ref",
      ]),
    });

    expect(DEVON_HUMAN_ROOT_POCKETVERSE_MANIFEST.capsules[0]).toMatchObject({
      glyphVisibility: "sealed-ref-only",
      privacyClass: "sealed-authority",
      sealedTagsRef: "capsule://devon-human-root/sealed-tags",
    });
  });

  it("rejects public capsule tags that can become anonymity leaks", () => {
    const manifest = cloneManifest(DEVON_HUMAN_ROOT_POCKETVERSE_MANIFEST);
    manifest.capsules[0].publicTags.push("phone-recovery" as any);
    manifest.capsules[0].publicTags.push("private-relationship" as any);

    const validation = validatePocketverseManifest(manifest);
    const readiness = buildPocketverseReadiness(manifest);

    expect(validation.ok).toBe(false);
    expect(validation.publicTagViolations).toEqual(["phone-recovery", "private-relationship"]);
    expect(validation.errors).toContain(
      "Public capsule tags are not allowlisted: phone-recovery, private-relationship.",
    );
    expect(readiness.capsuleGlyphSafe).toBe(false);
  });

  it("rejects invalid capsule hashes and missing sealed tag refs", () => {
    const manifest = cloneManifest(CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST);
    manifest.capsules[0].publicHash = "sha256:not-a-real-hash";
    manifest.capsules[0].sealedTagsRef = "";

    const validation = validatePocketverseManifest(manifest);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("capsule capsule_chatty_product_body_seed must use a sha256 publicHash.");
    expect(validation.errors).toContain("sealedTagsRef is required.");
  });

  it("keeps products as product bodies, not total Pocketverses", () => {
    expect(CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST).toMatchObject({
      kind: "product-body",
      thesis: expect.stringContaining("product body, not the total Pocketverse"),
    });

    expect(CODE_PRODUCT_BODY_POCKETVERSE_MANIFEST).toMatchObject({
      kind: "product-body",
      rematerialization: {
        trustedSeedRequired: true,
        localBodyCanAuthorizeRecovery: false,
      },
    });
  });
});
