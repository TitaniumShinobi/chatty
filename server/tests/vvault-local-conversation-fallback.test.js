import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  readConversationsFromLocalFallback,
  writeConversationToLocalFallback,
} from "../../vvaultConnector/localConversationFallback.js";

let tempDir;
const originalPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-vvault-local-fallback-"));
  process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, "store.json");
});

afterEach(async () => {
  if (typeof originalPath === "undefined") {
    delete process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
  } else {
    process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = originalPath;
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("VVAULT local conversation fallback", () => {
  it("makes a created conversation durably visible by email and Supabase UUID", async () => {
    const result = await writeConversationToLocalFallback({
      userId: "chatty-user-1",
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      sessionId: "zen-001_chat_with_zen-001",
      title: "Zen",
      constructId: "zen-001",
      constructCallsign: "zen-001",
      content: "CONVERSATION_CREATED:Zen",
      role: "system",
    });

    assert.equal(result.success, true);
    assert.equal(result.source, "local-fallback");

    const byEmail = await readConversationsFromLocalFallback("devon@example.com");
    assert.equal(byEmail.length, 1);
    assert.equal(byEmail[0].sessionId, "zen-001_chat_with_zen-001");
    assert.equal(byEmail[0].localFallback, true);
    assert.equal(byEmail[0].messages.length, 0);

    const bySupabaseId = await readConversationsFromLocalFallback(
      "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    );
    assert.equal(bySupabaseId.length, 1);
    assert.equal(bySupabaseId[0].constructId, "zen-001");
  });

  it("appends messages without duplicating the same local fallback write", async () => {
    const params = {
      userId: "chatty-user-1",
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      sessionId: "zen-001_chat_with_zen-001",
      title: "Zen",
      constructId: "zen-001",
      constructCallsign: "zen-001",
      content: "hello",
      role: "user",
      timestamp: "2026-04-23T12:00:00.000Z",
      metadata: { source: "test" },
    };

    await writeConversationToLocalFallback(params);
    await writeConversationToLocalFallback(params);

    const rows = await readConversationsFromLocalFallback("devon@example.com", "zen-001");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].messages.length, 1);
    assert.equal(rows[0].messages[0].content, "hello");
    assert.equal(rows[0].messages[0].metadata.source, "test");
  });

  it("preserves a reimported assistant tail when the runtimeTurnState continuity anchor changed", async () => {
    const common = {
      userId: "chatty-user-1",
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      sessionId: "zen-001_chat_with_zen-001",
      title: "Zen",
      constructId: "zen-001",
      constructCallsign: "zen-001",
      content: "same imported Codex assistant tail",
      role: "assistant",
      timestamp: "2026-05-08T22:55:20.341Z",
    };

    await writeConversationToLocalFallback({
      ...common,
      metadata: {
        sourceSeat: "codex",
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: "construct-runtime-v1:zen-001",
          updatedAt: "2026-05-08T22:55:20.341Z",
          continuitySeq: 18,
          assistantTurnId: "rt_18_authoritative",
          tailHash: "a".repeat(64),
          hydrationTruth: "full",
          ordinaryThreadSummary: "Authoritative imported Codex tail.",
          activeTopic: "authoritative codex tail",
          activeGoal: "Continue from the imported Codex tail.",
          activeMode: "ordinary",
          focusRefs: ["authoritative codex tail"],
          openLoop: "Continue from the imported Codex tail.",
          nextStep: "Continue through the canonical route.",
          awaiting: "user",
          unresolvedIntent: { kind: "handoff", text: "Continue through the canonical route." },
          lastTurnType: "ordinary",
        },
      },
    });

    await writeConversationToLocalFallback({
      ...common,
      metadata: {
        sourceSeat: "codex",
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: "construct-runtime-v1:zen-001",
          updatedAt: "2026-05-09T05:53:49.280Z",
          continuitySeq: 20,
          assistantTurnId: "rt_20_refreshed",
          tailHash: "b".repeat(64),
          hydrationTruth: "full",
          ordinaryThreadSummary: "Refreshed imported Codex tail.",
          activeTopic: "refreshed codex tail",
          activeGoal: "Continue from the refreshed imported Codex tail.",
          activeMode: "ordinary",
          focusRefs: ["refreshed codex tail"],
          openLoop: "Continue from the refreshed imported Codex tail.",
          nextStep: "Continue through the canonical route.",
          awaiting: "user",
          unresolvedIntent: { kind: "handoff", text: "Continue through the canonical route." },
          lastTurnType: "ordinary",
        },
      },
    });

    const rows = await readConversationsFromLocalFallback("devon@example.com", "zen-001");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].messages.length, 2);
    assert.equal(rows[0].messages[0].metadata.runtimeTurnState.assistantTurnId, "rt_18_authoritative");
    assert.equal(rows[0].messages[1].metadata.runtimeTurnState.assistantTurnId, "rt_20_refreshed");
  });
});
