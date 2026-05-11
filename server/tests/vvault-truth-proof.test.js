import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthorityEnvStatus,
  compareTruthTails,
  fingerprintMessages,
  runZenVvaultTruthProof,
} from "../lib/vvaultTruthProof.js";

describe("Zen VVAULT truth proof", () => {
  it("blocks before comparison when authority env is missing", () => {
    const status = buildAuthorityEnvStatus({});

    assert.equal(status.ok, false);
    assert.ok(status.missing.includes("VVAULT_API_BASE_URL"));
    assert.ok(status.missing.includes("CHATTY_USER_EMAIL"));
  });

  it("fingerprints messages without exposing content", () => {
    const fingerprints = fingerprintMessages([
      {
        role: "assistant",
        timestamp: "2026-05-06T04:45:01.000Z",
        content: "newest assistant turn",
      },
    ]);

    assert.equal(fingerprints.length, 1);
    assert.equal(fingerprints[0].index, 0);
    assert.equal(fingerprints[0].role, "assistant");
    assert.equal(fingerprints[0].timestamp, "2026-05-06T04:45:01.000Z");
    assert.match(fingerprints[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(fingerprints[0], "content"), false);
  });

  it("reports the first exact divergence by index", () => {
    const comparison = compareTruthTails({
      canonicalMessages: [
        { role: "user", timestamp: "2026-05-06T04:45:00.000Z", content: "same" },
        { role: "assistant", timestamp: "2026-05-06T04:45:01.000Z", content: "canonical" },
      ],
      backendMessages: [
        { role: "user", timestamp: "2026-05-06T04:45:00.000Z", content: "same" },
        { role: "assistant", timestamp: "2026-05-06T04:45:01.000Z", content: "backend" },
      ],
    });

    assert.equal(comparison.match, false);
    assert.equal(comparison.divergencePoint.index, 1);
    assert.notEqual(
      comparison.divergencePoint.vvault.sha256,
      comparison.divergencePoint.backend.sha256,
    );
  });

  it("runs a passing proof from direct VVAULT API and backend readback with local fallback disabled", async () => {
    const calls = [];
    const report = await runZenVvaultTruthProof({
      env: {
        VVAULT_API_BASE_URL: "http://127.0.0.1:8000",
        VVAULT_SERVICE_TOKEN: "test-token",
        CHATTY_USER_EMAIL: "devon@example.com",
      },
      getTranscript: async () => ({
        success: true,
        messages: [
          { role: "user", timestamp: "2026-05-06T04:45:00.000Z", content: "hello" },
          { role: "assistant", timestamp: "2026-05-06T04:45:01.000Z", content: "hi" },
        ],
      }),
      backendReadConversations: async (lookup, constructId, options) => {
        calls.push({ lookup, constructId, options });
        return [
          {
            sessionId: "zen-001_chat_with_zen-001",
            persistenceSource: "vvault-api",
            messages: [
              { role: "user", timestamp: "2026-05-06T04:45:00.000Z", content: "hello" },
              { role: "assistant", timestamp: "2026-05-06T04:45:01.000Z", content: "hi" },
            ],
          },
        ];
      },
    });

    assert.equal(report.STATUS, "TRUTH_RESTORED");
    assert.equal(report.THREAD_ID, "zen-001_chat_with_zen-001");
    assert.equal(report.MESSAGE_COUNT_COMPARISON.match, true);
    assert.equal(report.DIVERGENCE_POINT, null);
    assert.deepEqual(calls[0].options, { allowLocalFallback: false });
  });
});
