import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { writeTranscript } from "../../vvaultConnector/writeTranscript.js";

const ORIGINAL_ENV = {
  VVAULT_API_BASE_URL: process.env.VVAULT_API_BASE_URL,
  VVAULT_URL: process.env.VVAULT_URL,
  VVAULT_SERVICE_TOKEN: process.env.VVAULT_SERVICE_TOKEN,
  VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH: process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH,
  CHATTY_ALLOW_LEGACY_SUPABASE_TRANSCRIPT_WRITES: process.env.CHATTY_ALLOW_LEGACY_SUPABASE_TRANSCRIPT_WRITES,
  DATABASE_URL: process.env.DATABASE_URL,
};
const originalFetch = globalThis.fetch;
let tempDir;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'content-type'
          ? 'application/json'
          : null;
      },
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function recordFetchCall(calls, url, options = {}) {
  calls.push({
    url: String(url),
    options: {
      method: options.method,
      headers: options.headers ? { ...options.headers } : undefined,
      body: options.body,
    },
  });
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-vvault-write-test-"));
  process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, "store.json");
  delete process.env.VVAULT_API_BASE_URL;
  delete process.env.VVAULT_URL;
  delete process.env.VVAULT_SERVICE_TOKEN;
  delete process.env.DATABASE_URL;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("writeTranscript VVAULT API path", { concurrency: false }, () => {
  it("ensures a created conversation through the configured VVAULT API before Supabase fallback", async () => {
    delete process.env.VVAULT_API_BASE_URL;
    process.env.VVAULT_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      recordFetchCall(calls, url, options);
      return jsonResponse({
        success: true,
        content: "# Zen\n",
        thread_id: "zen-001_chat_with_zen-001",
      });
    };

    const result = await writeTranscript({
      userId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      userEmail: "devon@example.com",
      sessionId: "zen-001_chat_with_zen-001",
      role: "system",
      content: "CONVERSATION_CREATED:Zen",
      constructId: "zen-001",
      constructCallsign: "zen-001",
    });

    assert.equal(result.success, true);
    assert.equal(result.source, "vvault_body");
    assert.equal(result.writePath, "vvault-api");
    assert.equal(result.persistenceOwner, "vvault_body");
    assert.equal(result.canonicalTarget, "vvault_body_transcripts");
    assert.equal(result.canonicalTargetTable, "ovvaults.transcripts");
    assert.equal(result.canonicalWritePath, "vvault_api:/api/chatty/transcript/:constructId/message");
    assert.equal(result.fallbackUsed, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/transcript/zen-001");
    assert.equal(calls[0].options.headers["X-Chatty-Key"], "test-token");
    assert.equal(calls[0].options.headers["X-Chatty-User"], "devon@example.com");
  });

  it("appends messages through the configured VVAULT API with the browser session user", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      recordFetchCall(calls, url, options);
      return jsonResponse({
        success: true,
        action: "appended",
        thread_id: "zen-001_chat_with_zen-001",
      });
    };

    const result = await writeTranscript({
      userId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      userEmail: "devon@example.com",
      sessionId: "zen-001_chat_with_zen-001",
      role: "user",
      content: "hello",
      constructId: "zen-001",
      constructCallsign: "zen-001",
      metadata: {
        userName: "Devon",
        runtimeTurnState: {
          sessionId: "zen-001_chat_with_zen-001",
          constructId: "zen-001",
          continuitySeq: 7,
          assistantTurnId: "rt_7_tail",
          tailHash: "abc123def456",
          hydrationTruth: "full",
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.source, "vvault_body");
    assert.equal(result.writePath, "vvault-api");
    assert.equal(result.persistenceOwner, "vvault_body");
    assert.equal(result.canonicalTarget, "vvault_body_transcripts");
    assert.equal(result.canonicalTargetTable, "ovvaults.transcripts");
    assert.equal(result.canonicalWritePath, "vvault_api:/api/chatty/transcript/:constructId/message");
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.localMirror, undefined);
    assert.equal(result.localMirrorSource, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/transcript/zen-001/message");
    assert.equal(calls[0].options.method, "POST");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.role, "user");
    assert.match(body.content, /^hello\n\n<!-- CHATTY_METADATA [A-Za-z0-9_-]+ -->$/);
    assert.equal(body.name, "Devon");
    assert.equal(body.metadata.runtimeTurnState.sessionId, "zen-001_chat_with_zen-001");
    assert.equal(body.metadata.runtimeTurnState.continuitySeq, 7);
    await assert.rejects(
      fs.readFile(process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH, "utf8"),
      { code: "ENOENT" },
    );
  });

  it("does not let legacy direct-Supabase flags skip the VVAULT API", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      recordFetchCall(calls, url, options);
      return jsonResponse({ success: true });
    };

    const result = await writeTranscript({
      userId: "test-user-001",
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      sessionId: "lin-001_chat_with_lin-001",
      role: "user",
      content: "hello",
      constructId: "lin-001",
      constructCallsign: "lin-001",
      preferDirectSupabase: true,
      metadata: {
        transcriptPath: "instances/lin-001/chatty/chat_with_lin-001.md",
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(result.success, true);
    assert.equal(result.source, "vvault_body");
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/transcript/lin-001/message");
  });

  it("blocks required canonical writes before local fallback when the VVAULT API append fails", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      recordFetchCall(calls, url, options);
      return jsonResponse({ success: false, error: "unavailable" }, 503);
    };

    const result = await writeTranscript({
      userId: "test-user-001",
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      sessionId: "lin-001_chat_with_lin-001",
      role: "assistant",
      content: "canonical failure should not fallback",
      constructId: "lin-001",
      constructCallsign: "lin-001",
      requireVvaultBodySuccess: true,
    });

    assert.equal(result.success, false);
    assert.equal(result.reason, "vvault_body_write_unavailable");
    assert.equal(result.canonicalTarget, "vvault_body_transcripts");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/transcript/lin-001/message");
    await assert.rejects(
      fs.readFile(process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH, "utf8"),
      { code: "ENOENT" },
    );
  });

  it("retains local fallback only for degraded non-required writes", async () => {
    delete process.env.VVAULT_API_BASE_URL;
    delete process.env.VVAULT_URL;
    delete process.env.DATABASE_URL;

    const result = await writeTranscript({
      userId: "test-user-001",
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      sessionId: "nova-001_chat_with_nova-001",
      role: "user",
      content: "degraded non-required write",
      constructId: "nova-001",
      constructCallsign: "nova-001",
    });

    assert.equal(result.success, true);
    assert.equal(result.source, "local-fallback");
    const rawStore = await fs.readFile(process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH, "utf8");
    const store = JSON.parse(rawStore);
    assert.equal(store.conversations.length, 1);
    assert.equal(store.conversations[0].messages.length, 1);
    assert.equal(store.conversations[0].messages[0].content, "degraded non-required write");
  });
});
