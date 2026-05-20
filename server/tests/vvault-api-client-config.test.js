import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  getBaseUrl,
  getChattyAuthHeaders,
  getConstructFiles,
  getConstructIdentity,
  getConstructMemories,
  parseMarkdownToMessages,
  normalizeConstructFilesPayload,
} from "../../vvaultConnector/vvaultApiClient.js";

const ORIGINAL_ENV = {
  VVAULT_API_BASE_URL: process.env.VVAULT_API_BASE_URL,
  VVAULT_URL: process.env.VVAULT_URL,
  VVAULT_BASE_URL: process.env.VVAULT_BASE_URL,
  VVAULT_SERVICE_TOKEN: process.env.VVAULT_SERVICE_TOKEN,
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("VVAULT API client config", () => {
  it("uses VVAULT_URL when VVAULT_API_BASE_URL is absent", () => {
    delete process.env.VVAULT_API_BASE_URL;
    process.env.VVAULT_URL = "http://127.0.0.1:8000/";
    delete process.env.VVAULT_BASE_URL;

    assert.equal(getBaseUrl(), "http://127.0.0.1:8000");
  });

  it("prefers VVAULT_API_BASE_URL over VVAULT_URL", () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:9000/";
    process.env.VVAULT_URL = "http://127.0.0.1:8000/";

    assert.equal(getBaseUrl(), "http://127.0.0.1:9000");
  });

  it("carries Chatty email and Supabase UUID without exposing invalid IDs", () => {
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";

    const headers = getChattyAuthHeaders({
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    });

    assert.equal(headers["X-Chatty-Key"], "test-service-token");
    assert.equal(headers["X-Chatty-User"], "devon@example.com");
    assert.equal(headers["X-Chatty-Supabase-User-Id"], "7e34f6b8-e33a-48b5-8ddb-95b94d18e296");

    const invalid = getChattyAuthHeaders({
      userEmail: "devon@example.com",
      supabaseUserId: "not-a-uuid",
    });
    assert.equal(invalid["X-Chatty-Supabase-User-Id"], undefined);
  });

  it("reads construct identity from the VVAULT body API", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000/";
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        success: true,
        status: "body_native",
        identity: { construct_id: "lin-001", name: "Lin" },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const identity = await getConstructIdentity("lin-001", {
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    });

    assert.equal(identity.status, "body_native");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/construct/lin-001/identity");
    assert.equal(calls[0].options.headers["X-Chatty-Key"], "test-service-token");
    assert.equal(calls[0].options.headers["X-Chatty-User"], "devon@example.com");
  });

  it("reads construct memories from the VVAULT body API", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000/";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        success: true,
        status: "body_native",
        memories: [{ context: "hello", response: "signal" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const memories = await getConstructMemories("lin-001", "devon@example.com");

    assert.equal(memories.status, "body_native");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/construct/lin-001/memories");
    assert.equal(calls[0].options.headers["X-Chatty-User"], "devon@example.com");
  });

  it("normalizes grouped construct file payloads from the VVAULT body API", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000/";
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        success: true,
        status: "body_native",
        assets: [{ id: "asset-1", filename: "portrait.png" }],
        documents: [{ id: "doc-1", filename: "brief.md" }],
        identity: [{ id: "id-1", filename: "prompt.txt" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const files = await getConstructFiles("lin-001", {
      userEmail: "devon@example.com",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    });

    assert.equal(calls.length, 1);
    assert.equal(files.status, "body_native");
    assert.equal(files.files.length, 3);
    assert.deepEqual(files.files.map((file) => file.folder), ["assets", "documents", "identity"]);
  });

  it("exports a construct file payload normalizer for grouped body responses", () => {
    const normalized = normalizeConstructFilesPayload({
      success: true,
      status: "body_native",
      assets: [{ id: "asset-1" }],
      documents: [{ id: "doc-1" }],
      identity: [{ id: "id-1" }],
    });

    assert.equal(normalized.files.length, 3);
    assert.deepEqual(normalized.files.map((file) => file.folder), ["assets", "documents", "identity"]);
  });

  it("recovers compact Chatty metadata comments from canonical markdown transcripts", () => {
    const messages = parseMarkdownToMessages([
      "# Zen",
      "",
      "---",
      "",
      "**Zen** (2026-05-09T10:00:00.000Z):",
      "",
      "ready to continue",
      "",
      "<!-- CHATTY_METADATA eyJydW50aW1lVHVyblN0YXRlIjp7ImNhbm9uaWNhbFRocmVhZElkIjoiemVuLTAwMV9jaGF0X3dpdGhfemVuLTAwMSIsImNvbnRpbnVpdHlTZXEiOjc3LCJhc3Npc3RhbnRUdXJuSWQiOiJydF83N190YWlsIiwiaHlkcmF0aW9uVHJ1dGgiOiJmdWxsIn19 -->",
    ].join("\n"));

    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, "assistant");
    assert.equal(messages[0].content, "ready to continue");
    assert.equal(messages[0].metadata.runtimeTurnState.assistantTurnId, "rt_77_tail");
    assert.equal(messages[0].metadata.runtimeTurnState.continuitySeq, 77);
  });
});
