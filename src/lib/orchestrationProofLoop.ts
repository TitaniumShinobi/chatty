export type OrchestrationProofStatus = "pending" | "ok" | "error";

export type OrchestrationProofPhase =
  | "request_sent"
  | "orchestration_returned"
  | "persistence_saved"
  | "persistence_failed"
  | "reload_proven"
  | "reload_failed";

export type OrchestrationProofSystemMessage = {
  id: string;
  role: "system";
  text: string;
  status: OrchestrationProofStatus;
  ts: number;
  timestamp: string;
  metadata?: {
    orchestrationProofStatus?: true;
    phase?: OrchestrationProofPhase;
    threadId?: string;
  };
};

export type OrchestrationProofMetadata = {
  route: "/api/vvault/message";
  routePersistenceMode: "layout_owned_skipPersistence";
  persistenceOwner: "layout_vvault_conversation_manager";
  canonicalReadbackRequired: true;
  canonicalHydrationSource: "full";
  requestSentAt: string;
  orchestrationReturnedAt: string;
};

export type OrchestrationReloadProofExpectation = {
  assistantContent: string;
  assistantTimestamp: string;
};

export type OrchestrationReloadProofInput = {
  hydrationSource?: string | null;
  hydrationComplete?: boolean;
  transcriptMessages?: Array<{
    role?: string | null;
    content?: string | null;
    text?: string | null;
    timestamp?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null | undefined> | null;
  expectation: OrchestrationReloadProofExpectation;
};

export type OrchestrationReloadProofResult = {
  ok: boolean;
  status: OrchestrationProofStatus;
  phase: Extract<OrchestrationProofPhase, "reload_proven" | "reload_failed">;
  message: string;
  matchedTurn?: {
    role?: string | null;
    content?: string | null;
    text?: string | null;
    timestamp?: string | null;
    metadata?: Record<string, unknown> | null;
  };
};

const PROOF_MESSAGE_PREFIX = "__orchestration-proof__:";

function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function turnContent(turn: {
  content?: string | null;
  text?: string | null;
}): string {
  return normalizeContent(turn.content ?? turn.text ?? "");
}

export function getOrchestrationProofMessageId(threadId: string): string {
  return `${PROOF_MESSAGE_PREFIX}${threadId}`;
}

export function isOrchestrationProofSystemMessage(message: {
  id?: string | null;
  role?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!message || message.role !== "system") return false;
  if (typeof message.id === "string" && message.id.startsWith(PROOF_MESSAGE_PREFIX)) {
    return true;
  }
  return message.metadata?.orchestrationProofStatus === true;
}

export function buildOrchestrationProofMetadata({
  requestSentAt,
  orchestrationReturnedAt,
}: {
  requestSentAt: string;
  orchestrationReturnedAt: string;
}): OrchestrationProofMetadata {
  return {
    route: "/api/vvault/message",
    routePersistenceMode: "layout_owned_skipPersistence",
    persistenceOwner: "layout_vvault_conversation_manager",
    canonicalReadbackRequired: true,
    canonicalHydrationSource: "full",
    requestSentAt,
    orchestrationReturnedAt,
  };
}

export function buildOrchestrationProofSystemMessage({
  threadId,
  phase,
  timestamp = Date.now(),
  detail,
}: {
  threadId: string;
  phase: OrchestrationProofPhase;
  timestamp?: number;
  detail?: string | null;
}): OrchestrationProofSystemMessage {
  let text = "Orchestration proof running…";
  let status: OrchestrationProofStatus = "pending";

  switch (phase) {
    case "request_sent":
      text = "Orchestration proof: request sent to /api/vvault/message…";
      status = "pending";
      break;
    case "orchestration_returned":
      text = "Orchestration proof: construct turn returned. Saving transcript…";
      status = "pending";
      break;
    case "persistence_saved":
      text = "Orchestration proof: transcript saved. Proving canonical reload…";
      status = "pending";
      break;
    case "persistence_failed":
      text = detail
        ? `Orchestration proof failed before the assistant turn could be proven on the canonical transcript. ${detail}`
        : "Orchestration proof failed before the assistant turn could be proven on the canonical transcript.";
      status = "error";
      break;
    case "reload_proven":
      text = "Orchestration proof passed: canonical full-hydration reload verified this turn.";
      status = "ok";
      break;
    case "reload_failed":
      text = detail
        ? `Orchestration proof failed: ${detail}`
        : "Orchestration proof failed: canonical reload did not verify this turn.";
      status = "error";
      break;
  }

  return {
    id: getOrchestrationProofMessageId(threadId),
    role: "system",
    text,
    status,
    ts: timestamp,
    timestamp: new Date(timestamp).toISOString(),
    metadata: {
      orchestrationProofStatus: true,
      phase,
      threadId,
    },
  };
}

export function verifyCanonicalReloadProof({
  hydrationSource,
  hydrationComplete,
  transcriptMessages,
  expectation,
}: OrchestrationReloadProofInput): OrchestrationReloadProofResult {
  if (hydrationSource !== "full" || hydrationComplete !== true) {
    return {
      ok: false,
      status: "error",
      phase: "reload_failed",
      message: `canonical reload stayed degraded (${hydrationSource || "unknown"})`,
    };
  }

  const turns = Array.isArray(transcriptMessages) ? transcriptMessages.filter(Boolean) : [];
  const expectedContent = normalizeContent(expectation.assistantContent);
  const expectedTimestamp = normalizeContent(expectation.assistantTimestamp);

  const matchedTurn = turns.find((turn) => {
    if (!turn || turn.role !== "assistant") return false;
    return (
      normalizeContent(turn.timestamp) === expectedTimestamp &&
      turnContent(turn) === expectedContent
    );
  });

  if (!matchedTurn) {
    return {
      ok: false,
      status: "error",
      phase: "reload_failed",
      message: "saved assistant turn did not come back on canonical reload",
    };
  }

  const metadata =
    matchedTurn.metadata && typeof matchedTurn.metadata === "object"
      ? matchedTurn.metadata
      : null;

  if (!metadata?.runtime_receipt) {
    return {
      ok: false,
      status: "error",
      phase: "reload_failed",
      message: "saved assistant turn reloaded without runtime_receipt metadata",
      matchedTurn,
    };
  }

  if (!metadata?.orchestration_checklist) {
    return {
      ok: false,
      status: "error",
      phase: "reload_failed",
      message: "saved assistant turn reloaded without orchestration_checklist metadata",
      matchedTurn,
    };
  }

  return {
    ok: true,
    status: "ok",
    phase: "reload_proven",
    message: "canonical full-hydration reload verified this turn",
    matchedTurn,
  };
}
