import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildChattyApiMeAuthFailureLog,
  buildChattyApiMeIdentityLog,
  buildSharedAuthGateFailureLog,
  buildStrictGateIdentityLog,
  getRequestSessionKeys,
  logVvaultIdentityDiagnostics,
} from "../lib/vvaultIdentityDiagnostics.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_INFO = console.info;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  console.info = ORIGINAL_INFO;
});

describe("VVAULT identity diagnostics", () => {
  it("hashes auth_sid and sid without exposing raw cookie values", () => {
    process.env.VVAULT_IDENTITY_DIAGNOSTICS = "true";
    process.env.VVAULT_IDENTITY_DIAGNOSTICS_SALT = "atlas-local-salt";
    process.env.AUTH_COOKIE_NAME = "auth_sid";
    process.env.COOKIE_NAME = "sid";

    const req = {
      headers: {
        cookie: "auth_sid=shared-session-token; sid=chatty-session-token",
      },
    };

    const keys = getRequestSessionKeys(req);
    assert.equal(keys.authSessionKey?.length, 12);
    assert.equal(keys.chattySessionKey?.length, 12);
    assert.notEqual(keys.authSessionKey, "shared-session-token");
    assert.notEqual(keys.chattySessionKey, "chatty-session-token");
    assert.deepEqual(Object.keys(keys).sort(), ["authSessionKey", "chattySessionKey"]);
  });

  it("builds a compact /api/me diagnostics payload for Atlas correlation", () => {
    process.env.VVAULT_IDENTITY_DIAGNOSTICS = "true";
    process.env.VVAULT_IDENTITY_DIAGNOSTICS_SALT = "atlas-local-salt";
    process.env.AUTH_COOKIE_NAME = "auth_sid";
    process.env.COOKIE_NAME = "sid";

    const req = {
      _rid: "rid-chatty-me",
      originalUrl: "/api/me",
      headers: {
        cookie: "auth_sid=shared-session-token; sid=chatty-session-token",
      },
    };

    const payload = buildChattyApiMeIdentityLog(
      req,
      {
        source: "chatty",
        user: {
          id: "life-user-1",
          sub: "life-user-1",
          uid: "life-user-1",
          email: "devon@example.com",
        },
      },
      {
        ready: false,
        reason: "shared_auth_identity_unavailable",
      },
    );

    assert.equal(payload.rid, "rid-chatty-me");
    assert.equal(payload.requestPath, "/api/me");
    assert.equal(payload.authSource, "chatty");
    assert.equal(payload.computedUid, "life-user-1");
    assert.equal(payload.uidState, "life_fallback");
    assert.equal(payload.life_user_id_present, true);
    assert.equal(payload.supabase_user_id_present, false);
    assert.equal(payload.vvaultSessionReady, false);
    assert.equal(payload.vvaultSessionReason, "shared_auth_identity_unavailable");
    assert.ok(payload.authSessionKey);
    assert.ok(payload.chattySessionKey);
  });

  it("captures safe key correlation for /api/me auth failures", () => {
    process.env.VVAULT_IDENTITY_DIAGNOSTICS = "true";
    process.env.VVAULT_IDENTITY_DIAGNOSTICS_SALT = "atlas-local-salt";
    process.env.AUTH_COOKIE_NAME = "auth_sid";
    process.env.COOKIE_NAME = "sid";

    const payload = buildChattyApiMeAuthFailureLog(
      {
        _rid: "rid-chatty-fail",
        originalUrl: "/api/me",
        headers: {
          cookie: "sid=chatty-session-token",
        },
      },
      {
        reason: "shared_auth_required",
        nativeReason: "invalid_jwt",
        sharedReason: "no_shared_auth_cookie",
        sharedStatus: null,
      },
    );

    assert.equal(payload.rid, "rid-chatty-fail");
    assert.equal(payload.requestPath, "/api/me");
    assert.equal(payload.authSessionKey, null);
    assert.ok(payload.chattySessionKey);
    assert.equal(payload.nativeReason, "invalid_jwt");
    assert.equal(payload.sharedReason, "no_shared_auth_cookie");
    assert.equal(payload.sharedStatus, null);
  });

  it("captures safe key correlation for shared-auth gate failures", () => {
    process.env.VVAULT_IDENTITY_DIAGNOSTICS = "true";
    process.env.VVAULT_IDENTITY_DIAGNOSTICS_SALT = "atlas-local-salt";
    process.env.AUTH_COOKIE_NAME = "auth_sid";
    process.env.COOKIE_NAME = "sid";

    const payload = buildSharedAuthGateFailureLog(
      {
        _rid: "rid-shared-gate",
        originalUrl: "/api/vvault/conversations/index",
        headers: {
          cookie: "sid=chatty-session-token",
        },
      },
      {
        reason: "no_shared_auth_cookie",
        sharedReason: "no_shared_auth_cookie",
      },
      {
        errorCode: "AUTH_REQUIRED",
      },
    );

    assert.equal(payload.rid, "rid-shared-gate");
    assert.equal(payload.requestPath, "/api/vvault/conversations/index");
    assert.equal(payload.authSessionKey, null);
    assert.ok(payload.chattySessionKey);
    assert.equal(payload.sharedReason, "no_shared_auth_cookie");
    assert.equal(payload.errorCode, "AUTH_REQUIRED");
  });

  it("logs strict-gate branch labels without leaking cookie material", () => {
    process.env.VVAULT_IDENTITY_DIAGNOSTICS = "true";
    process.env.VVAULT_IDENTITY_DIAGNOSTICS_SALT = "atlas-local-salt";
    process.env.AUTH_COOKIE_NAME = "auth_sid";
    process.env.COOKIE_NAME = "sid";

    const logged = [];
    console.info = (...args) => {
      logged.push(args);
    };

    const req = {
      _rid: "rid-vvault-index",
      originalUrl: "/api/vvault/conversations/index",
      authSource: "shared",
      headers: {
        cookie: "auth_sid=shared-session-token; sid=chatty-session-token",
      },
      user: {
        id: "life-user-2",
        sub: "life-user-2",
        uid: "life-user-2",
        email: "devon@example.com",
      },
      vvaultIdentityTrace: {
        branchEntered: "mapping_failed",
        branchResolved: null,
        branchRejected: "require_supabase_reject",
        branchTrail: [
          "bridge_identity_failed",
          "supabase_cookie_failed",
          "mapping_failed",
          "require_supabase_reject",
        ],
      },
    };

    const payload = buildStrictGateIdentityLog(req, null, {
      requireSupabaseUserId: true,
    });
    logVvaultIdentityDiagnostics("vvault_strict_gate", payload);

    assert.equal(logged.length, 1);
    assert.equal(logged[0]?.[0], "ℹ️ [VvaultIdentityDiagnostics]");
    assert.equal(logged[0]?.[1]?.label, "vvault_strict_gate");
    assert.equal(logged[0]?.[1]?.strictGateBranchEntered, "mapping_failed");
    assert.equal(logged[0]?.[1]?.strictGateBranchRejected, "require_supabase_reject");
    assert.deepEqual(logged[0]?.[1]?.strictGateBranchTrail, [
      "bridge_identity_failed",
      "supabase_cookie_failed",
      "mapping_failed",
      "require_supabase_reject",
    ]);
    assert.equal(logged[0]?.[1]?.authSessionKey?.includes("shared-session-token"), false);
    assert.equal(logged[0]?.[1]?.chattySessionKey?.includes("chatty-session-token"), false);
    assert.equal(logged[0]?.[1]?.requestPath, "/api/vvault/conversations/index");
  });
});
