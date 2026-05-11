import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getAisRequestUserIds,
  getPreferredSupabaseUserIdFromRequest,
} from "../lib/aisRequestIdentity.js";

describe("AIs request identity", () => {
  it("prefers the shared-auth Supabase UUID when the request is shared-authenticated", () => {
    const req = {
      authSource: "shared",
      user: {
        uid: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
        id: "devon_woodson_1774390416168",
        email: "devon@example.com",
      },
    };

    assert.equal(
      getPreferredSupabaseUserIdFromRequest(req),
      "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    );
    assert.deepEqual(getAisRequestUserIds(req), {
      supabaseUserId: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
      chattyUserId: "devon_woodson_1774390416168",
    });
  });

  it("falls back to explicit Supabase-shaped user fields when shared auth is absent", () => {
    const req = {
      authSource: "native",
      user: {
        supabase_user_id: "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
        id: "devon_woodson_1774390416168",
        email: "devon@example.com",
      },
    };

    assert.equal(
      getPreferredSupabaseUserIdFromRequest(req),
      "7e34f6b8-e33a-48b5-8ddb-95b94d18e296",
    );
  });

  it("returns null when no Supabase UUID is present on the request", () => {
    const req = {
      authSource: "native",
      user: {
        id: "devon_woodson_1774390416168",
        email: "devon@example.com",
      },
    };

    assert.equal(getPreferredSupabaseUserIdFromRequest(req), null);
  });
});
