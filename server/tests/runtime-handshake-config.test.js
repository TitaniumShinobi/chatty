import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRuntimeHandshakeSafety,
  resolveRuntimeHandshakeConfig,
} from "../lib/runtimeHandshakeConfig.js";

test("development handshake resolves the private door only", () => {
  const config = resolveRuntimeHandshakeConfig({
    NODE_ENV: "development",
    VVAULT_SERVICE_TOKEN: "dev-token",
  });

  assert.equal(config.selectedDoor, "private");
  assert.equal(config.environment, "development");
  assert.equal(config.publicOrigin, "http://localhost:5173");
  assert.equal(config.chattyApiOrigin, "http://127.0.0.1:5050");
  assert.equal(config.vvaultOrigin, "http://127.0.0.1:8000");
  assert.equal(config.authApiBaseUrl, "http://127.0.0.1:1111");
  assert.deepEqual(config.allowedBrowserOrigins, [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  assert.deepEqual(config.vvaultTargets, [
    {
      name: "private",
      origin: "http://127.0.0.1:8000",
      token: "dev-token",
      sessionBridgePath: "/api/vault/session-bridge",
    },
  ]);
  assert.deepEqual(config.problems, []);
  assert.equal(config.ok, true);
});

test("production handshake resolves the public door only", () => {
  const config = resolveRuntimeHandshakeConfig({
    NODE_ENV: "production",
    VVAULT_SERVICE_TOKEN: "prod-token",
    AUTH_COOKIE_DOMAIN: ".thewreck.org",
  });

  assert.equal(config.selectedDoor, "public");
  assert.equal(config.environment, "production");
  assert.equal(config.publicOrigin, "https://chatty.thewreck.org");
  assert.equal(config.chattyApiOrigin, "https://chatty.thewreck.org");
  assert.equal(config.vvaultOrigin, "https://vvault.thewreck.org");
  assert.equal(config.authApiBaseUrl, "https://auth.thewreck.org");
  assert.equal(config.cookieDomain, ".thewreck.org");
  assert.equal(config.authCookieDomain, ".thewreck.org");
  assert.deepEqual(config.allowedBrowserOrigins, ["https://chatty.thewreck.org"]);
  assert.deepEqual(config.vvaultTargets, [
    {
      name: "public",
      origin: "https://vvault.thewreck.org",
      token: "prod-token",
      sessionBridgePath: "/api/vault/session-bridge",
    },
  ]);
  assert.deepEqual(config.problems, []);
  assert.equal(config.ok, true);
});

test("production handshake fails loudly when an explicit localhost origin is injected", () => {
  const safety = assertRuntimeHandshakeSafety({
    NODE_ENV: "production",
    AUTH_API_BASE_URL: "http://127.0.0.1:1111",
  });

  assert.equal(safety.selectedDoor, "public");
  assert.equal(safety.ok, false);
  assert.ok(safety.problems.includes("door_public_with_localhost_target"));
});

test("private handshake fails loudly when a production origin is injected", () => {
  const safety = assertRuntimeHandshakeSafety({
    NODE_ENV: "development",
    VVAULT_URL: "https://vvault.thewreck.org",
  });

  assert.equal(safety.selectedDoor, "private");
  assert.equal(safety.ok, false);
  assert.ok(safety.problems.includes("door_private_with_production_target"));
});
