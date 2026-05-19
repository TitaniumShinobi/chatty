import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildConversationHydrationPayload,
  buildConversationIndexHydrationPayload,
  buildContinuityProofReceipt,
  buildPreferredChatTranscriptPayload,
  buildTranscriptTruthPreflight,
  buildTranscriptWriteFailurePayload,
  isConversationVisibleToReadPath,
  mergeConversationIndexRecords,
  normalizeConversationIndexRecord,
} from "../lib/vvaultConversationRouteContract.js";
import { buildRuntimeTailHash } from "../lib/runtimeTurnState.js";
import { __test__ as vvaultRouteTest } from "../routes/vvault.js";

describe("VVAULT conversation route contract", () => {
  it("marks full hydration as complete when the primary read succeeds", () => {
    const payload = buildConversationHydrationPayload({
      fullLookup: {
        status: "ok",
        value: [{ sessionId: "nova-001_chat_with_nova-001", messages: [] }],
      },
      indexLookup: {
        status: "ok",
        value: [{ id: "ignored-index-row" }],
      },
      mapIndexRowsToHydrationRecords: () => {
        throw new Error("index fallback should not run for full hydration");
      },
    });

    assert.equal(payload.hydrationSource, "full");
    assert.equal(payload.hydrationComplete, true);
    assert.equal(payload.conversations.length, 1);
  });

  it("keeps production conversation hydration defaults above observed VVAULT transcript fanout", () => {
    assert.equal(vvaultRouteTest.DEFAULT_VVAULT_CONVERSATION_LOOKUP_TIMEOUT_MS, 15000);
    assert.equal(vvaultRouteTest.DEFAULT_VVAULT_INDEX_LOOKUP_TIMEOUT_MS, 8000);
  });

  it("marks local deferred fallback as partial instead of impersonating full hydration", () => {
    const payload = buildConversationHydrationPayload({
      fullLookup: {
        status: "ok",
        hydrationSource: "local-fallback",
        value: [{ sessionId: "zen-001_chat_with_zen-001", localFallback: true }],
      },
      indexLookup: {
        status: "timeout",
        value: null,
        error: "index unavailable",
      },
      mapIndexRowsToHydrationRecords: () => {
        throw new Error("index fallback should not run for local fallback hydration");
      },
    });

    assert.equal(payload.hydrationSource, "local-fallback");
    assert.equal(payload.hydrationComplete, false);
    assert.equal(payload.generativeEligible, false);
    assert.equal(payload.continuityEligible, false);
    assert.deepEqual(payload.conversations, [
      { sessionId: "zen-001_chat_with_zen-001", localFallback: true },
    ]);
  });

  it("marks clean conversation index reads as partial metadata hydration", () => {
    const payload = buildConversationIndexHydrationPayload({
      conversations: [{ id: "nova-001_chat_with_nova-001", title: "Nova" }],
    });

    assert.equal(payload.hydrationSource, "index");
    assert.equal(payload.hydrationComplete, false);
    assert.deepEqual(payload.conversations, [
      { id: "nova-001_chat_with_nova-001", title: "Nova" },
    ]);
  });

  it("preserves trusted avatar metadata in normalized conversation index rows", () => {
    const row = normalizeConversationIndexRecord({
      id: "nova-001_chat_with_nova-001",
      title: "Nova",
      constructId: "nova-001",
      avatar: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
      avatarUrl: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
      updatedAt: "2026-05-10T15:00:00.000Z",
      messages: [{ id: "m1", role: "assistant", content: "hello" }],
    });

    assert.equal(row.avatar, "/api/ais/nova-001/avatar?v=vvault-identity-v2");
    assert.equal(row.avatarUrl, "/api/ais/nova-001/avatar?v=vvault-identity-v2");
  });

  it("does not strip avatar metadata when merging conversation index rows", () => {
    const rows = mergeConversationIndexRecords([
      {
        id: "sera-001_chat_with_sera-001",
        title: "Sera",
        constructId: "sera-001",
        avatarUrl: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
        updatedAt: "2026-05-10T15:00:00.000Z",
      },
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].avatarUrl, "/api/ais/sera-001/avatar?v=vvault-identity-v2");
  });

  it("adds a backend-owned same-construct avatar route to address-book index rows", () => {
    const row = normalizeConversationIndexRecord({
      id: "hydro-001_chat_with_hydro-001",
      title: "Hydro",
      constructId: "hydro-001",
      updatedAt: "2026-05-10T15:00:00.000Z",
    });

    assert.equal(row.avatarUrl, "/api/ais/hydro-001/avatar");
  });

  it("preserves trusted avatar metadata when index rows become hydration records", () => {
    const [record] = vvaultRouteTest.mapConversationIndexRowsToHydrationRecords([
      normalizeConversationIndexRecord({
        id: "katana-001_chat_with_katana-001",
        title: "Katana",
        constructId: "katana-001",
        updatedAt: "2026-05-10T15:00:00.000Z",
      }),
    ]);

    assert.equal(record.sessionId, "katana-001_chat_with_katana-001");
    assert.equal(record.avatar, "/api/ais/katana-001/avatar");
    assert.equal(record.avatarUrl, "/api/ais/katana-001/avatar");
  });

  it("enriches full conversation rows with canonical avatar routes only when identity has an avatar", async () => {
    const rows = await vvaultRouteTest.enrichConversationRowsWithCanonicalAvatars(
      [
        {
          sessionId: "nova-001_chat_with_nova-001",
          title: "Nova",
          constructId: "nova-001",
          messages: [],
        },
        {
          sessionId: "hydro-001_chat_with_hydro-001",
          title: "Hydro",
          constructId: "hydro-001",
          messages: [],
        },
      ],
      {
        supabaseUserId: "user-1",
        loadIdentity: async ({ constructId, supabaseUserId }) => {
          assert.equal(supabaseUserId, "user-1");
          return constructId === "nova-001"
            ? { avatarDescriptor: { sha256: "avatar-sha" } }
            : { avatarDescriptor: null };
        },
      },
    );

    assert.equal(rows[0].avatar, "/api/ais/nova-001/avatar?v=avatar-sha");
    assert.equal(rows[0].avatarUrl, "/api/ais/nova-001/avatar?v=avatar-sha");
    assert.equal(rows[1].avatar, undefined);
    assert.equal(rows[1].avatarUrl, undefined);
  });

  it("does not overwrite explicit full conversation avatars during canonical enrichment", async () => {
    const rows = await vvaultRouteTest.enrichConversationRowsWithCanonicalAvatars(
      [
        {
          sessionId: "sera-001_chat_with_sera-001",
          title: "Sera",
          constructId: "sera-001",
          avatar: "https://example.test/sera.png",
          avatarUrl: "https://example.test/sera.png",
          messages: [],
        },
      ],
      {
        loadIdentity: async () => {
          throw new Error("explicit avatars should not require identity lookup");
        },
      },
    );

    assert.equal(rows[0].avatar, "https://example.test/sera.png");
    assert.equal(rows[0].avatarUrl, "https://example.test/sera.png");
  });

  it("marks degraded index reads with rows as index-fallback", () => {
    const payload = buildConversationIndexHydrationPayload({
      conversations: [{ id: "nova-001_chat_with_nova-001", title: "Nova" }],
      hadLookupFailures: true,
    });

    assert.equal(payload.hydrationSource, "index-fallback");
    assert.equal(payload.hydrationComplete, false);
    assert.deepEqual(payload.conversations, [
      { id: "nova-001_chat_with_nova-001", title: "Nova" },
    ]);
  });

  it("marks degraded empty index reads as empty-fallback", () => {
    const payload = buildConversationIndexHydrationPayload({
      conversations: [],
      hadLookupFailures: true,
    });

    assert.equal(payload.hydrationSource, "empty-fallback");
    assert.equal(payload.hydrationComplete, false);
    assert.deepEqual(payload.conversations, []);
  });

  it("marks bounded index fallback as partial instead of impersonating full hydration", () => {
    const payload = buildConversationHydrationPayload({
      fullLookup: {
        status: "timeout",
        value: null,
        error: "vvault_conversation_lookup timed out",
      },
      indexLookup: {
        status: "ok",
        value: [{ id: "nova-001_chat_with_nova-001", title: "Nova" }],
      },
      mapIndexRowsToHydrationRecords: (rows) =>
        rows.map((row) => ({
          sessionId: row.id,
          title: row.title,
          messages: [],
        })),
    });

    assert.equal(payload.hydrationSource, "index-fallback");
    assert.equal(payload.hydrationComplete, false);
    assert.equal(payload.generativeEligible, false);
    assert.equal(payload.continuityEligible, false);
    assert.deepEqual(payload.conversations, [
      {
        sessionId: "nova-001_chat_with_nova-001",
        title: "Nova",
        messages: [],
      },
    ]);
  });

  it("marks empty fallback explicitly when neither full nor index hydration completes", () => {
    const payload = buildConversationHydrationPayload({
      fullLookup: {
        status: "timeout",
        value: null,
        error: "vvault_conversation_lookup timed out",
      },
      indexLookup: {
        status: "timeout",
        value: null,
        error: "vvault_conversation_index_fallback timed out",
      },
      mapIndexRowsToHydrationRecords: () => [],
    });

    assert.equal(payload.hydrationSource, "empty-fallback");
    assert.equal(payload.hydrationComplete, false);
    assert.equal(payload.generativeEligible, false);
    assert.equal(payload.continuityEligible, false);
    assert.deepEqual(payload.conversations, []);
  });

  it("builds a full transcript-truth preflight only from the exact canonical thread plus runtime tail", () => {
    const assistantContent = "We were already on the active seam.";
    const runtimeTurnState = {
      canonicalThreadId: "zen-001_chat_with_zen-001",
      sessionId: "zen-001_chat_with_zen-001",
      constructId: "zen-001",
      constructRevision: "construct-runtime-v1:zen-001",
      continuitySeq: 12,
      assistantTurnId: "rt_12_tail",
      hydrationTruth: "full",
    };
    runtimeTurnState.tailHash = buildRuntimeTailHash({
      canonicalThreadId: runtimeTurnState.canonicalThreadId,
      constructId: runtimeTurnState.constructId,
      constructRevision: runtimeTurnState.constructRevision,
      continuitySeq: runtimeTurnState.continuitySeq,
      assistantTurnId: runtimeTurnState.assistantTurnId,
      assistantTailContent: assistantContent,
    });
    const preflight = buildTranscriptTruthPreflight({
      readPathAvailable: true,
      conversations: [
        {
          sessionId: "zen-001_chat_with_zen-001",
          persistenceSource: "vvault-api",
          messages: [
            { role: "user", content: "Pick this up where we left it." },
            {
              role: "assistant",
              content: assistantContent,
              metadata: { runtimeTurnState },
            },
          ],
        },
      ],
      sessionId: "zen-001_chat_with_zen-001",
      constructId: "zen-001",
      runtimeTurnState,
    });

    assert.equal(preflight.eligible, true);
    assert.equal(preflight.status, 200);
    assert.equal(preflight.hydrationSource, "full");
    assert.equal(preflight.hydrationComplete, true);
    assert.equal(preflight.exactThreadFound, true);
    assert.equal(preflight.assistantTailFound, true);
    assert.equal(preflight.runtimeStateFound, true);
    assert.equal(preflight.runtimeStateHydrationTruth, "full");
    assert.equal(preflight.latestAssistantRuntimeStateFound, true);
    assert.equal(preflight.latestAssistantRuntimeStateMatches, true);
    assert.equal(preflight.runtimeTurnState.assistantTurnId, "rt_12_tail");
    assert.equal(preflight.generativeEligible, true);
    assert.equal(preflight.continuityEligible, true);
  });

  it("allows normal generation from a fully hydrated canonical thread before a runtime tail exists", () => {
    const preflight = buildTranscriptTruthPreflight({
      readPathAvailable: true,
      conversations: [
        {
          sessionId: "zen-001_chat_with_zen-001",
          persistenceSource: "vvault-api",
          messages: [
            { role: "user", content: "Seed the next runtime-bearing turn." },
            { role: "assistant", content: "Older assistant tail without metadata." },
          ],
        },
      ],
      sessionId: "zen-001_chat_with_zen-001",
      constructId: "zen-001",
      requireRuntimeTurnState: false,
    });

    assert.equal(preflight.eligible, true);
    assert.equal(preflight.status, 200);
    assert.equal(preflight.generativeEligible, true);
    assert.equal(preflight.continuityEligible, false);
    assert.equal(preflight.latestAssistantRuntimeStateFound, false);
  });

  it("fails transcript-truth preflight closed on local fallback hydration", () => {
    const preflight = buildTranscriptTruthPreflight({
      readPathAvailable: true,
      conversations: [
        {
          sessionId: "zen-001_chat_with_zen-001",
          localFallback: true,
          messages: [
            { role: "user", content: "continue" },
            { role: "assistant", content: "fallback transcript" },
          ],
        },
      ],
      sessionId: "zen-001_chat_with_zen-001",
      constructId: "zen-001",
      runtimeTurnState: {
        sessionId: "zen-001_chat_with_zen-001",
        constructId: "zen-001",
        hydrationTruth: "full",
      },
    });

    assert.equal(preflight.eligible, false);
    assert.equal(preflight.status, 409);
    assert.equal(preflight.code, "TRANSCRIPT_HYDRATION_REQUIRED");
    assert.equal(preflight.hydrationSource, "local-fallback");
    assert.equal(preflight.fallbackRejected, true);
  });

  it("fails transcript-truth preflight when the canonical read path is unavailable", () => {
    const preflight = buildTranscriptTruthPreflight({
      readPathAvailable: false,
      sessionId: "zen-001_chat_with_zen-001",
      constructId: "zen-001",
      runtimeTurnState: {
        sessionId: "zen-001_chat_with_zen-001",
        constructId: "zen-001",
        hydrationTruth: "full",
      },
    });

    assert.equal(preflight.eligible, false);
    assert.equal(preflight.status, 503);
    assert.equal(preflight.code, "CANONICAL_TRANSCRIPT_READ_UNAVAILABLE");
  });

  it("prefers the canonical transcript over local deferred chat fallback", () => {
    const payload = buildPreferredChatTranscriptPayload({
      canonicalTranscript: {
        content: "# Nova\n\n[2026-04-26T14:49:28.390Z] **User**: Good morning, Nova. Happy Sunday ☀️",
        messages: [
          {
            id: "m1",
            role: "user",
            content: "Good morning, Nova. Happy Sunday ☀️",
            timestamp: "2026-04-26T14:49:28.390Z",
          },
        ],
      },
      localDeferredConversation: {
        messages: [
          {
            id: "m0",
            role: "user",
            content: "Older fallback body",
            timestamp: "2026-02-14T00:00:00.000Z",
          },
        ],
      },
    });

    assert.equal(payload.source, "canonical-transcript");
    assert.equal(payload.messages.length, 1);
    assert.match(payload.content, /Happy Sunday/);
  });

  it("falls back to canonical conversation before local deferred chat content", () => {
    const payload = buildPreferredChatTranscriptPayload({
      canonicalConversation: {
        messages: [
          {
            id: "m1",
            role: "assistant",
            content: "Present, continuous, and here as Nova.",
            timestamp: "2026-04-26T00:57:02.489Z",
          },
        ],
      },
      localDeferredConversation: {
        messages: [
          {
            id: "m0",
            role: "assistant",
            content: "Older fallback",
            timestamp: "2026-02-14T00:00:00.000Z",
          },
        ],
      },
    });

    assert.equal(payload.source, "canonical-conversation");
    assert.equal(payload.messages[0]?.content, "Present, continuous, and here as Nova.");
  });

  it("treats non-visible transcript writes as non-success persistence", () => {
    const failure = buildTranscriptWriteFailurePayload({
      ok: false,
      status: "error",
      error: "writeTranscript returned success:false",
    });

    assert.equal(failure.status, 503);
    assert.equal(failure.body.ok, false);
    assert.equal(failure.body.code, "TRANSCRIPT_PERSISTENCE_FAILED");
  });

  it("requires the created session to appear in the follow-up read path", () => {
    assert.equal(
      isConversationVisibleToReadPath(
        [{ sessionId: "nova-001_chat_with_nova-001" }],
        "nova-001_chat_with_nova-001",
      ),
      true,
    );
    assert.equal(
      isConversationVisibleToReadPath(
        [{ sessionId: "zen-001_chat_with_zen-001" }],
        "nova-001_chat_with_nova-001",
      ),
      false,
    );
  });

  it("builds a positive continuity proof receipt only when resume validation succeeded", () => {
    const receipt = buildContinuityProofReceipt({
      hydration: "full",
      hydrationComplete: true,
      resumeValidation: {
        continuityExpected: true,
        continuityRestored: true,
        continuitySource: "runtimeTurnState",
        continuedFromTurnId: "rt_18_tail",
        continuitySeq: 18,
        constructMatch: true,
        threadMatch: true,
        staleSeatRejected: false,
        resumeSourceSeat: "chatty",
      },
    });

    assert.equal(receipt.continuityExpected, true);
    assert.equal(receipt.continuityRestored, true);
    assert.equal(receipt.continuitySource, "runtimeTurnState");
    assert.equal(receipt.continuedFromTurnId, "rt_18_tail");
    assert.equal(receipt.continuitySeq, 18);
  });

  it("keeps failed continuity proof explicit instead of implying restoration", () => {
    const receipt = buildContinuityProofReceipt({
      hydration: "full",
      hydrationComplete: true,
      resumeValidation: {
        continuityExpected: true,
        continuityRestored: false,
        continuitySeq: 11,
        constructMatch: true,
        threadMatch: true,
        staleSeatRejected: true,
        failureReason: "continuity_seq_mismatch",
        resumeSourceSeat: "codex",
      },
    });

    assert.equal(receipt.continuityExpected, true);
    assert.equal(receipt.continuityRestored, false);
    assert.equal(receipt.continuitySource, "none");
    assert.equal(receipt.staleSeatRejected, true);
    assert.equal(receipt.continuityFailureReason, "continuity_seq_mismatch");
  });
});
