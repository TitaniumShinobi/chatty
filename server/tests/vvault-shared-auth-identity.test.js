import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildVvaultSessionState,
  buildVvaultSessionStateFromAuthContext,
  getSharedSupabaseUserId,
  getSharedVvaultUserId,
  isSupabaseUuid,
} from "../lib/vvaultSharedAuthIdentity.js";

describe("shared VVAULT auth identity", () => {
  it("recognizes a shared-auth Supabase uid", () => {
    assert.equal(
      getSharedSupabaseUserId({
        authSource: "shared",
        user: {
          id: "life-user-1",
          uid: "123e4567-e89b-42d3-a456-426614174000",
        },
      }),
      "123e4567-e89b-42d3-a456-426614174000",
    );
    assert.equal(
      getSharedVvaultUserId({
        authSource: "shared",
        user: {
          id: "life-user-1",
          uid: "123e4567-e89b-42d3-a456-426614174000",
        },
      }),
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("does not treat generic LIFE ids as VVAULT-ready identities", () => {
    assert.equal(isSupabaseUuid("devon_1710000000000"), false);
    assert.equal(
      getSharedSupabaseUserId({
        authSource: "shared",
        user: {
          id: "devon_1710000000000",
          uid: "devon_1710000000000",
        },
      }),
      null,
    );
    assert.equal(
      getSharedVvaultUserId({
        authSource: "shared",
        user: {
          id: "devon_1710000000000",
          uid: "devon_1710000000000",
        },
      }),
      null,
    );
  });

  it("marks VVAULT ready from an explicit non-UUID VVAULT user id", () => {
    assert.deepEqual(
      buildVvaultSessionState(
        {
          id: "life-user-vvault",
          uid: "life-user-vvault",
          vvaultUserId: "test-user-001",
        },
        "shared",
      ),
      {
        ready: true,
        authSource: "shared",
        vvaultUserId: "test-user-001",
        supabaseUserId: null,
        reason: null,
      },
    );
  });

  it("keeps legacy Supabase UUIDs as a compatibility alias", () => {
    assert.deepEqual(
      buildVvaultSessionState(
        {
          id: "life-user-2",
          uid: "123e4567-e89b-42d3-a456-426614174003",
        },
        "shared",
      ),
      {
        ready: true,
        authSource: "shared",
        vvaultUserId: "123e4567-e89b-42d3-a456-426614174003",
        supabaseUserId: "123e4567-e89b-42d3-a456-426614174003",
        reason: null,
      },
    );
  });

  it("requires an explicit VVAULT id before marking shared auth ready", () => {
    assert.deepEqual(
      buildVvaultSessionState(
        {
          id: "life-user-3",
          uid: "life-user-3",
        },
        "shared",
      ),
      {
        ready: false,
        authSource: "shared",
        vvaultUserId: null,
        supabaseUserId: null,
        reason: "shared_auth_identity_unavailable",
      },
    );
  });

  it("preserves bridge-level shared auth failures for /api/me readiness", () => {
    assert.deepEqual(
      buildVvaultSessionStateFromAuthContext({
        ok: false,
        reason: "shared_auth_unconfigured",
        sharedReason: "shared_auth_unconfigured",
      }),
      {
        ready: false,
        authSource: null,
        vvaultUserId: null,
        supabaseUserId: null,
        reason: "shared_auth_unconfigured",
      },
    );
  });

  it("normalizes missing shared cookies to shared_auth_required", () => {
    assert.deepEqual(
      buildVvaultSessionStateFromAuthContext({
        ok: false,
        reason: "no_shared_auth_cookie",
        sharedReason: "no_shared_auth_cookie",
      }),
      {
        ready: false,
        authSource: null,
        vvaultUserId: null,
        supabaseUserId: null,
        reason: "shared_auth_required",
      },
    );
  });
});
