export type ZenProductSurface = "chatty" | "quantum" | "code" | "vvault";

export type ZenProductMode =
  | "conversation"
  | "browser-companion"
  | "dev:chatty"
  | "dev:quantum"
  | "dev:code"
  | "dev:vvault"
  | "safe:chatty"
  | "safe:quantum"
  | "safe:code"
  | "safe:vvault"
  | "recover:chatty"
  | "recover:quantum"
  | "recover:code"
  | "recover:vvault";

export type ZenProductScope =
  | "general"
  | "browser-page"
  | "repo-maintenance"
  | "continuity-and-transcript-integrity";

export type ZenProductPermissions = "none" | "read-only-default" | "approval-gated";
export type ZenProductCommandKind = "default" | "dev" | "safe" | "recover";

export type ZenProductRegistryEntry = {
  productId: ZenProductSurface;
  displayName: string;
  repoName: string;
  surface: ZenProductSurface;
  role:
    | "canonical-chat"
    | "browser-shell"
    | "system-maintenance-product-body"
    | "continuity-vault";
  defaultMode: ZenProductMode;
  defaultScope: ZenProductScope;
  defaultPermissions: ZenProductPermissions;
  devOnlyByDefault: boolean;
  mutationRequiresApproval: true;
  entrypoints: string[];
  docs: string[];
  healthChecks: string[];
  recoveryActions: string[];
  boundary: string;
};

export type ZenProductModeProfile = {
  surface: ZenProductSurface;
  mode: ZenProductMode;
  scope: ZenProductScope;
  permissions: ZenProductPermissions;
  mutationRequiresApproval: true;
};

export const ZEN_PRODUCT_REGISTRY: Record<ZenProductSurface, ZenProductRegistryEntry> = {
  chatty: {
    productId: "chatty",
    displayName: "Chatty",
    repoName: "chatty",
    surface: "chatty",
    role: "canonical-chat",
    defaultMode: "conversation",
    defaultScope: "general",
    defaultPermissions: "none",
    devOnlyByDefault: false,
    mutationRequiresApproval: true,
    entrypoints: [
      "src/components/Layout.tsx",
      "server/lib/zenLiveTranscript.js",
      "src/lib/zenModeRouter.ts",
    ],
    docs: [
      "docs/standards/zen-mode-surfaces.md",
      "docs/standards/zen-singleton-live-transcript.md",
      "docs/standards/identity-boundaries.md",
    ],
    healthChecks: [
      "npm test -- --runInBand src/lib/__tests__/zenModeRouter.test.ts",
      "node --test server/tests/zen-live-transcript.test.js",
    ],
    recoveryActions: [
      "Preserve transcript evidence before repair.",
      "Escalate mutation through explicit Devon approval.",
    ],
    boundary:
      "Chatty owns Zen's canonical conversation lane; conversation mode cannot mutate repos, vaults, secrets, or recovery policy.",
  },
  quantum: {
    productId: "quantum",
    displayName: "Quantum",
    repoName: "quantum",
    surface: "quantum",
    role: "browser-shell",
    defaultMode: "browser-companion",
    defaultScope: "browser-page",
    defaultPermissions: "read-only-default",
    devOnlyByDefault: false,
    mutationRequiresApproval: true,
    entrypoints: [
      "apps/electron-shell/src/renderer/index.html",
      "apps/electron-shell/src/renderer/main.tsx",
      "apps/electron-shell/src/main/main.ts",
      "apps/electron-shell/src/renderer/styles/shell.css",
      "apps/electron-shell/vite.config.ts",
    ],
    docs: ["docs/ZEN_SINGLETON_LIVE_TRANSCRIPT.md", "docs/quantum-security-v0.md"],
    healthChecks: [
      "npm run typecheck -w apps/electron-shell",
      "npx vitest run src/renderer/preloadContract.test.ts -w apps/electron-shell",
    ],
    recoveryActions: [
      "Treat Ask Zen as a browser companion unless /dev or /dev /quantum is present.",
      "Keep root static Snake files out of the runtime path.",
    ],
    boundary:
      "Quantum may publish browser-context turns into Zen's singleton lane, but Chatty normalizes identity and mode before broadcast.",
  },
  code: {
    productId: "code",
    displayName: "Code",
    repoName: "code",
    surface: "code",
    role: "system-maintenance-product-body",
    defaultMode: "dev:code",
    defaultScope: "repo-maintenance",
    defaultPermissions: "read-only-default",
    devOnlyByDefault: true,
    mutationRequiresApproval: true,
    entrypoints: [
      "scripts/open-code-standalone.sh",
      "scripts/code_startup_recovery.mjs",
      "scripts/code_startup_seed_check.mjs",
    ],
    docs: ["docs/CODE_POCKETVERSE_DEFENSE.md", "docs/CODE_STARTUP_CONTRACT.md"],
    healthChecks: [
      "/bin/zsh scripts/open-code-standalone.sh --morning-check",
      "/bin/zsh scripts/open-code-standalone.sh --startup-status",
    ],
    recoveryActions: [
      "/bin/zsh scripts/open-code-standalone.sh --recover-owned",
      "Cloud-sealed seed recovery requires hardware/passkey approval before authority is restored.",
    ],
    boundary:
      "Code is a dev-only product body for maintenance and rematerialization; unknown listeners and unknown continuity are never trusted as authority.",
  },
  vvault: {
    productId: "vvault",
    displayName: "VVAULT",
    repoName: "vvault",
    surface: "vvault",
    role: "continuity-vault",
    defaultMode: "dev:vvault",
    defaultScope: "continuity-and-transcript-integrity",
    defaultPermissions: "read-only-default",
    devOnlyByDefault: true,
    mutationRequiresApproval: true,
    entrypoints: ["bin/vvault", "vvault/server/vvault_web_server.py", "docs/VVAULT_STARTUP_CONTRACT.md"],
    docs: ["docs/ZEN_DEV_PANEL_CANON.md", "docs/role-in-ecosystem.md", "docs/VVAULT_STARTUP_CONTRACT.md"],
    healthChecks: ["./bin/vvault", "npm run dev:full"],
    recoveryActions: [
      "Preserve transcript and vault lineage evidence before repair.",
      "Treat construct-folder mutation as approval-gated.",
    ],
    boundary:
      "VVAULT is the continuity vault; it may inspect transcript integrity by default but must not rewrite lineage without approval.",
  },
};

const PRODUCT_ALIASES: Record<string, ZenProductSurface> = {
  chatty: "chatty",
  "/chatty": "chatty",
  quantum: "quantum",
  "/quantum": "quantum",
  code: "code",
  "/code": "code",
  vvault: "vvault",
  "/vvault": "vvault",
  vault: "vvault",
  "/vault": "vvault",
};

function normalizeAlias(value: string | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isZenProductAlias(value: string | undefined): boolean {
  return Boolean(PRODUCT_ALIASES[normalizeAlias(value)]);
}

export function resolveZenProductSurface(
  value: string | ZenProductSurface | undefined,
  fallback: ZenProductSurface = "chatty",
): ZenProductSurface {
  return PRODUCT_ALIASES[normalizeAlias(value)] || fallback;
}

export function getZenProductRegistryEntry(
  value: string | ZenProductSurface | undefined,
  fallback: ZenProductSurface = "chatty",
): ZenProductRegistryEntry {
  return ZEN_PRODUCT_REGISTRY[resolveZenProductSurface(value, fallback)];
}

export function listZenProductRegistry(): ZenProductRegistryEntry[] {
  return Object.values(ZEN_PRODUCT_REGISTRY);
}

export function buildZenProductModeProfile(
  surface: ZenProductSurface,
  commandKind: ZenProductCommandKind = "default",
): ZenProductModeProfile {
  const entry = ZEN_PRODUCT_REGISTRY[surface];

  if (commandKind === "dev") {
    return {
      surface,
      mode: `dev:${surface}` as ZenProductMode,
      scope: entry.defaultScope,
      permissions: "read-only-default",
      mutationRequiresApproval: true,
    };
  }

  if (commandKind === "safe") {
    return {
      surface,
      mode: `safe:${surface}` as ZenProductMode,
      scope: entry.defaultScope,
      permissions: "read-only-default",
      mutationRequiresApproval: true,
    };
  }

  if (commandKind === "recover") {
    return {
      surface,
      mode: `recover:${surface}` as ZenProductMode,
      scope: entry.defaultScope,
      permissions: "approval-gated",
      mutationRequiresApproval: true,
    };
  }

  return {
    surface,
    mode: entry.defaultMode,
    scope: entry.defaultScope,
    permissions: entry.defaultPermissions,
    mutationRequiresApproval: true,
  };
}
