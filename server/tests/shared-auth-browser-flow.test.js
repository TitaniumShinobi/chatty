import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSharedAuthDelegationUrl,
  getResponseSetCookieHeaders,
  isSharedAuthBrowserLoginEnabled,
  shouldDelegateGoogleBrowserAuth,
} from "../lib/sharedAuthBrowserFlow.js";

test("shared browser auth enables explicit local delegation without production crossover", () => {
  const config = {
    environment: "development",
    authApiBaseUrl: "http://127.0.0.1:1111",
    authPublicOrigin: "http://localhost:1111",
    enableSharedAuthBrowserLogin: true,
  };

  assert.equal(isSharedAuthBrowserLoginEnabled(config), true);
  assert.equal(shouldDelegateGoogleBrowserAuth(config, { cliCallback: null }), true);
  assert.equal(shouldDelegateGoogleBrowserAuth(config, { cliCallback: "http://127.0.0.1:5050/api/auth/cli/callback" }), false);

  const delegated = buildSharedAuthDelegationUrl(config, "/api/auth/google", {
    origin: "http://localhost:5173",
  });
  assert.equal(delegated.toString(), "http://localhost:1111/api/auth/google?origin=http%3A%2F%2Flocalhost%3A5173");
});

test("shared browser auth enables explicit production delegation without localhost leakage", () => {
  const config = {
    environment: "production",
    authApiBaseUrl: "https://auth.thewreck.org",
    authPublicOrigin: "https://auth.thewreck.org",
    enableSharedAuthBrowserLogin: true,
  };

  assert.equal(isSharedAuthBrowserLoginEnabled(config), true);
  const delegated = buildSharedAuthDelegationUrl(config, "/api/auth/google", {
    origin: "https://chatty.thewreck.org",
  });
  assert.equal(delegated.toString(), "https://auth.thewreck.org/api/auth/google?origin=https%3A%2F%2Fchatty.thewreck.org");
});

test("set-cookie extraction supports node fetch getSetCookie", () => {
  const response = {
    headers: {
      getSetCookie() {
        return ["auth_sid=abc; Path=/", "sid=def; Path=/"];
      },
    },
  };

  assert.deepEqual(getResponseSetCookieHeaders(response), [
    "auth_sid=abc; Path=/",
    "sid=def; Path=/",
  ]);
});
