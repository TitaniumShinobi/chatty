import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSupabaseUserId } from "../auth/lib/supabaseUserResolver.js";

describe("Supabase user resolver", () => {
  it("fast-paths the canonical owner email to the canonical Supabase UUID", async () => {
    const resolved = await resolveSupabaseUserId({
      email: "user@example.com",
      chattyUserId: "test-user-001",
    });

    assert.equal(resolved.supabaseUserId, "7e34f6b8-e33a-48b5-8ddb-95b94d18e296");
    assert.equal(resolved.source, "canonical_owner");
  });

  it("fast-paths the canonical owner life id to the canonical Supabase UUID", async () => {
    const resolved = await resolveSupabaseUserId({
      email: null,
      chattyUserId: "test-user-001",
    });

    assert.equal(resolved.supabaseUserId, "7e34f6b8-e33a-48b5-8ddb-95b94d18e296");
    assert.equal(resolved.source, "canonical_owner");
  });
});
