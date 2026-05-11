import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConversationIndexLookupCandidates,
  isUuidLikeLookupId,
} from "../lib/vvaultIndexLookupCandidates.js";

test("recognizes UUID-like lookup ids", () => {
  assert.equal(
    isUuidLikeLookupId("123e4567-e89b-12d3-a456-426614174000"),
    true,
  );
  assert.equal(isUuidLikeLookupId("dev_user_001"), false);
  assert.equal(isUuidLikeLookupId("dev@chatty.local"), false);
});

test("keeps only UUID-like candidates for conversation index lookups", () => {
  const candidates = buildConversationIndexLookupCandidates([
    "life-user-1",
    "shared@example.com",
    "123e4567-e89b-12d3-a456-426614174000",
    "123e4567-e89b-12d3-a456-426614174000",
    "  9f8c7b6a-5d4e-4c3b-9a8f-0123456789ab  ",
    null,
    "(no req.user.email)",
  ]);

  assert.deepEqual(candidates, [
    "123e4567-e89b-12d3-a456-426614174000",
    "9f8c7b6a-5d4e-4c3b-9a8f-0123456789ab",
  ]);
});
