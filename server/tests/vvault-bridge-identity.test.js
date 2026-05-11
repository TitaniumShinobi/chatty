import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildVvaultSessionStateFromBridgeIdentity,
  resolveVvaultApiMeSessionState,
  resolveVvaultBridgeIdentity,
} from "../lib/vvaultBridgeIdentity.js";

describe("VVAULT bridge identity resolution", () => {
  it("keeps legacy Supabase UUIDs as compatibility aliases from the session bridge flow", async () => {
    const calls = [];
    const req = {
      method: "GET",
      originalUrl: "/api/me",
      headers: {
        cookie: "auth_sid=shared-session",
      },
      user: {
        id: "devon_1710000000000",
        sub: "devon_1710000000000",
        uid: "devon_1710000000000",
        email: "bridge@example.com",
        name: "Bridge User",
      },
    };

    const resolved = await resolveVvaultBridgeIdentity(req, {
      targets: [{ name: "local", origin: "http://127.0.0.1:8000" }],
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, init });
        if (url === "http://127.0.0.1:8000/api/vault/session-bridge") {
          return new Response(
            JSON.stringify({
              success: true,
              token: "vvault-bearer-1",
              api_base_url: "http://127.0.0.1:8000/api/vault",
              user: { email: "bridge@example.com", name: "Bridge User" },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        if (url === "http://127.0.0.1:8000/api/vault/user-info") {
          assert.equal(init.headers.Authorization, "Bearer vvault-bearer-1");
          return new Response(
            JSON.stringify({
              success: true,
              user_id: "123e4567-e89b-42d3-a456-426614174010",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(resolved, {
      ok: true,
      httpStatus: 200,
      vvaultUserId: "123e4567-e89b-42d3-a456-426614174010",
      supabaseUserId: "123e4567-e89b-42d3-a456-426614174010",
      authMethod: "shared_auth_bridge",
      apiBaseUrl: "http://127.0.0.1:8000/api/vault",
      phase: "user-info",
    });
    assert.deepEqual(
      buildVvaultSessionStateFromBridgeIdentity(
        { ok: true, source: "shared" },
        resolved,
      ),
      {
        ready: true,
        authSource: "shared",
        vvaultUserId: "123e4567-e89b-42d3-a456-426614174010",
        supabaseUserId: "123e4567-e89b-42d3-a456-426614174010",
        reason: null,
      },
    );
  });

  it("accepts non-UUID VVAULT user ids from the session bridge flow", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/me",
      headers: {
        cookie: "auth_sid=shared-session",
      },
      user: {
        id: "devon_1710000000000",
        sub: "devon_1710000000000",
        uid: "devon_1710000000000",
        email: "bridge@example.com",
        name: "Bridge User",
      },
    };

    const resolved = await resolveVvaultBridgeIdentity(req, {
      targets: [{ name: "local", origin: "http://127.0.0.1:8000" }],
      fetchImpl: async (url, init = {}) => {
        if (url === "http://127.0.0.1:8000/api/vault/session-bridge") {
          return new Response(
            JSON.stringify({
              success: true,
              token: "vvault-bearer-2",
              api_base_url: "http://127.0.0.1:8000/api/vault",
              user: { email: "bridge@example.com", name: "Bridge User" },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        if (url === "http://127.0.0.1:8000/api/vault/user-info") {
          assert.equal(init.headers.Authorization, "Bearer vvault-bearer-2");
          return new Response(
            JSON.stringify({
              success: true,
              user_id: "devon_woodson_1774390416168",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    assert.deepEqual(resolved, {
      ok: true,
      httpStatus: 200,
      vvaultUserId: "devon_woodson_1774390416168",
      supabaseUserId: null,
      authMethod: "shared_auth_bridge",
      apiBaseUrl: "http://127.0.0.1:8000/api/vault",
      phase: "user-info",
    });
    assert.deepEqual(
      buildVvaultSessionStateFromBridgeIdentity(
        { ok: true, source: "shared" },
        resolved,
      ),
      {
        ready: true,
        authSource: "shared",
        vvaultUserId: "devon_woodson_1774390416168",
        supabaseUserId: null,
        reason: null,
      },
    );
  });

  it("classifies a rejected shared session as auth-needed", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/me",
      headers: {
        cookie: "auth_sid=shared-session",
      },
      user: {
        id: "devon_1710000000001",
        sub: "devon_1710000000001",
        uid: "devon_1710000000001",
        email: "bridge2@example.com",
      },
    };

    const resolved = await resolveVvaultBridgeIdentity(req, {
      targets: [{ name: "local", origin: "http://127.0.0.1:8000" }],
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

    assert.deepEqual(
      {
        ok: resolved.ok,
        status: resolved.status,
        errorCode: resolved.errorCode,
        reason: resolved.reason,
        message: resolved.message,
        phase: resolved.phase,
      },
      {
        ok: false,
        status: 401,
        errorCode: "AUTH_REQUIRED",
        reason: "shared_auth_required",
        message: "Shared authentication required",
        phase: "session-bridge",
      },
    );
    assert.equal(Array.isArray(resolved.details?.attempts), true);
  });

  it("allows /api/me startup readiness to upgrade when bridge identity resolves a VVAULT id", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/me",
      headers: {
        cookie: "auth_sid=shared-session",
      },
      user: {
        id: "devon_1710000000010",
        sub: "devon_1710000000010",
        uid: "devon_1710000000010",
        email: "startup@example.com",
      },
    };

    const vvaultSession = await resolveVvaultApiMeSessionState(
      req,
      {
        ok: true,
        source: "shared",
        user: req.user,
      },
      {
        resolveBridgeIdentityImpl: async () => ({
          ok: true,
          vvaultUserId: "devon_woodson_1774390416168",
          supabaseUserId: null,
        }),
      },
    );

    assert.deepEqual(vvaultSession, {
      ready: true,
      authSource: "shared",
      vvaultUserId: "devon_woodson_1774390416168",
      supabaseUserId: null,
      reason: null,
    });
  });

  it("preserves optional bridge outage reason for /api/me readiness", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/me",
      headers: {
        cookie: "auth_sid=shared-session",
      },
      user: {
        id: "devon_1710000000011",
        sub: "devon_1710000000011",
        uid: "devon_1710000000011",
        email: "startup2@example.com",
      },
    };

    const vvaultSession = await resolveVvaultApiMeSessionState(
      req,
      {
        ok: true,
        source: "shared",
        user: req.user,
      },
      {
        resolveBridgeIdentityImpl: async () => ({
          ok: false,
          status: 503,
          errorCode: "AUTH_BRIDGE_MISCONFIGURED",
          reason: "vvault_bridge_unavailable",
          message: "VVAULT bridge unavailable",
        }),
      },
    );

    assert.deepEqual(vvaultSession, {
      ready: false,
      authSource: "shared",
      vvaultUserId: null,
      supabaseUserId: null,
      reason: "vvault_bridge_unavailable",
    });
  });

  it("preserves optional bridge unreachable reason for /api/me readiness", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/me",
      headers: {
        cookie: "auth_sid=shared-session",
      },
      user: {
        id: "devon_1710000000012",
        sub: "devon_1710000000012",
        uid: "devon_1710000000012",
        email: "startup3@example.com",
      },
    };

    const vvaultSession = await resolveVvaultApiMeSessionState(
      req,
      {
        ok: true,
        source: "shared",
        user: req.user,
      },
      {
        resolveBridgeIdentityImpl: async () => ({
          ok: false,
          status: 502,
          errorCode: "VVAULT_UNREACHABLE",
          reason: "vvault_unreachable",
          message: "VVAULT is unreachable",
        }),
      },
    );

    assert.deepEqual(vvaultSession, {
      ready: false,
      authSource: "shared",
      vvaultUserId: null,
      supabaseUserId: null,
      reason: "vvault_unreachable",
    });
  });

  it("preserves real shared-auth bridge failures for /api/me readiness without probing VVAULT", async () => {
    let bridgeCalls = 0;
    const vvaultSession = await resolveVvaultApiMeSessionState(
      {
        method: "GET",
        originalUrl: "/api/me",
        headers: {},
      },
      {
        ok: false,
        reason: "shared_auth_timeout",
        sharedReason: "shared_auth_timeout",
      },
      {
        resolveBridgeIdentityImpl: async () => {
          bridgeCalls += 1;
          return {
            ok: true,
            supabaseUserId: "123e4567-e89b-42d3-a456-426614174012",
          };
        },
      },
    );

    assert.equal(bridgeCalls, 0);
    assert.deepEqual(vvaultSession, {
      ready: false,
      authSource: null,
      vvaultUserId: null,
      supabaseUserId: null,
      reason: "shared_auth_timeout",
    });
  });
});
