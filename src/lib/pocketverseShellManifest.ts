import * as path from "path";
import {
  ZEN_PRODUCT_REGISTRY,
  type ZenProductSurface,
} from "./zenProductRegistry";

export type PocketverseShellKind =
  | "git-repo-body"
  | "product-runtime-body"
  | "model-body"
  | "sim-body"
  | "thread-body"
  | "vault-folder-body";

export type PocketverseShellSourceType =
  | "local-snapshot"
  | "git-remote"
  | "cloud-artifact"
  | "model-registry";

export type PocketverseRematerializationStage =
  | "declared"
  | "shell-manifest-valid"
  | "seed-verified"
  | "seed-snapshot-packed"
  | "shell-materialized"
  | "wake-check-ready"
  | "not-yet-cloud-sealed"
  | "not-yet-hardware-approved";

export type PocketverseShellManifest = {
  schemaVersion: 1;
  shellId: string;
  pocketverseId: string;
  productId: ZenProductSurface;
  shellKind: PocketverseShellKind;
  displayName: string;
  repoRoot: string;
  capsuleId: string;
  glyphId: string;
  seedRef: string;
  source: {
    type: PocketverseShellSourceType;
    ref: string;
    expectedHash?: string;
  };
  requiredFiles: string[];
  forbiddenPlaintextPatterns: string[];
  wakeChecks: string[];
  clonePolicy: {
    cleanRoomRequired: true;
    localBodyAuthority: false;
    preserveEvidence: true;
    networkAllowed: false;
    mutationRequiresApproval: true;
  };
};

export type PocketverseShellValidationResult = {
  ok: boolean;
  errors: string[];
  plaintextContactLeaks: string[];
  rematerializationStages: PocketverseRematerializationStage[];
};

export const POCKETVERSE_FORBIDDEN_EMAIL_PATTERN =
  String.raw`[a-z0-9._%+-]+[@][a-z0-9.-]+[.][a-z]{2,}`;
export const POCKETVERSE_FORBIDDEN_PHONE_PATTERN =
  String.raw`(?:[+]?1[\s.-]?)?(?:[(]?\d{3}[)]?[\s.-]?)\d{3}[\s.-]?\d{4}`;

export const POCKETVERSE_DEFAULT_FORBIDDEN_PLAINTEXT_PATTERNS = [
  POCKETVERSE_FORBIDDEN_EMAIL_PATTERN,
  POCKETVERSE_FORBIDDEN_PHONE_PATTERN,
] as const;

const EMAIL_CONTACT_PATTERN = new RegExp(POCKETVERSE_FORBIDDEN_EMAIL_PATTERN, "gi");
const PHONE_CONTACT_PATTERN = new RegExp(POCKETVERSE_FORBIDDEN_PHONE_PATTERN, "g");
const EMAIL_PATTERN_SENTINEL = ["seed", "invalid.test"].join("@");
const PHONE_PATTERN_SENTINEL = ["555", "010", "9999"].join("-");
const KNOWN_PRODUCT_IDS = new Set(Object.keys(ZEN_PRODUCT_REGISTRY));
const VALID_SOURCE_TYPES: PocketverseShellSourceType[] = [
  "local-snapshot",
  "git-remote",
  "cloud-artifact",
  "model-registry",
];

const CLONE_POLICY = {
  cleanRoomRequired: true,
  localBodyAuthority: false,
  preserveEvidence: true,
  networkAllowed: false,
  mutationRequiresApproval: true,
} as const;

function stableJson(value: unknown): string {
  return JSON.stringify(value) || "";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function patternMatches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return false;
  }
}

function patternsIncludeContactCoverage(patterns: string[], sentinel: string): boolean {
  return patterns.some((pattern) => patternMatches(pattern, sentinel));
}

function findPlaintextContactLeaks(shell: PocketverseShellManifest): string[] {
  const json = stableJson(shell);
  return unique([
    ...(json.match(EMAIL_CONTACT_PATTERN) || []),
    ...(json.match(PHONE_CONTACT_PATTERN) || []),
  ]);
}

function isKnownProductId(productId: string): boolean {
  return KNOWN_PRODUCT_IDS.has(productId);
}

function isSafeRelativeRequiredFile(filePath: string): boolean {
  const normalized = filePath.trim().replaceAll("\\", "/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !normalized.split("/").includes("..")
  );
}

function defaultForbiddenPlaintextPatterns(): string[] {
  return [...POCKETVERSE_DEFAULT_FORBIDDEN_PLAINTEXT_PATTERNS];
}

function buildShellManifest(input: Omit<PocketverseShellManifest, "schemaVersion" | "clonePolicy">): PocketverseShellManifest {
  return {
    schemaVersion: 1,
    clonePolicy: CLONE_POLICY,
    ...input,
  };
}

export function validatePocketverseShellManifest(
  shell: PocketverseShellManifest,
): PocketverseShellValidationResult {
  const errors: string[] = [];
  const plaintextContactLeaks = findPlaintextContactLeaks(shell);

  if (shell.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (!shell.shellId?.trim()) {
    errors.push("shellId is required.");
  }
  if (!shell.pocketverseId?.trim()) {
    errors.push("pocketverseId is required.");
  }
  if (!shell.displayName?.trim()) {
    errors.push("displayName is required.");
  }
  if (!shell.repoRoot?.trim()) {
    errors.push("repoRoot is required.");
  }
  if (!shell.capsuleId?.trim()) {
    errors.push("capsuleId is required.");
  }
  if (!shell.glyphId?.trim()) {
    errors.push("glyphId is required.");
  }
  if (!shell.seedRef?.trim()) {
    errors.push("seedRef is required.");
  }
  if (!isKnownProductId(String(shell.productId || ""))) {
    errors.push(`productId must match a known Zen product registry entry: ${String(shell.productId || "missing")}.`);
  }
  if (!VALID_SOURCE_TYPES.includes(shell.source?.type)) {
    errors.push("source.type must be a supported shell source type.");
  }
  if (!shell.source?.ref?.trim()) {
    errors.push("source.ref is required.");
  }
  if (!Array.isArray(shell.requiredFiles) || shell.requiredFiles.length === 0) {
    errors.push("requiredFiles must be nonempty.");
  }
  for (const requiredFile of shell.requiredFiles || []) {
    if (!isSafeRelativeRequiredFile(requiredFile)) {
      errors.push(`required file must be a safe relative path: ${requiredFile || "missing"}.`);
    }
  }
  if (!Array.isArray(shell.forbiddenPlaintextPatterns) || shell.forbiddenPlaintextPatterns.length === 0) {
    errors.push("forbiddenPlaintextPatterns must be nonempty.");
  }
  if (!patternsIncludeContactCoverage(shell.forbiddenPlaintextPatterns || [], EMAIL_PATTERN_SENTINEL)) {
    errors.push("forbiddenPlaintextPatterns must include an email detection pattern.");
  }
  if (!patternsIncludeContactCoverage(shell.forbiddenPlaintextPatterns || [], PHONE_PATTERN_SENTINEL)) {
    errors.push("forbiddenPlaintextPatterns must include a phone detection pattern.");
  }
  for (const pattern of shell.forbiddenPlaintextPatterns || []) {
    try {
      new RegExp(pattern);
    } catch {
      errors.push(`forbidden plaintext pattern is not a valid regular expression: ${pattern}.`);
    }
  }
  if (shell.clonePolicy?.cleanRoomRequired !== true) {
    errors.push("clonePolicy.cleanRoomRequired must be true.");
  }
  if (shell.clonePolicy?.localBodyAuthority !== false) {
    errors.push("clonePolicy.localBodyAuthority must be false.");
  }
  if (shell.clonePolicy?.preserveEvidence !== true) {
    errors.push("clonePolicy.preserveEvidence must be true.");
  }
  if (shell.clonePolicy?.networkAllowed !== false) {
    errors.push("clonePolicy.networkAllowed must be false.");
  }
  if (shell.clonePolicy?.mutationRequiresApproval !== true) {
    errors.push("clonePolicy.mutationRequiresApproval must be true.");
  }
  if (plaintextContactLeaks.length > 0) {
    errors.push("Public shell manifest contains plaintext contact details.");
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors: unique(errors),
    plaintextContactLeaks,
    rematerializationStages: ok
      ? ["declared", "shell-manifest-valid", "not-yet-cloud-sealed", "not-yet-hardware-approved"]
      : ["declared"],
  };
}

function siblingRepoRoot(repoName: string): string {
  return process.env[`${repoName.toUpperCase()}_REPO_ROOT`] || path.resolve(process.cwd(), '..', repoName);
}

export const CHATTY_POCKETVERSE_SHELL_MANIFEST = buildShellManifest({
  shellId: "shell_chatty_git_repo_body",
  pocketverseId: "chatty-product-body-pocketverse",
  productId: "chatty",
  shellKind: "git-repo-body",
  displayName: "Chatty Repository Shell",
  repoRoot: process.env.CHATTY_REPO_ROOT || process.cwd(),
  capsuleId: "capsule_chatty_product_body_seed",
  glyphId: "glyph:chatty:canonical-conversation-body:001",
  seedRef: "cloud-sealed-seed://chatty-product-body",
  source: {
    type: "local-snapshot",
    ref: process.env.CHATTY_REPO_ROOT || process.cwd(),
  },
  requiredFiles: [
    "package.json",
    "src/lib/pocketverseManifest.ts",
    "src/lib/pocketverseVerifier.ts",
    "docs/standards/pocketverse-architecture.md",
  ],
  forbiddenPlaintextPatterns: defaultForbiddenPlaintextPatterns(),
  wakeChecks: ZEN_PRODUCT_REGISTRY.chatty.healthChecks,
});

export const QUANTUM_POCKETVERSE_SHELL_MANIFEST = buildShellManifest({
  shellId: "shell_quantum_git_repo_body",
  pocketverseId: "quantum-product-body-pocketverse",
  productId: "quantum",
  shellKind: "git-repo-body",
  displayName: "Quantum Repository Shell",
  repoRoot: siblingRepoRoot('quantum'),
  capsuleId: "capsule_quantum_product_body_seed",
  glyphId: "glyph:quantum:browser-shell-body:001",
  seedRef: "cloud-sealed-seed://quantum-product-body",
  source: {
    type: "local-snapshot",
    ref: siblingRepoRoot('quantum'),
  },
  requiredFiles: [
    "package.json",
    "apps/electron-shell/src/renderer/index.html",
    "apps/electron-shell/src/renderer/main.tsx",
    "apps/electron-shell/src/main/main.ts",
    "apps/electron-shell/vite.config.ts",
  ],
  forbiddenPlaintextPatterns: defaultForbiddenPlaintextPatterns(),
  wakeChecks: ZEN_PRODUCT_REGISTRY.quantum.healthChecks,
});

export const CODE_POCKETVERSE_SHELL_MANIFEST = buildShellManifest({
  shellId: "shell_code_git_repo_body",
  pocketverseId: "code-product-body-pocketverse",
  productId: "code",
  shellKind: "git-repo-body",
  displayName: "Code Repository Shell",
  repoRoot: siblingRepoRoot('code'),
  capsuleId: "capsule_code_product_body_seed",
  glyphId: "glyph:code:maintenance-rematerialization-body:001",
  seedRef: "cloud-sealed-seed://code-product-body",
  source: {
    type: "local-snapshot",
    ref: siblingRepoRoot('code'),
  },
  requiredFiles: [
    "package.json",
    "scripts/open-code-standalone.sh",
    "scripts/code_startup_recovery.mjs",
    "scripts/code_startup_seed_check.mjs",
    "docs/CODE_POCKETVERSE_DEFENSE.md",
    "docs/CODE_STARTUP_CONTRACT.md",
  ],
  forbiddenPlaintextPatterns: defaultForbiddenPlaintextPatterns(),
  wakeChecks: ZEN_PRODUCT_REGISTRY.code.healthChecks,
});

export const VVAULT_POCKETVERSE_SHELL_MANIFEST = buildShellManifest({
  shellId: "shell_vvault_git_repo_body",
  pocketverseId: "vvault-product-body-pocketverse",
  productId: "vvault",
  shellKind: "git-repo-body",
  displayName: "VVAULT Repository Shell",
  repoRoot: siblingRepoRoot('vvault'),
  capsuleId: "capsule_vvault_product_body_seed",
  glyphId: "glyph:vvault:continuity-vault-body:001",
  seedRef: "cloud-sealed-seed://vvault-product-body",
  source: {
    type: "local-snapshot",
    ref: siblingRepoRoot('vvault'),
  },
  requiredFiles: [
    "package.json",
    "bin/vvault",
    "docs/VVAULT_STARTUP_CONTRACT.md",
    "docs/ZEN_DEV_PANEL_CANON.md",
    "docs/role-in-ecosystem.md",
  ],
  forbiddenPlaintextPatterns: defaultForbiddenPlaintextPatterns(),
  wakeChecks: ZEN_PRODUCT_REGISTRY.vvault.healthChecks,
});

export const POCKETVERSE_PRODUCT_SHELL_MANIFESTS = [
  CHATTY_POCKETVERSE_SHELL_MANIFEST,
  QUANTUM_POCKETVERSE_SHELL_MANIFEST,
  CODE_POCKETVERSE_SHELL_MANIFEST,
  VVAULT_POCKETVERSE_SHELL_MANIFEST,
] as const;
