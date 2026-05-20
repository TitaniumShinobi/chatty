import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clearCanonicalConstructIdentityCache,
  isIdentityAvatarRow,
  loadCanonicalConstructIdentity,
  pickCanonicalAvatarRow,
} from "../lib/constructIdentityRepository.js";

const ORIGINAL_ENV = {
  VVAULT_API_BASE_URL: process.env.VVAULT_API_BASE_URL,
  VVAULT_URL: process.env.VVAULT_URL,
  VVAULT_BASE_URL: process.env.VVAULT_BASE_URL,
  VVAULT_SERVICE_TOKEN: process.env.VVAULT_SERVICE_TOKEN,
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearCanonicalConstructIdentityCache();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("canonical construct identity VVAULT body cutover", { concurrency: false }, () => {
  it("treats Sera-style identity glyph rows as avatar fallback candidates", () => {
    const glyphRow = {
      user_id: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      filename: "instances/sera-001/identity/sera-001_glyph.png",
      storage_path: "instances/sera-001/identity/sera-001_glyph.png",
      content: "base64-glyph",
      created_at: "2026-05-04T12:32:28.559Z",
    };
    const webpRow = {
      user_id: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      filename: "instances/sera-001/identity/avatar.webp",
      storage_path: "instances/sera-001/identity/avatar.webp",
      content: "base64-webp",
      created_at: "2026-05-04T12:32:27.559Z",
    };

    assert.equal(isIdentityAvatarRow(glyphRow), true);
    assert.equal(pickCanonicalAvatarRow([glyphRow], glyphRow.user_id), glyphRow);
    assert.equal(pickCanonicalAvatarRow([glyphRow, webpRow], glyphRow.user_id), webpRow);
  });

  it("loads body-native identity before requiring Supabase", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        success: true,
        status: "body_native",
        identity: {
          construct_id: "lin-001",
          name: "Lin",
          fullName: "Lin",
          description: "First construct lane",
          instructions: "Stay precise.",
          definition: "Lin definition body.",
          conversationStarters: ["Begin with a clean read."],
          voice: { instructions: "calm, direct" },
          source_files: {
            "prompt.json": {
              filename: "prompt.json",
              storage_path: "instances/lin-001/identity/prompt.json",
              content: "{\"name\":\"Lin\"}",
            },
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const identity = await loadCanonicalConstructIdentity({
      constructId: "lin-001",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/api/chatty/construct/lin-001/identity");
    assert.equal(calls[0].options.headers["X-Chatty-Key"], "test-service-token");
    assert.equal(identity.exists, true);
    assert.equal(identity.constructId, "lin-001");
    assert.equal(identity.displayName, "Lin");
    assert.equal(identity.instructions, "Stay precise.");
    assert.equal(identity.definition, "Lin definition body.");
    assert.equal(identity.identitySource, "vvault_body");
    assert.equal(identity.bodyNative, true);
    assert.equal(identity.sourceFiles["prompt.json"].metadata.source, "vvault_body");
    assert.equal(identity.sourceFiles["voice.json"].content, "{\"voice\":\"calm, direct\"}");
  });

  it("keeps VVAULT body avatar.webp source files visible to avatar resolution", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";
    globalThis.fetch = async () => new Response(JSON.stringify({
      success: true,
      status: "body_native",
      identity: {
        construct_id: "sera-001",
        name: "Sera",
        instructions: "Use the canonical body.",
        source_files: {
          "avatar.webp": {
            filename: "avatar.webp",
            storage_path: "instances/sera-001/identity/avatar.webp",
            file_type: "image/webp",
            sha256: "webp-sha",
          },
        },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const identity = await loadCanonicalConstructIdentity({
      constructId: "sera-001",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    });

    assert.equal(identity.exists, true);
    assert.equal(identity.sourceFiles["avatar.webp"].storage_path, "instances/sera-001/identity/avatar.webp");
    assert.equal(identity.sourceFiles["avatar.webp"].file_type, "image/webp");
    assert.equal(identity.sourceFiles["avatar.webp"].metadata.source, "vvault_body");
  });

  it("accepts VVAULT body avatar.png as the canonical avatar descriptor", async () => {
    process.env.VVAULT_API_BASE_URL = "http://127.0.0.1:8000";
    process.env.VVAULT_SERVICE_TOKEN = "test-service-token";
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW0cAAAAASUVORK5CYII=";
    globalThis.fetch = async () => new Response(JSON.stringify({
      success: true,
      status: "body_native",
      identity: {
        construct_id: "sera-001",
        name: "Sera",
        instructions: "Use the canonical body.",
        avatar_descriptor: {
          status: "present",
          filename: "instances/sera-001/identity/avatar.png",
          storagePath: "instances/sera-001/identity/avatar.png",
          contentType: "image/png",
          sha256: "png-sha",
          content: pngBase64,
          pngMagicOk: true,
        },
        source_files: {
          "avatar.png": {
            filename: "avatar.png",
            storage_path: "instances/sera-001/identity/avatar.png",
            content: pngBase64,
            file_type: "binary",
            metadata: { contentType: "image/png", mimeType: "image/png" },
            sha256: "png-sha",
          },
        },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const identity = await loadCanonicalConstructIdentity({
      constructId: "sera-001",
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    });

    assert.equal(identity.exists, true);
    assert.equal(identity.avatarDescriptor.filename, "instances/sera-001/identity/avatar.png");
    assert.equal(identity.avatarDescriptor.contentType, "image/png");
    assert.equal(identity.avatarDescriptor.pngMagicOk, true);
    assert.equal(identity.avatarRow.content, pngBase64);
    assert.equal(identity.avatarRow.metadata.source, "vvault_body");
  });
});
