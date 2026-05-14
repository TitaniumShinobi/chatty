import test from "node:test";
import assert from "node:assert/strict";

import {
  assertProductionPublicOriginSafety,
  isConfiguredCanonicalOrigin,
  resolveConfiguredCallbackBase,
  resolveConfiguredCanonicalDomain,
  resolveConfiguredCookieDomain,
  resolveConfiguredPublicOrigin,
} from "../lib/publicOriginConfig.js";

test("production config resolves callback and public origin from explicit HTTPS env", () => {
  const env = {
    NODE_ENV: "production",
    PUBLIC_CALLBACK_BASE: "https://chatty.thewreck.org",
    FRONTEND_URL: "https://chatty.thewreck.org",
  };

  assert.equal(resolveConfiguredCallbackBase(env), "https://chatty.thewreck.org");
  assert.equal(resolveConfiguredPublicOrigin(env), "https://chatty.thewreck.org");
  assert.equal(resolveConfiguredCanonicalDomain(env), "chatty.thewreck.org");
  assert.equal(resolveConfiguredCookieDomain(env), "chatty.thewreck.org");
  assert.equal(isConfiguredCanonicalOrigin("https://chatty.thewreck.org", env), true);
});

test("production safety check rejects localhost callback or public origin", () => {
  const env = {
    NODE_ENV: "production",
    PUBLIC_CALLBACK_BASE: "http://localhost:5050",
    FRONTEND_URL: "http://localhost:5173",
  };

  const result = assertProductionPublicOriginSafety(env);
  assert.equal(result.ok, false);
  assert.match(result.problems.join(","), /localhost/i);
});

test("production safety check passes without CANONICAL_DOMAIN when public URLs are explicit", () => {
  const env = {
    NODE_ENV: "production",
    PUBLIC_CALLBACK_BASE: "https://chatty.thewreck.org",
    FRONTEND_URL: "https://chatty.thewreck.org",
    POST_LOGIN_REDIRECT: "https://chatty.thewreck.org",
  };

  const result = assertProductionPublicOriginSafety(env);
  assert.deepEqual(result, {
    ok: true,
    callbackBase: "https://chatty.thewreck.org",
    publicOrigin: "https://chatty.thewreck.org",
    problems: [],
  });
});

test("production safety check falls back to the public door contract", () => {
  const env = {
    NODE_ENV: "production",
  };

  const result = assertProductionPublicOriginSafety(env);
  assert.deepEqual(result, {
    ok: true,
    callbackBase: "https://chatty.thewreck.org",
    publicOrigin: "https://chatty.thewreck.org",
    problems: [],
  });
  assert.equal(resolveConfiguredCookieDomain(env), "chatty.thewreck.org");
});
