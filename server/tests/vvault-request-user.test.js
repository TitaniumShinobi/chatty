import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveVvaultRequestUser } from "../lib/vvaultRequestUser.js";

describe("VVAULT request-user resolution for conversations/profile routes", () => {
  it("resolves a Supabase UUID from shared-auth-backed req.user when no Supabase session cookie is present", async () => {
    const req = {
      user: {
        id: "life-user-1",
        sub: "life-user-1",
        uid: "supabase-user-1",
        email: "shared@example.com",
        name: "Shared User",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveSupabaseUserImpl: async () => {
        throw new Error("no supabase session");
      },
      resolveRequestUserImpl: async (passedReq) => {
        assert.equal(passedReq.user.email, "shared@example.com");
        return {
          supabaseUserId: "supabase-user-1",
          chattyUserId: "life-user-1",
        };
      },
    });

    assert.deepEqual(resolved, {
      supabaseUserId: "supabase-user-1",
      chattyUserId: "life-user-1",
      userId: "supabase-user-1",
    });
  });

  it("falls back to the shared auth uid when no Supabase mapping can be resolved", async () => {
    const req = {
      user: {
        id: "life-user-2",
        sub: "life-user-2",
        uid: "supabase-user-2",
        email: "shared2@example.com",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveSupabaseUserImpl: async () => {
        throw new Error("no supabase session");
      },
      resolveRequestUserImpl: async () => ({
        supabaseUserId: null,
        chattyUserId: null,
      }),
    });

    assert.deepEqual(resolved, {
      supabaseUserId: null,
      chattyUserId: "supabase-user-2",
      userId: "supabase-user-2",
    });
  });

  it("falls back quickly when Supabase session resolution hangs", async () => {
    const req = {
      user: {
        id: "life-user-3",
        sub: "life-user-3",
        uid: "supabase-user-3",
        email: "shared3@example.com",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveSupabaseUserImpl: async () => new Promise(() => {}),
      resolveRequestUserImpl: async () => ({
        supabaseUserId: "supabase-user-3",
        chattyUserId: "life-user-3",
      }),
      supabaseSessionTimeoutMs: 20,
      supabaseMappingTimeoutMs: 20,
    });

    assert.deepEqual(resolved, {
      supabaseUserId: "supabase-user-3",
      chattyUserId: "life-user-3",
      userId: "supabase-user-3",
    });
  });

  it("falls back to req.user.uid when Supabase mapping also hangs", async () => {
    const req = {
      user: {
        id: "life-user-4",
        sub: "life-user-4",
        uid: "123e4567-e89b-12d3-a456-426614174000",
        email: "shared4@example.com",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveSupabaseUserImpl: async () => new Promise(() => {}),
      resolveRequestUserImpl: async () => new Promise(() => {}),
      supabaseSessionTimeoutMs: 20,
      supabaseMappingTimeoutMs: 20,
    });

    assert.deepEqual(resolved, {
      supabaseUserId: null,
      chattyUserId: "123e4567-e89b-12d3-a456-426614174000",
      userId: "123e4567-e89b-12d3-a456-426614174000",
    });
  });

  it("fails closed for shared-auth-only browser routes when no Supabase mapping can be resolved", async () => {
    const req = {
      user: {
        id: "life-user-5",
        sub: "life-user-5",
        uid: "123e4567-e89b-12d3-a456-426614174001",
        email: "shared5@example.com",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveSupabaseUserImpl: async () => {
        throw new Error("no supabase session");
      },
      resolveRequestUserImpl: async () => ({
        supabaseUserId: null,
        chattyUserId: "123e4567-e89b-12d3-a456-426614174001",
      }),
      requireSupabaseUserId: true,
    });

    assert.equal(resolved, null);
  });

  it("accepts the shared-auth uid as the strict Supabase identity", async () => {
    const req = {
      authSource: "shared",
      user: {
        id: "life-user-6",
        sub: "life-user-6",
        uid: "123e4567-e89b-42d3-a456-426614174002",
        email: "shared6@example.com",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveSupabaseUserImpl: async () => {
        throw new Error("shared auth uid should short-circuit before session lookup");
      },
      resolveRequestUserImpl: async () => {
        throw new Error("shared auth uid should short-circuit before mapping lookup");
      },
      requireSupabaseUserId: true,
    });

    assert.deepEqual(resolved, {
      supabaseUserId: "123e4567-e89b-42d3-a456-426614174002",
      chattyUserId: "life-user-6",
      userId: "123e4567-e89b-42d3-a456-426614174002",
    });
    assert.equal(req.vvaultIdentityTrace?.branchResolved, "shared_supabase_uid");
    assert.deepEqual(req.vvaultIdentityTrace?.branchTrail, ["shared_supabase_uid"]);
  });

  it("uses bridge-derived identity for shared sessions whose uid is still a LIFE fallback", async () => {
    const req = {
      authSource: "shared",
      user: {
        id: "devon_1710000000000",
        sub: "devon_1710000000000",
        uid: "devon_1710000000000",
        email: "shared7@example.com",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveBridgeIdentityImpl: async (passedReq) => {
        assert.equal(passedReq.user.email, "shared7@example.com");
        return {
          ok: true,
          supabaseUserId: "123e4567-e89b-42d3-a456-426614174003",
        };
      },
      resolveSupabaseUserImpl: async () => {
        throw new Error("bridge identity should short-circuit before session lookup");
      },
      resolveRequestUserImpl: async () => {
        throw new Error("bridge identity should short-circuit before mapping lookup");
      },
      requireSupabaseUserId: true,
    });

    assert.deepEqual(resolved, {
      supabaseUserId: "123e4567-e89b-42d3-a456-426614174003",
      chattyUserId: "devon_1710000000000",
      userId: "123e4567-e89b-42d3-a456-426614174003",
    });
    assert.equal(req.vvaultIdentityTrace?.branchResolved, "bridge_identity_ok");
    assert.deepEqual(req.vvaultIdentityTrace?.branchTrail, ["bridge_identity_ok"]);
  });

  it("keeps strict shared-auth misses fail-closed even when bridge probing also fails", async () => {
    const req = {
      authSource: "shared",
      user: {
        id: "devon_1710000000001",
        sub: "devon_1710000000001",
        uid: "devon_1710000000001",
        email: "shared8@example.com",
      },
    };

    const resolved = await resolveVvaultRequestUser(req, {
      resolveBridgeIdentityImpl: async () => ({
        ok: false,
        status: 503,
        errorCode: "AUTH_BRIDGE_MISCONFIGURED",
        reason: "vvault_bridge_unavailable",
        message: "VVAULT bridge unavailable",
      }),
      resolveSupabaseUserImpl: async () => {
        throw new Error("no supabase session");
      },
      resolveRequestUserImpl: async () => ({
        supabaseUserId: null,
        chattyUserId: null,
      }),
      requireSupabaseUserId: true,
    });

    assert.equal(resolved, null);
    assert.equal(req.vvaultIdentityFailure, null);
    assert.equal(req.vvaultIdentityTrace?.branchRejected, "require_supabase_reject");
    assert.deepEqual(req.vvaultIdentityTrace?.branchTrail, [
      "bridge_identity_failed",
      "supabase_cookie_failed",
      "mapping_failed",
      "require_supabase_reject",
    ]);
  });
});
