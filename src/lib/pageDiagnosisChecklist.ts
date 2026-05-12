import type { OrchestrationChecklist } from "../components/OrchestrationInspector";

type ThreadLike = {
  id?: string | null;
  constructId?: string | null;
  runtimeId?: string | null;
  canonicalForRuntime?: string | null;
  isIndexHydrated?: boolean | null;
  messages?: unknown[] | null;
  providerName?: string | null;
  modelId?: string | null;
  isFallback?: boolean | null;
  hydrationSource?: string | null;
  hydrationStatus?: string | null;
  identityCoherent?: boolean | null;
};

type ChecklistStage = NonNullable<OrchestrationChecklist["stages"]>[number];

type PageChecklistSpec = {
  title: string;
  constructId: string;
  stages: ChecklistStage[];
};

function countStatuses(stages: ChecklistStage[]) {
  return stages.reduce<Record<string, number>>((summary, stage) => {
    const status = stage.status || "skipped";
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {});
}

function overallStatus(stages: ChecklistStage[]) {
  if (stages.some((stage) => stage.status === "fail")) return "fail";
  if (stages.some((stage) => stage.status === "warn")) return "warn";
  if (stages.some((stage) => stage.status === "skipped")) return "partial";
  return "pass";
}

function stage(
  id: string,
  label: string,
  status: ChecklistStage["status"],
  why: string,
  owner: string,
  details?: ChecklistStage["details"],
): ChecklistStage {
  return { id, label, status, why, owner, details };
}

function definitionStage(id: string, label: string, why: string, owner: string) {
  return stage(id, label, "skipped", why, owner, {
    checklistMode: "definition",
    liveProbe: "pending",
  });
}

function findRuntimeStage(checklist: OrchestrationChecklist | null | undefined, pattern: RegExp) {
  return (checklist?.stages || []).find((item) => pattern.test(`${item.id} ${item.label}`));
}

function chatChecklist(
  pathname: string,
  activeThread?: ThreadLike | null,
  runtimeChecklist?: OrchestrationChecklist | null,
): PageChecklistSpec {
  const routeThreadId = decodeURIComponent(pathname.replace(/^\/app\/chat\//, ""));
  const constructId =
    activeThread?.constructId ||
    activeThread?.runtimeId ||
    activeThread?.canonicalForRuntime ||
    null;
  const persistenceStage = findRuntimeStage(runtimeChecklist, /persist/i);
  const hasRuntimeReceipt = Boolean(runtimeChecklist?.stages?.length);
  const hasMessages = Array.isArray(activeThread?.messages) && activeThread.messages.length > 0;

  const providerName = activeThread?.providerName || null;
  const modelId = activeThread?.modelId || null;
  const isFallback = activeThread?.isFallback === true;
  const hydrationSource = activeThread?.hydrationSource || null;
  const hydrationStatus = activeThread?.hydrationStatus || null;
  const identityCoherent = activeThread?.identityCoherent;

  return {
    title: "Chat page checklist",
    constructId: constructId || routeThreadId || "chat",
    stages: [
      stage(
        "chat-selected-ai",
        "Selected AI",
        constructId || routeThreadId ? "pass" : "warn",
        constructId
          ? `Selected construct resolves as ${constructId}.`
          : routeThreadId
            ? "Route carries a chat thread id; construct identity must resolve before the page is called fully alive."
            : "No selected construct or thread id is visible for this Chat route.",
        "src/components/Layout.tsx activeThread + src/pages/Chat.tsx route params",
        { routeThreadId, constructId },
      ),
      stage(
        "chat-canonical-route",
        "Canonical Route",
        pathname.startsWith("/app/chat/") ? "pass" : "warn",
        pathname.startsWith("/app/chat/")
          ? "Route follows the canonical /app/chat/:threadId pattern."
          : "Current route is noncanonical; construct-quality sends may not apply.",
        "src/lib/aiService.ts -> server/routes/vvault.js",
        { canonical: pathname.startsWith("/app/chat/") },
      ),
      stage(
        "chat-provider-model",
        "Provider/Model",
        providerName && modelId ? "pass" : providerName ? "warn" : "skipped",
        providerName && modelId
          ? `Runtime uses ${providerName} / ${modelId}.`
          : providerName
            ? `Provider set to ${providerName} but model is unknown.`
            : "No provider or model has been recorded for this runtime.",
        "src/lib/modelProviders.ts",
        { providerName, modelId },
      ),
      stage(
        "chat-fallback",
        "Fallback",
        isFallback ? "warn" : "pass",
        isFallback
          ? "Runtime is operating in browser fallback mode. Provider calls use stubs."
          : "Runtime is operating with a live provider connection.",
        "src/lib/automaticRuntimeOrchestrator.ts",
        { isFallback },
      ),
      stage(
        "chat-hydration",
        "Hydration",
        hydrationStatus === "ready" || hydrationStatus === "full" ? "pass"
          : hydrationStatus === "error" || hydrationStatus === "missing" ? "fail"
          : hydrationStatus === "partial" || hydrationSource?.includes("fallback") ? "warn"
          : "skipped",
        hydrationStatus === "ready" || hydrationStatus === "full"
          ? `Conversation hydrated from ${hydrationSource || "full"} source.`
          : hydrationStatus === "partial" || hydrationSource?.includes("fallback")
            ? `Conversation using ${hydrationSource || "fallback"} hydration — not fully canonical.`
            : hydrationStatus === "error" || hydrationStatus === "missing"
              ? `Hydration ${hydrationStatus}: conversation data may be incomplete or unavailable.`
              : "Hydration status has not been recorded for this thread.",
        "src/lib/vvaultConversationHydration.ts",
        { hydrationSource, hydrationStatus },
      ),
      stage(
        "chat-identity-coherence",
        "Identity Coherence",
        identityCoherent === true ? "pass"
          : identityCoherent === false ? "fail"
          : "skipped",
        identityCoherent === true
          ? "Construct identity alignment held through the turn."
          : identityCoherent === false
            ? "Identity coherence check failed — construct may have drifted."
            : "Identity coherence has not been verified for this thread.",
        "server/lib/identityCoherenceGuard.js",
        { identityCoherent },
      ),
      stage(
        "chat-runtime-receipt",
        "Runtime Receipt",
        hasRuntimeReceipt ? "pass" : "skipped",
        hasRuntimeReceipt
          ? "Latest Chat turn produced an orchestration/runtime checklist receipt."
          : "No latest Chat runtime receipt is available yet for this page load.",
        "server/lib/orchestrationChecklist.js + src/components/OrchestrationInspector.tsx",
      ),
      stage(
        "chat-persistence",
        "Persistence",
        persistenceStage?.status || "skipped",
        persistenceStage?.why ||
          "Persistence proof comes from the Chat runtime receipt after a real assistant turn.",
        persistenceStage?.owner || "server/routes/vvault.js persistence receipt",
      ),
      stage(
        "chat-reload",
        "Reload",
        hasMessages && activeThread?.isIndexHydrated !== true ? "pass" : "skipped",
        hasMessages && activeThread?.isIndexHydrated !== true
          ? "Active thread has renderable messages from the current hydration state."
          : "Reload proof requires reopening the saved thread with full messages.",
        "src/lib/vvaultConversationHydration.ts + src/components/Layout.tsx",
        { messageCount: activeThread?.messages?.length || 0, isIndexHydrated: activeThread?.isIndexHydrated },
      ),
    ],
  };
}

function simpleChecklist(pathname: string): PageChecklistSpec {
  if (/^\/app\/(?:ais|gpts)\/(?:new|edit)/.test(pathname)) {
    return {
      title: "GPT Creator checklist",
      constructId: "gpt-creator",
      stages: [
        definitionStage("creator-preview", "Preview Works", "Preview must use the canonical preview route and surface receipt truth.", "src/components/GPTCreator.tsx + /api/vvault/message"),
        definitionStage("creator-save", "Save Works", "Saving must persist identity fields and return a truthful receipt.", "src/components/GPTCreator.tsx + server/routes/ais.js"),
        definitionStage("creator-chat-handoff", "Created AI Can Chat", "A saved AI is not working until it can be opened in Chat and answer through the canonical route.", "src/components/Layout.tsx startConversationWithConstruct"),
      ],
    };
  }

  if (/^\/app\/(?:ais|gpts)/.test(pathname)) {
    return {
      title: "AIs/GPTs page checklist",
      constructId: "ais-gpts",
      stages: [
        definitionStage("ais-list-loads", "List Loads", "The registry must load visible AIs/GPTs or show an honest degraded state.", "src/pages/GPTsPage.tsx + GET /api/ais"),
        definitionStage("ais-edit-opens", "Edit Opens", "Selecting edit must open the intended AI, not a stale or fallback construct.", "src/pages/GPTsPage.tsx + src/components/GPTCreator.tsx"),
        definitionStage("ais-identity-saves", "Identity Saves", "Name, instructions, avatar, voice, model mode, and memory policy must save with a receipt; canonical /api/ais/:construct/avatar must not be blocked by stale local rows, and avatar.webp is valid.", "server/routes/ais.js + docs/standards/VVAULT_SHARED_AUTH_AND_AVATAR_CONTRACT.md"),
        definitionStage("ais-reopen-verifies", "Reopen Verifies", "After save, reopening the AI must show the persisted identity, not only optimistic UI state.", "src/components/GPTCreator.tsx"),
      ],
    };
  }

  if (pathname.startsWith("/app/explore")) {
    return {
      title: "SimForge/Explore checklist",
      constructId: "simforge-explore",
      stages: [
        definitionStage("simforge-inputs", "Inputs", "Build inputs must name the target construct and source material.", "src/pages/SimForge.tsx"),
        definitionStage("simforge-readiness", "Readiness", "Readiness must explain whether there is enough source material to build.", "src/pages/SimForge.tsx + server/routes/simForge.js"),
        definitionStage("simforge-build", "Build", "Build jobs must expose status and failure reason.", "server/routes/simForge.js"),
        definitionStage("simforge-lock", "Lock", "Artifact lock state must be visible before a sim is treated as active.", "src/components/GPTCreator.tsx + server/lib/constructSimBuildService.js"),
        definitionStage("simforge-chat-handoff", "Chat Handoff", "A built sim is not working until it can hand off to Chat through the construct route.", "src/components/Layout.tsx"),
      ],
    };
  }

  if (pathname.startsWith("/app/vvault")) {
    return {
      title: "VVAULT page checklist",
      constructId: "vvault",
      stages: [
        definitionStage("vvault-bridge", "Bridge", "The VVAULT bridge must report reachable, degraded, or blocked explicitly.", "src/pages/VVAULTPage.tsx + server/lib/vvaultBridgeConfig.js"),
        definitionStage("vvault-auth", "Auth", "Shared auth identity must be present before canonical VVAULT reads/writes are trusted.", "server/lib/vvaultSharedAuthIdentity.js"),
        definitionStage("vvault-files", "Files", "File lists and previews must name their source and failure mode.", "src/components/VaultFileManager.tsx"),
        definitionStage("vvault-read-write-state", "Read/Write State", "The page must say whether it is read/write, read-only, degraded, or blocked.", "server/routes/vvault.js"),
      ],
    };
  }

  const surface = pathname.startsWith("/app/search")
    ? "Search"
    : pathname.startsWith("/app/library")
      ? "Library"
      : pathname.startsWith("/app/projects")
        ? "Projects"
        : pathname.startsWith("/app/apps")
          ? "Apps"
          : pathname.startsWith("/app/finance")
            ? "Finance"
            : pathname.startsWith("/app/codex")
              ? "Codex"
              : "App Home";

  return {
    title: `${surface} checklist`,
    constructId: surface.toLowerCase().replace(/\s+/g, "-"),
    stages: [
      stage("surface-route", "Route", "pass", `${surface} route is mounted in the signed-in app shell.`, "src/main.tsx + src/components/Layout.tsx"),
      definitionStage("surface-data", "Data", `${surface} must define the route or API data needed before it can be called working.`, "surface owner page"),
      definitionStage("surface-render", "Render", `${surface} must render its primary empty, loading, success, and degraded states without borrowing Chat proof.`, "surface owner page"),
    ],
  };
}

export function getPageDiagnosisChecklist({
  pathname,
  activeThread,
  runtimeChecklist,
}: {
  pathname: string;
  activeThread?: ThreadLike | null;
  runtimeChecklist?: OrchestrationChecklist | null;
}): OrchestrationChecklist {
  const normalizedPath = pathname || "/app";
  const spec = normalizedPath.startsWith("/app/chat/")
    ? chatChecklist(normalizedPath, activeThread, runtimeChecklist)
    : simpleChecklist(normalizedPath);

  return {
    title: spec.title,
    constructId: spec.constructId,
    overallStatus: overallStatus(spec.stages),
    summary: countStatuses(spec.stages),
    stages: spec.stages,
  };
}
