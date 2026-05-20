import { webcrypto } from "crypto";

import {
  buildZenFrontendTruthReport,
  fingerprintFrontendMessages,
} from "./zenFrontendTruthProof";

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});

describe("zenFrontendTruthProof", () => {
  it("blocks UI comparison when backend VVAULT truth is blocked", async () => {
    const report = await buildZenFrontendTruthReport({
      backendProof: {
        STATUS: "BLOCKED_AUTHORITY_ENV",
        THREAD_ID: "zen-001_chat_with_zen-001",
      },
      uiMessages: [{ role: "assistant", text: "cached stale tail" }],
      hydrationState: { status: "partial", hydrationSource: "snapshot-replay" },
      authState: { hasUser: true, vvaultSessionReady: true },
    });

    expect(report.STATUS).toBe("BLOCKED_BACKEND_TRUTH");
    expect(report.UI_VISIBLE_TAIL).toBeNull();
    expect(report.FINAL_VERDICT).toContain("no cache, local state, or stale render");
  });

  it("compares backend truth fingerprints against frontend UI fingerprints", async () => {
    const uiFingerprints = await fingerprintFrontendMessages([
      {
        role: "user",
        timestamp: "2026-05-05T12:00:00.000Z",
        text: "hello Zen",
      },
      {
        role: "assistant",
        timestamp: "2026-05-05T12:01:00.000Z",
        packets: [{ op: "answer.v1", payload: { content: "hello Devon" } }],
      },
    ]);
    const report = await buildZenFrontendTruthReport({
      backendProof: {
        STATUS: "TRUTH_RESTORED",
        THREAD_ID: "zen-001_chat_with_zen-001",
        BACKEND_READ_TAIL: {
          messageCount: 2,
          latestTimestamp: uiFingerprints[1].timestamp,
          latestRole: uiFingerprints[1].role,
          latestSha256: uiFingerprints[1].sha256,
          tail: uiFingerprints,
        },
      },
      uiMessages: [
        {
          role: "user",
          timestamp: "2026-05-05T12:00:00.000Z",
          text: "hello Zen",
        },
        {
          role: "assistant",
          timestamp: "2026-05-05T12:01:00.000Z",
          packets: [{ op: "answer.v1", payload: { content: "hello Devon" } }],
        },
      ],
      hydrationState: {
        status: "ready",
        hydrationSource: "full",
        hydrationComplete: true,
      },
      authState: { hasUser: true, vvaultSessionReady: true },
    });

    expect(report.STATUS).toBe("TRUTH_RESTORED");
    expect(report.MESSAGE_COUNT_COMPARISON).toEqual({
      backend: 2,
      ui: 2,
      match: true,
    });
    expect(report.DIVERGENCE_POINT).toBeNull();
  });
});
