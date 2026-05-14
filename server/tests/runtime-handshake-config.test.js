import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRuntimeHandshakeSafety,
  resolveRuntimeHandshakeConfig,
} from "../lib/runtimeHandshakeConfig.js";

test("development handshake resolves localhost-only runtime defaults", () => {
  const config = resolveRuntimeHandshakeConfig({
    NODE_ENV: "development",
  });

  assert.equal(config.environment, "development");
  assert.equal(config.selectedDoor, "private");
  assert.equal(config.authApiBaseUrl, "http://127.0.0.1:1111");
  assert.equal(config.authPublicOrigin, "http://localhost:1111");
  assert.equal(config.vvaultApiBaseUrl, "http://127.0.0.1:8000");
  assert.equal(config.publicOrigin, "http://localhost:5173");
  assert.deepEqual(config.vvaultTargets, [
    {
      name: "private",
      origin: "http://127.0.0.1:8000",
      token: null,
      sessionBridgePath: "/api/vault/session-bridge",
    },
  ]);
  assert.deepEqual(config.allowedBrowserOrigins, [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  assert.equal(config.ok, true);
});

test("production handshake rejects localhost crossover in auth and vvault origins", () => {
  const result = assertRuntimeHandshakeSafety({
    NODE_ENV: "production",
    AUTH_API_BASE_URL: "http://127.0.0.1:1111",
    VVAULT_API_BASE_URL: "http://127.0.0.1:8000",
  });

  assert.equal(result.ok, false);
  assert.equal(result.selectedDoor, "public");
  assert.match(result.problems.join(","), /door_public_with_localhost_target/);
});

test("production handshake keeps allowed browser origins free of localhost", () => {
  const config = resolveRuntimeHandshakeConfig({
    NODE_ENV: "production",
  });

  assert.equal(config.ok, true);
  assert.equal(config.selectedDoor, "public");
  assert.deepEqual(config.allowedBrowserOrigins, ["https://chatty.thewreck.org"]);
  assert.equal(config.authPublicOrigin, "https://auth.thewreck.org");
  assert.equal(config.sessionBridgePath, "/api/vault/session-bridge");
});

test("production handshake rejects localhost shared-auth browser delegation", () => {
  const result = assertRuntimeHandshakeSafety({
    NODE_ENV: "production",
    AUTH_PUBLIC_ORIGIN: "http://localhost:1111",
    ENABLE_SHARED_AUTH_BROWSER_LOGIN: "true",
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join(","), /door_public_with_localhost_target/);
});

test("private door rejects production crossover in explicit origins", () => {
  const result = assertRuntimeHandshakeSafety({
    NODE_ENV: "development",
    AUTH_API_BASE_URL: "https://auth.thewreck.org",
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join(","), /door_private_with_production_target/);
});
