export const ZEN_FRONTEND_TRUTH_THREAD_ID = "zen-001_chat_with_zen-001";

export type ZenTruthFingerprint = {
  index: number;
  role: string | null;
  timestamp: string | null;
  sha256: string;
};

export type ZenFrontendUiMessage = {
  role?: string | null;
  timestamp?: string | number | null;
  ts?: string | number | null;
  content?: unknown;
  text?: unknown;
  packets?: Array<{ op?: string; payload?: { content?: unknown } }>;
};

export type ZenBackendTruthPacket = {
  STATUS?: string;
  THREAD_ID?: string;
  BACKEND_READ_TAIL?: {
    messageCount?: number;
    latestTimestamp?: string | null;
    latestRole?: string | null;
    latestSha256?: string | null;
    tail?: ZenTruthFingerprint[];
  } | null;
};

export type ZenFrontendTruthReport = {
  STATUS: string;
  THREAD_ID: string;
  BACKEND_EXPECTED_TAIL: ZenBackendTruthPacket["BACKEND_READ_TAIL"] | null;
  UI_VISIBLE_TAIL: {
    messageCount: number;
    latestTimestamp: string | null;
    latestRole: string | null;
    latestSha256: string | null;
    tail: ZenTruthFingerprint[];
  } | null;
  MESSAGE_COUNT_COMPARISON: {
    backend: number;
    ui: number;
    match: boolean;
  } | null;
  HYDRATION_STATE: unknown;
  AUTH_STATE: unknown;
  DIVERGENCE_POINT: null | {
    index: number;
    backend: ZenTruthFingerprint | null;
    ui: ZenTruthFingerprint | null;
  };
  ROOT_CAUSE: string;
  CORRECTIVE_ACTIONS: string[];
  FILES_CHANGED: string[];
  BROWSER_PROOF: unknown;
  VALIDATION_COMMANDS: string[];
  FINAL_VERDICT: string;
};

function normalizeTimestamp(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && /^\d+$/.test(value)) {
    return new Date(numeric).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function extractMessageContent(message: ZenFrontendUiMessage): string {
  if (typeof message.content === "string") return message.content;
  if (typeof message.text === "string") return message.text;
  const packetContent = (message.packets || [])
    .map((packet) =>
      packet?.payload && typeof packet.payload.content === "string"
        ? packet.payload.content
        : "",
    )
    .filter(Boolean)
    .join("\n");
  return packetContent;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintFrontendMessages(
  messages: ZenFrontendUiMessage[],
): Promise<ZenTruthFingerprint[]> {
  const source = Array.isArray(messages) ? messages : [];
  return Promise.all(
    source.map(async (message, index) => ({
      index,
      role: message.role || null,
      timestamp: normalizeTimestamp(message.timestamp ?? message.ts ?? null),
      sha256: await sha256Hex(extractMessageContent(message)),
    })),
  );
}

function summarizeFingerprints(fingerprints: ZenTruthFingerprint[], tailSize = 5) {
  return {
    messageCount: fingerprints.length,
    latestTimestamp: fingerprints.at(-1)?.timestamp || null,
    latestRole: fingerprints.at(-1)?.role || null,
    latestSha256: fingerprints.at(-1)?.sha256 || null,
    tail: fingerprints.slice(-tailSize),
  };
}

function findTailDivergence(
  expectedTail: ZenTruthFingerprint[],
  uiFingerprints: ZenTruthFingerprint[],
): ZenFrontendTruthReport["DIVERGENCE_POINT"] {
  for (const expected of expectedTail) {
    const actual = uiFingerprints[expected.index] || null;
    if (
      !actual ||
      actual.role !== expected.role ||
      actual.timestamp !== expected.timestamp ||
      actual.sha256 !== expected.sha256
    ) {
      return {
        index: expected.index,
        backend: expected,
        ui: actual,
      };
    }
  }
  return null;
}

export async function buildZenFrontendTruthReport({
  backendProof,
  uiMessages,
  hydrationState,
  authState,
  browserProof = null,
  filesChanged = [],
  validationCommands = [],
}: {
  backendProof: ZenBackendTruthPacket;
  uiMessages: ZenFrontendUiMessage[];
  hydrationState: unknown;
  authState: unknown;
  browserProof?: unknown;
  filesChanged?: string[];
  validationCommands?: string[];
}): Promise<ZenFrontendTruthReport> {
  if (backendProof?.STATUS === "BLOCKED_AUTHORITY_ENV") {
    return {
      STATUS: "BLOCKED_BACKEND_TRUTH",
      THREAD_ID: backendProof?.THREAD_ID || ZEN_FRONTEND_TRUTH_THREAD_ID,
      BACKEND_EXPECTED_TAIL: null,
      UI_VISIBLE_TAIL: null,
      MESSAGE_COUNT_COMPARISON: null,
      HYDRATION_STATE: hydrationState,
      AUTH_STATE: authState,
      DIVERGENCE_POINT: null,
      ROOT_CAUSE: "Backend VVAULT truth proof is blocked; frontend truth cannot be compared.",
      CORRECTIVE_ACTIONS: [],
      FILES_CHANGED: filesChanged,
      BROWSER_PROOF: browserProof,
      VALIDATION_COMMANDS: validationCommands,
      FINAL_VERDICT: "Blocked before UI comparison; no cache, local state, or stale render was treated as truth.",
    };
  }

  const expectedTail = backendProof?.BACKEND_READ_TAIL || null;
  const uiFingerprints = await fingerprintFrontendMessages(uiMessages);
  const uiVisibleTail = summarizeFingerprints(uiFingerprints);
  const backendCount = expectedTail?.messageCount ?? 0;
  const messageCountComparison = {
    backend: backendCount,
    ui: uiFingerprints.length,
    match: backendCount === uiFingerprints.length,
  };
  const tailDivergence = findTailDivergence(expectedTail?.tail || [], uiFingerprints);
  const divergencePoint =
    tailDivergence ||
    (!messageCountComparison.match
      ? {
          index: Math.min(backendCount, uiFingerprints.length),
          backend: null,
          ui: null,
        }
      : null);

  return {
    STATUS: divergencePoint ? "DIVERGED" : "TRUTH_RESTORED",
    THREAD_ID: backendProof?.THREAD_ID || ZEN_FRONTEND_TRUTH_THREAD_ID,
    BACKEND_EXPECTED_TAIL: expectedTail,
    UI_VISIBLE_TAIL: uiVisibleTail,
    MESSAGE_COUNT_COMPARISON: messageCountComparison,
    HYDRATION_STATE: hydrationState,
    AUTH_STATE: authState,
    DIVERGENCE_POINT: divergencePoint,
    ROOT_CAUSE: divergencePoint ? "ui_visible_tail_does_not_match_backend_truth_packet" : "none",
    CORRECTIVE_ACTIONS: divergencePoint
      ? ["Inspect frontend hydration, cache, route reconciliation, and dedup state."]
      : ["No canonical transcript mutation required."],
    FILES_CHANGED: filesChanged,
    BROWSER_PROOF: browserProof,
    VALIDATION_COMMANDS: validationCommands,
    FINAL_VERDICT: divergencePoint
      ? "Frontend UI truth is not restored."
      : "Signed-in UI tail matches backend/VVAULT truth packet.",
  };
}
