import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveVvaultDirectAuth } from "../lib/vvaultDirectAuth.js";

const TARGETS = [
  { name: "local", origin: "http://127.0.0.1:8000", token: "service-token-1" },
];

afterEach(() => {
  // No global cleanup needed yet; keep a hook so the test file matches repo style.
});

describe("vvault direct auth bridge", () => {
  it("prefers the shared auth session bridge when auth_sid is present", async () => {
    const calls = [];
    const result = await resolveVvaultDirectAuth({
      targets: TARGETS,
      rawCookieHeader: "auth_sid=shared-session",
      email: "shared@example.com",
      displayName: "Shared User",
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, init });
        assert.equal(url, "http://127.0.0.1:8000/api/vault/session-bridge");
        assert.match(init.headers.cookie, /auth_sid=shared-session/);
        return new Response(
          JSON.stringify({
            success: true,
            token: "vvault-bearer-1",
            expires_at: "2030-01-01T00:00:00.000Z",
            user: { email: "shared@example.com", name: "Shared User" },
            api_base_url: "http://127.0.0.1:8000/api/vault",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.authMethod, "shared_auth_bridge");
    assert.equal(result.token, "vvault-bearer-1");
    assert.equal(calls.length, 1);
  });

  it("returns AUTH_REQUIRED when no shared auth cookie is present", async () => {
    const result = await resolveVvaultDirectAuth({
      targets: TARGETS,
      rawCookieHeader: "sid=chatty-session",
      email: "legacy@example.com",
      displayName: "Legacy User",
      fetchImpl: async () => {
        throw new Error("legacy fallback should be disabled by default");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.errorCode, "AUTH_REQUIRED");
  });

  it("returns AUTH_REQUIRED when the shared cookie is present but the bridge rejects the session", async () => {
    const result = await resolveVvaultDirectAuth({
      targets: TARGETS,
      rawCookieHeader: "auth_sid=shared-session",
      email: "shared@example.com",
      displayName: "Shared User",
      fetchImpl: async (url) => {
        assert.equal(url, "http://127.0.0.1:8000/api/vault/session-bridge");
        return new Response(
          JSON.stringify({ success: false, error: "Invalid or expired auth session" }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.errorCode, "AUTH_REQUIRED");
  });

  it("returns AUTH_BRIDGE_MISCONFIGURED when the shared bridge is misconfigured", async () => {
    const result = await resolveVvaultDirectAuth({
      targets: TARGETS,
      rawCookieHeader: "auth_sid=shared-session",
      email: "shared@example.com",
      displayName: "Shared User",
      fetchImpl: async (url) => {
        if (url.endsWith("/api/vault/session-bridge")) {
          return new Response(
            JSON.stringify({ success: false, error: "Session bridge is not configured (AUTH_SESSION_SECRET)" }),
            {
              status: 503,
              headers: { "content-type": "application/json" },
            },
          );
        }
        throw new Error("legacy fallback should not run");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.errorCode, "AUTH_BRIDGE_MISCONFIGURED");
  });

  it("returns VVAULT_UNREACHABLE when both bridge paths fail with connectivity errors", async () => {
    const result = await resolveVvaultDirectAuth({
      targets: TARGETS,
      rawCookieHeader: "auth_sid=shared-session",
      email: "shared@example.com",
      displayName: "Shared User",
      fetchImpl: async (url) => {
        if (url.endsWith("/api/vault/session-bridge")) {
          const error = new Error("connect ECONNREFUSED 127.0.0.1:8000");
          error.code = "ECONNREFUSED";
          throw error;
        }
        return new Response(
          JSON.stringify({ success: false, error: "upstream unavailable" }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(result.errorCode, "VVAULT_UNREACHABLE");
  });
});
