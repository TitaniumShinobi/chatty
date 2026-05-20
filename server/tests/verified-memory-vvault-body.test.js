import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clearVerifiedMemoryCache,
  loadVerifiedMemories,
} from "../lib/verifiedMemoryLoader.js";

const ORIGINAL_ENV = {
  VVAULT_API_BASE_URL: process.env.VVAULT_API_BASE_URL,
  VVAULT_URL: process.env.VVAULT_URL,
  VVAULT_BASE_URL: process.env.VVAULT_BASE_URL,
  VVAULT_SERVICE_TOKEN: process.env.VVAULT_SERVICE_TOKEN,
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearVerifiedMemoryCache();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("verified memories VVAULT body cutover", { concurrency: false }, () => {
  it("loads body-native memories before legacy Supabase discovery", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        success: true,
        status: "body_native",
        file_count: 2,
        memories: [
          {
            context: "Devon asked Lin to stay narrow.",
            response: "Lin agreed to keep the lane clean.",
            source_file: "chat_with_lin.md",
            relevance: 0.92,
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await loadVerifiedMemories("lin-001", "what did we agree?", 4);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/construct/lin-001/memories");
    assert.equal(calls[0].options.headers["X-Chatty-Key"], "test-service-token");
    assert.equal(result.source, "vvault_body");
    assert.equal(result.fileCount, 2);
    assert.equal(result.memories.length, 1);
    assert.equal(result.memories[0].context, "Devon asked Lin to stay narrow.");
    assert.equal(result.memories[0].response, "Lin agreed to keep the lane clean.");
    assert.equal(result.memories[0].sourceFile, "chat_with_lin.md");
  });

  it("passes VVAULT user context through construct memory reads", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        success: true,
        status: "body_native",
        file_count: 1,
        memories: ["Zenith transcript-law evidence is body-native."],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await loadVerifiedMemories(
      "zen-001",
      "Zenith/Codex transcript-law check: distinguish Soulgem from Soulprint.",
      3,
      {
        userContext: {
          userEmail: "devon@example.com",
          supabaseUserId: "11111111-1111-4111-8111-111111111111",
        },
      },
    );

    assert.equal(result.source, "vvault_body");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers["X-Chatty-User"], "devon@example.com");
    assert.equal(
      calls[0].options.headers["X-Chatty-Supabase-User-Id"],
      "11111111-1111-4111-8111-111111111111",
    );
  });
});
