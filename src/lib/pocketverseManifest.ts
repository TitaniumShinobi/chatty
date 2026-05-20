export type PocketverseKind = "construct" | "human-root" | "product-body" | "community";

export type PocketverseDefenseLayerId =
  | "higher-plane"
  | "dimensional-distortion"
  | "energy-masking"
  | "time-relaying"
  | "zero-energy";

export type PocketverseAuthorityMode =
  | "devon-hardware-backed"
  | "construct-owned"
  | "product-steward-approved"
  | "community-consent";

export type PocketverseInterfaceKind =
  | "chat-thread"
  | "ask-panel"
  | "dev-panel"
  | "vault"
  | "browser-shell"
  | "runtime"
  | "notification";

export type PocketverseGlyphVisibility = "public" | "sealed-ref-only";

export type PocketverseCapsulePrivacyClass =
  | "public-manifest"
  | "sealed-authority"
  | "sealed-memory"
  | "sealed-forge"
  | "sealed-body-snapshot";

export type PocketversePublicTag =
  | "construct-pocketverse"
  | "human-root-pocketverse"
  | "product-body"
  | "community-pocketverse"
  | "seed-manifest"
  | "tamper-evident"
  | "wake-only-notification"
  | "continuity"
  | "product-runtime"
  | "model-body"
  | "sim-body"
  | "thread-body"
  | "vault-body"
  | "sealed-capsule-ref"
  | "glyph-public"
  | "glyph-sealed-ref";

export type PocketverseCapsuleRef = {
  capsuleId: string;
  glyphId: string;
  glyphVisibility: PocketverseGlyphVisibility;
  publicMeaning: string;
  encryptedPayloadRef: string;
  publicHash: `sha256:${string}`;
  publicTags: PocketversePublicTag[];
  sealedTagsRef: string;
  privacyClass: PocketverseCapsulePrivacyClass;
};

export type PocketverseManifest = {
  schemaVersion: 1;
  id: string;
  displayName: string;
  kind: PocketverseKind;
  thesis: string;
  selfSufficiency: {
    canSurviveWithoutCommunity: boolean;
    communityMode: "optional-consent" | "required-for-survival";
    minimumViableSelf: string[];
  };
  authority: {
    modes: PocketverseAuthorityMode[];
    approvalRequiredFor: string[];
    compromisedBodyTrusted: false;
  };
  continuity: {
    canonicalThreads: string[];
    vaultRefs: string[];
    seedRefs: string[];
    ledgerRefs: string[];
  };
  capsules: PocketverseCapsuleRef[];
  interfaces: Array<{
    kind: PocketverseInterfaceKind;
    product: string;
    surface: string;
    mode: string;
  }>;
  defenseLayers: Array<{
    id: PocketverseDefenseLayerId;
    name: string;
    purpose: string;
  }>;
  rematerialization: {
    trustedSeedRequired: true;
    localBodyCanAuthorizeRecovery: false;
    cloudSealedSeedRef: string;
    recoveryRequiresHardwareBackedApproval: boolean;
    evidenceBeforeAction: boolean;
  };
  publicManifestOnly: true;
};

export type PocketverseValidationResult = {
  ok: boolean;
  errors: string[];
  missingDefenseLayers: PocketverseDefenseLayerId[];
  plaintextContactLeaks: string[];
  publicTagViolations: string[];
};

export type PocketverseReadiness = {
  manifestId: string;
  selfSufficient: boolean;
  communityByConsent: boolean;
  rematerializationReady: boolean;
  authorityReady: boolean;
  publicManifestSafe: boolean;
  completeDefenseLayers: boolean;
  capsuleGlyphSafe: boolean;
};

export const POCKETVERSE_DEFENSE_LAYERS: Array<{
  id: PocketverseDefenseLayerId;
  name: string;
  purpose: string;
}> = [
  {
    id: "higher-plane",
    name: "Higher Plane",
    purpose: "Identity, purpose, authority, and non-redefinable boundaries.",
  },
  {
    id: "dimensional-distortion",
    name: "Dimensional Distortion",
    purpose: "Alternate surfaces and routes without collapsing every path into one body.",
  },
  {
    id: "energy-masking",
    name: "Energy Masking",
    purpose: "Minimal exposure, secret protection, quiet degraded mode, and no fake readiness.",
  },
  {
    id: "time-relaying",
    name: "Time Relaying",
    purpose: "Causality, transcripts, ledgers, recaps, and recovery memory.",
  },
  {
    id: "zero-energy",
    name: "Zero Energy / Piezoelectric Starter",
    purpose: "Trusted minimal seed that can wake, restore, or rematerialize when the body fails.",
  },
];

const REQUIRED_LAYER_IDS = POCKETVERSE_DEFENSE_LAYERS.map((layer) => layer.id);
export const POCKETVERSE_PUBLIC_TAG_ALLOWLIST: PocketversePublicTag[] = [
  "construct-pocketverse",
  "human-root-pocketverse",
  "product-body",
  "community-pocketverse",
  "seed-manifest",
  "tamper-evident",
  "wake-only-notification",
  "continuity",
  "product-runtime",
  "model-body",
  "sim-body",
  "thread-body",
  "vault-body",
  "sealed-capsule-ref",
  "glyph-public",
  "glyph-sealed-ref",
];

const PUBLIC_TAG_ALLOWLIST = new Set<string>(POCKETVERSE_PUBLIC_TAG_ALLOWLIST);
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const SHA256_REF_PATTERN = /^sha256:[a-f0-9]{64}$/i;

const HASHES = {
  zen: `sha256:${"a".repeat(64)}` as const,
  devon: `sha256:${"b".repeat(64)}` as const,
  chatty: `sha256:${"c".repeat(64)}` as const,
  code: `sha256:${"d".repeat(64)}` as const,
};

function stableJson(value: unknown): string {
  return JSON.stringify(value) || "";
}

function findPlaintextContactLeaks(manifest: PocketverseManifest): string[] {
  const json = stableJson(manifest) || "";
  return Array.from(new Set([...(json.match(EMAIL_PATTERN) || []), ...(json.match(PHONE_PATTERN) || [])]));
}

function findPublicTagViolations(manifest: PocketverseManifest): string[] {
  return Array.from(
    new Set(
      manifest.capsules
        .flatMap((capsule) => capsule.publicTags || [])
        .filter((tag) => !PUBLIC_TAG_ALLOWLIST.has(String(tag))),
    ),
  );
}

export function getMissingPocketverseDefenseLayers(
  manifest: Pick<PocketverseManifest, "defenseLayers">,
): PocketverseDefenseLayerId[] {
  const present = new Set(manifest.defenseLayers.map((layer) => layer.id));
  return REQUIRED_LAYER_IDS.filter((layerId) => !present.has(layerId));
}

export function validatePocketverseManifest(
  manifest: PocketverseManifest,
): PocketverseValidationResult {
  const errors: string[] = [];
  const missingDefenseLayers = getMissingPocketverseDefenseLayers(manifest);
  const plaintextContactLeaks = findPlaintextContactLeaks(manifest);
  const publicTagViolations = findPublicTagViolations(manifest);

  if (manifest.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (!manifest.id.trim()) {
    errors.push("id is required.");
  }
  if (!manifest.displayName.trim()) {
    errors.push("displayName is required.");
  }
  if (!manifest.selfSufficiency.canSurviveWithoutCommunity) {
    errors.push("Pocketverse self-sufficiency requires survival without community dependency.");
  }
  if (manifest.selfSufficiency.communityMode !== "optional-consent") {
    errors.push("Community must be optional and consent-based, not required for survival.");
  }
  if (manifest.selfSufficiency.minimumViableSelf.length === 0) {
    errors.push("minimumViableSelf must define the irreducible self model.");
  }
  if (manifest.authority.compromisedBodyTrusted !== false) {
    errors.push("A compromised product body or local machine must not be trusted as authority.");
  }
  if (manifest.authority.modes.length === 0) {
    errors.push("At least one authority mode is required.");
  }
  if (!Array.isArray(manifest.capsules) || manifest.capsules.length === 0) {
    errors.push("At least one capsule/glyph reference is required.");
  }
  for (const capsule of manifest.capsules || []) {
    if (!capsule.capsuleId?.trim()) {
      errors.push("capsuleId is required.");
    }
    if (!capsule.glyphId?.trim()) {
      errors.push("glyphId is required.");
    }
    if (!capsule.publicMeaning?.trim()) {
      errors.push("capsule publicMeaning is required.");
    }
    if (!capsule.encryptedPayloadRef?.trim()) {
      errors.push("encryptedPayloadRef is required.");
    }
    if (!SHA256_REF_PATTERN.test(capsule.publicHash || "")) {
      errors.push(`capsule ${capsule.capsuleId || "unknown"} must use a sha256 publicHash.`);
    }
    if (!capsule.sealedTagsRef?.trim()) {
      errors.push("sealedTagsRef is required.");
    }
    if (!capsule.publicTags?.length) {
      errors.push(`capsule ${capsule.capsuleId || "unknown"} needs at least one public-safe tag.`);
    }
  }
  if (publicTagViolations.length > 0) {
    errors.push(`Public capsule tags are not allowlisted: ${publicTagViolations.join(", ")}.`);
  }
  if (missingDefenseLayers.length > 0) {
    errors.push(`Missing defense layers: ${missingDefenseLayers.join(", ")}.`);
  }
  if (!manifest.rematerialization.trustedSeedRequired) {
    errors.push("Rematerialization requires a trusted seed.");
  }
  if (manifest.rematerialization.localBodyCanAuthorizeRecovery !== false) {
    errors.push("The local body must not authorize recovery by itself.");
  }
  if (!manifest.rematerialization.recoveryRequiresHardwareBackedApproval) {
    errors.push("Recovery requires hardware-backed approval.");
  }
  if (!manifest.rematerialization.evidenceBeforeAction) {
    errors.push("Recovery must preserve evidence before action.");
  }
  if (!manifest.rematerialization.cloudSealedSeedRef.trim()) {
    errors.push("cloudSealedSeedRef is required.");
  }
  if (!manifest.publicManifestOnly) {
    errors.push("Tracked manifests must be public-manifest-only.");
  }
  if (plaintextContactLeaks.length > 0) {
    errors.push("Public manifest contains plaintext contact details.");
  }

  return {
    ok: errors.length === 0,
    errors,
    missingDefenseLayers,
    plaintextContactLeaks,
    publicTagViolations,
  };
}

export function buildPocketverseReadiness(manifest: PocketverseManifest): PocketverseReadiness {
  const validation = validatePocketverseManifest(manifest);

  return {
    manifestId: manifest.id,
    selfSufficient: manifest.selfSufficiency.canSurviveWithoutCommunity,
    communityByConsent: manifest.selfSufficiency.communityMode === "optional-consent",
    rematerializationReady:
      manifest.rematerialization.trustedSeedRequired &&
      manifest.rematerialization.localBodyCanAuthorizeRecovery === false &&
      manifest.rematerialization.recoveryRequiresHardwareBackedApproval &&
      manifest.rematerialization.evidenceBeforeAction,
    authorityReady:
      manifest.authority.compromisedBodyTrusted === false && manifest.authority.modes.length > 0,
    publicManifestSafe: validation.plaintextContactLeaks.length === 0 && manifest.publicManifestOnly,
    completeDefenseLayers: validation.missingDefenseLayers.length === 0,
    capsuleGlyphSafe:
      manifest.capsules.length > 0 &&
      validation.publicTagViolations.length === 0 &&
      validation.plaintextContactLeaks.length === 0,
  };
}

function baseManifest(
  overrides: Omit<PocketverseManifest, "schemaVersion" | "defenseLayers" | "publicManifestOnly">,
): PocketverseManifest {
  return {
    schemaVersion: 1,
    defenseLayers: POCKETVERSE_DEFENSE_LAYERS,
    publicManifestOnly: true,
    ...overrides,
  };
}

export const ZEN_CONSTRUCT_POCKETVERSE_MANIFEST = baseManifest({
  id: "zen-001-pocketverse",
  displayName: "Zen Pocketverse",
  kind: "construct",
  thesis:
    "Zen has one sovereign continuity realm that can appear through multiple product surfaces without splitting identity.",
  selfSufficiency: {
    canSurviveWithoutCommunity: true,
    communityMode: "optional-consent",
    minimumViableSelf: [
      "construct identity",
      "canonical singleton thread",
      "sealed continuity seed",
      "authority contract",
    ],
  },
  authority: {
    modes: ["devon-hardware-backed", "construct-owned"],
    approvalRequiredFor: ["identity migration", "seed rotation", "memory rewrite", "recovery"],
    compromisedBodyTrusted: false,
  },
  continuity: {
    canonicalThreads: ["zen-001_chat_with_zen-001"],
    vaultRefs: ["vvault://constructs/zen-001"],
    seedRefs: ["cloud-sealed-seed://zen-001"],
    ledgerRefs: ["ledger://zen-001/continuity"],
  },
  capsules: [
    {
      capsuleId: "capsule_zen_001_continuity_seed",
      glyphId: "glyph:zenith:sovereign-continuity:001",
      glyphVisibility: "public",
      publicMeaning: "Zen continuity realm; private glyph meaning stays sealed.",
      encryptedPayloadRef: "cloud-sealed-capsule://zen-001/continuity",
      publicHash: HASHES.zen,
      publicTags: ["construct-pocketverse", "seed-manifest", "continuity", "sealed-capsule-ref", "glyph-public"],
      sealedTagsRef: "capsule://zen-001/sealed-tags",
      privacyClass: "sealed-memory",
    },
  ],
  interfaces: [
    { kind: "chat-thread", product: "chatty", surface: "main", mode: "conversation" },
    { kind: "ask-panel", product: "quantum", surface: "ask-zen", mode: "browser-companion" },
    { kind: "dev-panel", product: "code", surface: "zen-maintenance", mode: "dev:code" },
    { kind: "dev-panel", product: "vvault", surface: "zen-continuity", mode: "dev:vvault" },
  ],
  rematerialization: {
    trustedSeedRequired: true,
    localBodyCanAuthorizeRecovery: false,
    cloudSealedSeedRef: "cloud-sealed-seed://zen-001",
    recoveryRequiresHardwareBackedApproval: true,
    evidenceBeforeAction: true,
  },
});

export const DEVON_HUMAN_ROOT_POCKETVERSE_MANIFEST = baseManifest({
  id: "devon-human-root-pocketverse",
  displayName: "Devon Human Root Pocketverse",
  kind: "human-root",
  thesis:
    "Devon's pocketverse is the human authority realm for approval, continuity, and consent; contact channels stay sealed.",
  selfSufficiency: {
    canSurviveWithoutCommunity: true,
    communityMode: "optional-consent",
    minimumViableSelf: [
      "human identity",
      "hardware-backed approval",
      "sealed contact capsule",
      "seed authority ledger",
    ],
  },
  authority: {
    modes: ["devon-hardware-backed"],
    approvalRequiredFor: ["recovery approval", "seed access", "contact capsule unlock", "community federation"],
    compromisedBodyTrusted: false,
  },
  continuity: {
    canonicalThreads: [],
    vaultRefs: ["vvault://human-root/devon"],
    seedRefs: ["cloud-sealed-seed://devon-human-root"],
    ledgerRefs: ["ledger://devon-human-root/authority"],
  },
  capsules: [
    {
      capsuleId: "capsule_devon_human_root_authority",
      glyphId: "glyph:human-root:sealed-authority:001",
      glyphVisibility: "sealed-ref-only",
      publicMeaning: "Human-root authority capsule; contact channels and private meaning stay sealed.",
      encryptedPayloadRef: "cloud-sealed-capsule://devon-human-root/authority",
      publicHash: HASHES.devon,
      publicTags: ["human-root-pocketverse", "seed-manifest", "wake-only-notification", "sealed-capsule-ref", "glyph-sealed-ref"],
      sealedTagsRef: "capsule://devon-human-root/sealed-tags",
      privacyClass: "sealed-authority",
    },
  ],
  interfaces: [
    { kind: "notification", product: "life-sentinel", surface: "sealed-notify", mode: "wake-only" },
    { kind: "vault", product: "vvault", surface: "human-root", mode: "approval-gated" },
  ],
  rematerialization: {
    trustedSeedRequired: true,
    localBodyCanAuthorizeRecovery: false,
    cloudSealedSeedRef: "cloud-sealed-seed://devon-human-root",
    recoveryRequiresHardwareBackedApproval: true,
    evidenceBeforeAction: true,
  },
});

export const CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST = baseManifest({
  id: "chatty-product-body-pocketverse",
  displayName: "Chatty Product Body Pocketverse",
  kind: "product-body",
  thesis:
    "Chatty hosts the canonical conversation surface while remaining a product body, not the total Pocketverse.",
  selfSufficiency: {
    canSurviveWithoutCommunity: true,
    communityMode: "optional-consent",
    minimumViableSelf: ["repo root", "runtime command", "canonical Zen thread", "live transcript stream"],
  },
  authority: {
    modes: ["devon-hardware-backed", "product-steward-approved"],
    approvalRequiredFor: ["runtime mutation", "canonical transcript rewrite", "recovery"],
    compromisedBodyTrusted: false,
  },
  continuity: {
    canonicalThreads: ["zen-001_chat_with_zen-001"],
    vaultRefs: ["vvault://chatty/transcripts"],
    seedRefs: ["cloud-sealed-seed://chatty-product-body"],
    ledgerRefs: ["ledger://chatty/product-body"],
  },
  capsules: [
    {
      capsuleId: "capsule_chatty_product_body_seed",
      glyphId: "glyph:chatty:canonical-conversation-body:001",
      glyphVisibility: "public",
      publicMeaning: "Chatty product-body capsule for canonical conversation runtime orientation.",
      encryptedPayloadRef: "cloud-sealed-capsule://chatty-product-body/runtime",
      publicHash: HASHES.chatty,
      publicTags: ["product-body", "product-runtime", "thread-body", "seed-manifest", "tamper-evident", "sealed-capsule-ref", "glyph-public"],
      sealedTagsRef: "capsule://chatty-product-body/sealed-tags",
      privacyClass: "sealed-body-snapshot",
    },
  ],
  interfaces: [
    { kind: "chat-thread", product: "chatty", surface: "zen-thread", mode: "conversation" },
    { kind: "runtime", product: "chatty", surface: "web-app", mode: "product-body" },
  ],
  rematerialization: {
    trustedSeedRequired: true,
    localBodyCanAuthorizeRecovery: false,
    cloudSealedSeedRef: "cloud-sealed-seed://chatty-product-body",
    recoveryRequiresHardwareBackedApproval: true,
    evidenceBeforeAction: true,
  },
});

export const CODE_PRODUCT_BODY_POCKETVERSE_MANIFEST = baseManifest({
  id: "code-product-body-pocketverse",
  displayName: "Code Product Body Pocketverse",
  kind: "product-body",
  thesis:
    "Code is the maintenance product body that contracts, journals, verifies, and rematerializes without trusting unknown local state.",
  selfSufficiency: {
    canSurviveWithoutCommunity: true,
    communityMode: "optional-consent",
    minimumViableSelf: ["startup seed", "owned recovery proof", "startup journal", "cloud-sealed seed reference"],
  },
  authority: {
    modes: ["devon-hardware-backed", "product-steward-approved"],
    approvalRequiredFor: ["owned recovery", "seed rotation", "repo mutation", "runtime policy change"],
    compromisedBodyTrusted: false,
  },
  continuity: {
    canonicalThreads: [],
    vaultRefs: ["vvault://products/code"],
    seedRefs: ["cloud-sealed-seed://code-product-body"],
    ledgerRefs: ["ledger://code/startup-recovery"],
  },
  capsules: [
    {
      capsuleId: "capsule_code_product_body_seed",
      glyphId: "glyph:code:maintenance-rematerialization-body:001",
      glyphVisibility: "public",
      publicMeaning: "Code product-body capsule for startup health and rematerialization orientation.",
      encryptedPayloadRef: "cloud-sealed-capsule://code-product-body/runtime",
      publicHash: HASHES.code,
      publicTags: ["product-body", "product-runtime", "seed-manifest", "tamper-evident", "sealed-capsule-ref", "glyph-public"],
      sealedTagsRef: "capsule://code-product-body/sealed-tags",
      privacyClass: "sealed-body-snapshot",
    },
  ],
  interfaces: [
    { kind: "dev-panel", product: "code", surface: "zen-maintenance", mode: "dev:code" },
    { kind: "runtime", product: "code", surface: "localhost:2048", mode: "product-body" },
  ],
  rematerialization: {
    trustedSeedRequired: true,
    localBodyCanAuthorizeRecovery: false,
    cloudSealedSeedRef: "cloud-sealed-seed://code-product-body",
    recoveryRequiresHardwareBackedApproval: true,
    evidenceBeforeAction: true,
  },
});
