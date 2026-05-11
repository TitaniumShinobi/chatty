import type { ReceiptStatus } from "./commands";

export const CODEX_PICKUP_AWAITING_ASSISTANT_TAIL =
  "CODEX_PICKUP_AWAITING_ASSISTANT_TAIL";

export type PickupFlowStage =
  | "auth-session"
  | "sync-readback"
  | "resume-anchor"
  | "continue-payload"
  | "thread-reload-before-continue"
  | "continuation-post"
  | "thread-reload-after-continue";

export type StartupGateStage =
  | "backend-ready"
  | "session-check"
  | "vvault-session"
  | "conversation-hydration"
  | "ready";

type PickupFailureInput = {
  stage: PickupFlowStage;
  detail?: string | null;
  code?: string | null;
};

type PickupFailureDisplay = {
  status: ReceiptStatus;
  receiptText: string;
  continuityText: string;
};

function withDetail(prefix: string, detail?: string | null) {
  const normalized = typeof detail === "string" ? detail.trim() : "";
  if (!normalized) return prefix;
  if (normalized === prefix || normalized.startsWith(prefix)) return normalized;
  return `${prefix} ${normalized}`;
}

export function getPickupPendingReceiptText() {
  return "Syncing latest Codex handoff from VVAULT…";
}

export function getPickupSuccessReceiptText(threadId: string) {
  return `Picked up the latest Codex handoff in ${threadId}.`;
}

export function describePickupFailure({
  stage,
  detail,
  code,
}: PickupFailureInput): PickupFailureDisplay {
  if (
    stage === "sync-readback" &&
    code === CODEX_PICKUP_AWAITING_ASSISTANT_TAIL
  ) {
    const text =
      "Pickup is waiting for a completed Codex assistant tail. VVAULT sync succeeded, but the synced transcript has no completed assistant answer yet.";
    return {
      status: "blocked",
      receiptText: text,
      continuityText: text,
    };
  }

  switch (stage) {
    case "auth-session": {
      const text = withDetail(
        "Pickup is blocked: Chatty is up, but this browser does not have an active signed-in session. Please log in again.",
        detail,
      );
      return {
        status: "error",
        receiptText: text,
        continuityText: text,
      };
    }
    case "sync-readback": {
      const text = withDetail(
        "Pickup failed during Codex transcript sync/readback through VVAULT.",
        detail,
      );
      return {
        status: "error",
        receiptText: text,
        continuityText: text,
      };
    }
    case "resume-anchor": {
      const text = withDetail(
        "Pickup synced the latest Codex transcript, but did not receive a usable resume anchor.",
        detail,
      );
      return {
        status: "error",
        receiptText: text,
        continuityText: text,
      };
    }
    case "continue-payload": {
      const text = withDetail(
        "Pickup synced the latest Codex transcript, but did not receive a continuation payload.",
        detail,
      );
      return {
        status: "error",
        receiptText: text,
        continuityText: text,
      };
    }
    case "thread-reload-before-continue": {
      const text = withDetail(
        "Pickup minted a resume anchor, but Chatty could not reload the canonical Zen thread before continuation.",
        detail,
      );
      return {
        status: "error",
        receiptText: text,
        continuityText: text,
      };
    }
    case "continuation-post": {
      const text = withDetail(
        "Pickup synced the transcript and minted a resume anchor, but continuation through /api/vvault/message failed.",
        detail,
      );
      return {
        status: "error",
        receiptText: text,
        continuityText: text,
      };
    }
    case "thread-reload-after-continue":
    default: {
      const text = withDetail(
        "Pickup continued, but Chatty could not reload the canonical Zen thread from VVAULT afterward.",
        detail,
      );
      return {
        status: "error",
        receiptText: text,
        continuityText: text,
      };
    }
  }
}

export function getStartupGateMessage(stage: StartupGateStage) {
  switch (stage) {
    case "backend-ready":
      return "Waiting for Chatty backend readiness…";
    case "session-check":
      return "Checking your Chatty sign-in session…";
    case "vvault-session":
      return "Verifying your shared VVAULT session…";
    case "conversation-hydration":
      return "Loading canonical conversations from VVAULT…";
    case "ready":
    default:
      return "Chatty is ready.";
  }
}
