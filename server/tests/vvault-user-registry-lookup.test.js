import assert from "node:assert/strict";
import test from "node:test";

import { resolveLinkedVvaultUserId } from "../lib/vvaultUserRegistryLookup.js";

function createLogger() {
  return {
    warnings: [],
    warn(message) {
      this.warnings.push(message);
    },
  };
}

test("skips Mongo user lookup when mongoose is disconnected", async () => {
  let findByIdCalled = false;
  const logger = createLogger();
  const userModel = {
    db: { readyState: 0 },
    findById() {
      findByIdCalled = true;
      throw new Error("should not be called");
    },
  };

  const linkedVvaultUserId = await resolveLinkedVvaultUserId({
    userModel,
    userLookupId: "chatty-user-1",
    initialVvaultUserId: "linked-from-session",
    logger,
  });

  assert.equal(linkedVvaultUserId, "linked-from-session");
  assert.equal(findByIdCalled, false);
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0], /readyState=0/);
});

test("returns vvaultUserId from Mongo when mongoose is connected", async () => {
  const logger = createLogger();
  const userModel = {
    db: { readyState: 1 },
    findById(id) {
      assert.equal(id, "chatty-user-1");
      return {
        select(fields) {
          assert.equal(fields, "vvaultUserId email");
          return {
            lean() {
              return {
                exec: async () => ({ vvaultUserId: "vault-user-1" }),
              };
            },
          };
        },
      };
    },
  };

  const linkedVvaultUserId = await resolveLinkedVvaultUserId({
    userModel,
    userLookupId: "chatty-user-1",
    initialVvaultUserId: null,
    logger,
  });

  assert.equal(linkedVvaultUserId, "vault-user-1");
  assert.equal(logger.warnings.length, 0);
});

test("falls back quickly when Mongo user lookup hangs", async () => {
  const logger = createLogger();
  const userModel = {
    db: { readyState: 1 },
    findById() {
      return {
        select() {
          return {
            lean() {
              return {
                exec: () => new Promise(() => {}),
              };
            },
          };
        },
      };
    },
  };

  const linkedVvaultUserId = await resolveLinkedVvaultUserId({
    userModel,
    userLookupId: "chatty-user-1",
    initialVvaultUserId: "linked-from-session",
    timeoutMs: 20,
    logger,
  });

  assert.equal(linkedVvaultUserId, "linked-from-session");
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0], /timed out after 20ms/);
});
