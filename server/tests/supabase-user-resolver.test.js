import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSupabaseUserId } from "../auth/lib/supabaseUserResolver.js";

describe("Supabase user resolver", () => {
  it("fast-paths the canonical owner email to the canonical Supabase UUID", async () => {
    const resolved = await resolveSupabaseUserId({
      email: "dwoodson92@gmail.com",
      chattyUserId: "devon_woodson_1774390416168",
    });

    assert.equal(resolved.supabaseUserId, "7e34f6b8-e33a-48b5-8ddb-95b94d18e296");
    assert.equal(resolved.source, "canonical_owner");
  });

  it("fast-paths the canonical owner life id to the canonical Supabase UUID", async () => {
    const resolved = await resolveSupabaseUserId({
      email: null,
      chattyUserId: "devon_woodson_1774390416168",
    });

    assert.equal(resolved.supabaseUserId, "7e34f6b8-e33a-48b5-8ddb-95b94d18e296");
    assert.equal(resolved.source, "canonical_owner");
  });
});
