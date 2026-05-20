import {
  buildOrchestrationProofSystemMessage,
  verifyCanonicalReloadProof,
} from "./orchestrationProofLoop";

describe("orchestrationProofLoop", () => {
  it("builds pending and success proof system messages", () => {
    const pending = buildOrchestrationProofSystemMessage({
      threadId: "zen-001_chat_with_zen-001",
      phase: "request_sent",
      timestamp: 1000,
    });
    const success = buildOrchestrationProofSystemMessage({
      threadId: "zen-001_chat_with_zen-001",
      phase: "reload_proven",
      timestamp: 2000,
    });

    expect(pending.role).toBe("system");
    expect(pending.status).toBe("pending");
    expect(pending.text).toMatch(/request sent to \/api\/vvault\/message/i);
    expect(success.status).toBe("ok");
    expect(success.text).toMatch(
      /canonical full-hydration reload verified this turn/i,
    );
  });

  it("fails closed when reload stays degraded", () => {
    const result = verifyCanonicalReloadProof({
      hydrationSource: "local-fallback",
      hydrationComplete: false,
      transcriptMessages: [],
      expectation: {
        assistantContent: "Zen reply",
        assistantTimestamp: "2026-05-08T12:00:00.000Z",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.phase).toBe("reload_failed");
    expect(result.message).toMatch(/degraded/i);
  });

  it("fails when the reloaded assistant turn is missing receipt metadata", () => {
    const result = verifyCanonicalReloadProof({
      hydrationSource: "full",
      hydrationComplete: true,
      transcriptMessages: [
        {
          role: "assistant",
          content: "Zen reply",
          timestamp: "2026-05-08T12:00:00.000Z",
          metadata: {
            orchestration_checklist: { overallStatus: "pass" },
          },
        },
      ],
      expectation: {
        assistantContent: "Zen reply",
        assistantTimestamp: "2026-05-08T12:00:00.000Z",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/runtime_receipt/i);
  });

  it("passes only when the same assistant turn comes back with receipt and checklist metadata", () => {
    const result = verifyCanonicalReloadProof({
      hydrationSource: "full",
      hydrationComplete: true,
      transcriptMessages: [
        {
          role: "assistant",
          content: "Zen reply",
          timestamp: "2026-05-08T12:00:00.000Z",
          metadata: {
            runtime_receipt: { persistence: { owner: "vvault_body" } },
            orchestration_checklist: { overallStatus: "pass" },
          },
        },
      ],
      expectation: {
        assistantContent: "Zen reply",
        assistantTimestamp: "2026-05-08T12:00:00.000Z",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.phase).toBe("reload_proven");
  });
});
