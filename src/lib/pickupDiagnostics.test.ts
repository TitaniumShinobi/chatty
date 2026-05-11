import {
  CODEX_PICKUP_AWAITING_ASSISTANT_TAIL,
  describePickupFailure,
  getPickupPendingReceiptText,
  getPickupSuccessReceiptText,
  getStartupGateMessage,
} from "./pickupDiagnostics";

describe("pickupDiagnostics", () => {
  it("describes the pending-tail pickup block as blocked instead of broken", () => {
    expect(
      describePickupFailure({
        stage: "sync-readback",
        code: CODEX_PICKUP_AWAITING_ASSISTANT_TAIL,
      }),
    ).toEqual({
      status: "blocked",
      receiptText:
        "Pickup is waiting for a completed Codex assistant tail. VVAULT sync succeeded, but the synced transcript has no completed assistant answer yet.",
      continuityText:
        "Pickup is waiting for a completed Codex assistant tail. VVAULT sync succeeded, but the synced transcript has no completed assistant answer yet.",
    });
  });

  it("labels the no-session pickup failure as a signed-in session problem", () => {
    expect(
      describePickupFailure({
        stage: "auth-session",
      }),
    ).toEqual({
      status: "error",
      receiptText:
        "Pickup is blocked: Chatty is up, but this browser does not have an active signed-in session. Please log in again.",
      continuityText:
        "Pickup is blocked: Chatty is up, but this browser does not have an active signed-in session. Please log in again.",
    });
  });

  it("labels continuation-post failures with the continuation stage", () => {
    expect(
      describePickupFailure({
        stage: "continuation-post",
        detail: "Codex pickup continuation failed with HTTP 503",
      }),
    ).toEqual({
      status: "error",
      receiptText:
        "Pickup synced the transcript and minted a resume anchor, but continuation through /api/vvault/message failed. Codex pickup continuation failed with HTTP 503",
      continuityText:
        "Pickup synced the transcript and minted a resume anchor, but continuation through /api/vvault/message failed. Codex pickup continuation failed with HTTP 503",
    });
  });

  it("surfaces startup gate messages for backend, session, and hydration", () => {
    expect(getStartupGateMessage("backend-ready")).toBe(
      "Waiting for Chatty backend readiness…",
    );
    expect(getStartupGateMessage("session-check")).toBe(
      "Checking your Chatty sign-in session…",
    );
    expect(getStartupGateMessage("conversation-hydration")).toBe(
      "Loading canonical conversations from VVAULT…",
    );
  });

  it("keeps pickup receipt copy explicit about VVAULT sync and canonical thread success", () => {
    expect(getPickupPendingReceiptText()).toBe(
      "Syncing latest Codex handoff from VVAULT…",
    );
    expect(getPickupSuccessReceiptText("zen-001_chat_with_zen-001")).toBe(
      "Picked up the latest Codex handoff in zen-001_chat_with_zen-001.",
    );
  });
});
