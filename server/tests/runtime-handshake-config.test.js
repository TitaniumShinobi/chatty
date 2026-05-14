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
  assert.equal(config.authApiBaseUrl, "http://127.0.0.1:1111");
  assert.equal(config.authPublicOrigin, "http://localhost:1111");
  assert.equal(config.vvaultApiBaseUrl, "http://127.0.0.1:8000");
  assert.equal(config.publicOrigin, "http://localhost:5173");
  assert.deepEqual(config.vvaultTargets, [
    { name: "local", origin: "http://127.0.0.1:8000", token: null },
  ]);
  assert.ok(config.allowedBrowserOrigins.includes("http://localhost:5173"));
  assert.ok(config.allowedBrowserOrigins.includes("http://127.0.0.1:5173"));
  assert.equal(config.ok, true);
});

test("production handshake rejects localhost crossover in auth and vvault origins", () => {
  const result = assertRuntimeHandshakeSafety({
    NODE_ENV: "production",
    PUBLIC_CALLBACK_BASE: "https://chatty.thewreck.org",
    FRONTEND_URL: "https://chatty.thewreck.org",
    AUTH_API_BASE_URL: "http://127.0.0.1:1111",
    VVAULT_API_BASE_URL: "http://127.0.0.1:8000",
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join(","), /AUTH_API_BASE_URL_localhost/);
  assert.match(result.problems.join(","), /VVAULT_API_BASE_URL_localhost/);
});

test("production handshake keeps allowed browser origins free of localhost", () => {
  const config = resolveRuntimeHandshakeConfig({
    NODE_ENV: "production",
    PUBLIC_CALLBACK_BASE: "https://chatty.thewreck.org",
    FRONTEND_URL: "https://chatty.thewreck.org",
    AUTH_API_BASE_URL: "https://auth.thewreck.org",
    AUTH_PUBLIC_ORIGIN: "https://auth.thewreck.org",
    VVAULT_API_BASE_URL: "https://vvault.thewreck.org",
  });

  assert.equal(config.ok, true);
  assert.deepEqual(config.allowedBrowserOrigins, ["https://chatty.thewreck.org"]);
  assert.equal(config.authPublicOrigin, "https://auth.thewreck.org");
});

test("production handshake rejects localhost shared-auth browser delegation", () => {
  const result = assertRuntimeHandshakeSafety({
    NODE_ENV: "production",
    PUBLIC_CALLBACK_BASE: "https://chatty.thewreck.org",
    FRONTEND_URL: "https://chatty.thewreck.org",
    AUTH_API_BASE_URL: "https://auth.thewreck.org",
    AUTH_PUBLIC_ORIGIN: "http://localhost:1111",
    ENABLE_SHARED_AUTH_BROWSER_LOGIN: "true",
    VVAULT_API_BASE_URL: "https://vvault.thewreck.org",
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join(","), /AUTH_PUBLIC_ORIGIN_localhost/);
});
