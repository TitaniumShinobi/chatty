import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import {
  requireSharedAuth,
  requirePreferredAuth,
  resolveBrowserAuthContext,
  resolvePreferredAuthContext,
} from "../auth/middleware/auth.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreGlobals() {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
}

afterEach(() => {
  restoreGlobals();
});

describe("shared auth middleware", () => {
  it("resolves a valid Chatty sid without consulting shared auth", async () => {
    process.env.COOKIE_NAME = "sid";
    process.env.JWT_SECRET = "test-chatty-secret";
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";

    const token = jwt.sign(
      { id: "chatty-user-1", sub: "chatty-user-1", email: "chatty@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("shared auth should not be called for a valid sid");
    };

    const req = {
      method: "GET",
      url: "/api/me",
      cookies: { sid: token },
      headers: { cookie: `sid=${encodeURIComponent(token)}` },
    };

    const resolved = await resolvePreferredAuthContext(req);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.source, "chatty");
    assert.equal(req.user.email, "chatty@example.com");
    assert.equal(req.authSource, "chatty");
    assert.equal(fetchCalled, false);
  });

  it("hydrates req.user from shared auth when sid is missing and auth_sid is valid", async () => {
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";
    process.env.AUTH_COOKIE_NAME = "auth_sid";

    globalThis.fetch = async (url, init = {}) => {
      assert.equal(url, "http://127.0.0.1:1111/api/me");
      assert.match(init.headers.cookie, /auth_sid=shared-session-token/);
      return new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: "life-user-1",
            sub: "life-user-1",
            uid: "supabase-user-1",
            email: "shared@example.com",
            name: "Shared User",
            auth_provider: "google",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    const req = {
      method: "GET",
      url: "/api/me",
      cookies: {},
      headers: { cookie: "auth_sid=shared-session-token" },
    };

    const resolved = await resolvePreferredAuthContext(req);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.source, "shared");
    assert.equal(req.authSource, "shared");
    assert.equal(req.user.email, "shared@example.com");
    assert.equal(req.user.uid, "supabase-user-1");
  });

  it("rejects a valid legacy sid without auth_sid for browser /api/me reentry", async () => {
    process.env.COOKIE_NAME = "sid";
    process.env.JWT_SECRET = "test-chatty-secret";
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";
    process.env.AUTH_COOKIE_NAME = "auth_sid";

    const token = jwt.sign(
      { id: "chatty-user-1", sub: "chatty-user-1", email: "chatty@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("shared auth should not be called without auth_sid");
    };

    const req = {
      method: "GET",
      url: "/api/me",
      cookies: { sid: token },
      headers: { cookie: `sid=${encodeURIComponent(token)}` },
    };

    const resolved = await resolveBrowserAuthContext(req);
    assert.equal(resolved.ok, false);
    assert.equal(resolved.sharedReason, "no_shared_auth_cookie");
    assert.equal(resolved.nativeReason, null);
    assert.equal(req.user, undefined);
    assert.equal(fetchCalled, false);
  });

  it("returns AUTH_REQUIRED when neither Chatty nor shared auth resolves a session", async () => {
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";
    process.env.AUTH_COOKIE_NAME = "auth_sid";

    let nextCalled = false;
    let statusCode = 200;
    let payload = null;
    const req = {
      method: "GET",
      url: "/api/vvault/conversations/index",
      cookies: {},
      headers: {},
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return body;
      },
    };

    await requirePreferredAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.equal(payload?.errorCode, "AUTH_REQUIRED");
  });

  it("fails closed when shared auth /api/me hangs", async () => {
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";
    process.env.AUTH_COOKIE_NAME = "auth_sid";
    const originalWarn = console.warn;
    const warnCalls = [];
    console.warn = (...args) => {
      warnCalls.push(args);
    };

    const req = {
      method: "GET",
      url: "/api/me",
      cookies: {},
      headers: { cookie: "auth_sid=shared-session-token" },
    };

    try {
      const resolved = await resolvePreferredAuthContext(req, {
        fetchImpl: async () => new Promise(() => {}),
        sharedAuthTimeoutMs: 20,
      });

      assert.equal(resolved.ok, false);
      assert.equal(resolved.sharedReason, "shared_auth_timeout");
      assert.equal(req.user, undefined);
      assert.equal(warnCalls.length, 1);
      assert.equal(warnCalls[0]?.[0], "⚠️ [SharedAuthBridge]");
      assert.equal(warnCalls[0]?.[1]?.requestPath, "/api/me");
      assert.equal(warnCalls[0]?.[1]?.sharedReason, "shared_auth_timeout");
      assert.equal(warnCalls[0]?.[1]?.timeoutMs, 20);
      assert.equal(warnCalls[0]?.[1]?.failureClass, "timeout");
      assert.equal(typeof warnCalls[0]?.[1]?.elapsedMs, "number");
    } finally {
      console.warn = originalWarn;
    }
  });

  it("accepts shared auth for shared-only VVAULT browser routes", async () => {
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";
    process.env.AUTH_COOKIE_NAME = "auth_sid";

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: "life-user-1",
            sub: "life-user-1",
            uid: "supabase-user-1",
            email: "shared@example.com",
            name: "Shared User",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );

    let nextCalled = false;
    const req = {
      method: "GET",
      url: "/api/vvault/conversations/index",
      cookies: {},
      headers: { cookie: "auth_sid=shared-session-token" },
    };
    const res = {
      status() {
        throw new Error("shared auth should pass");
      },
      json() {
        throw new Error("shared auth should pass");
      },
    };

    await requireSharedAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.authSource, "shared");
  });

  it("rejects Chatty sid-only sessions for shared-only VVAULT browser routes", async () => {
    process.env.COOKIE_NAME = "sid";
    process.env.JWT_SECRET = "test-chatty-secret";
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";
    process.env.AUTH_COOKIE_NAME = "auth_sid";

    const token = jwt.sign(
      { id: "chatty-user-1", sub: "chatty-user-1", email: "chatty@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    let nextCalled = false;
    let statusCode = 200;
    let payload = null;
    const req = {
      method: "GET",
      url: "/api/vvault/conversations/index",
      cookies: { sid: token },
      headers: { cookie: `sid=${encodeURIComponent(token)}` },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return body;
      },
    };

    await requireSharedAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.equal(payload?.errorCode, "AUTH_REQUIRED");
    assert.equal(payload?.reason, "shared_auth_required");
  });

  it("surfaces bridge misconfiguration for shared-only routes even when Chatty sid is valid", async () => {
    process.env.COOKIE_NAME = "sid";
    process.env.JWT_SECRET = "test-chatty-secret";
    delete process.env.AUTH_API_BASE_URL;

    const token = jwt.sign(
      { id: "chatty-user-2", sub: "chatty-user-2", email: "chatty2@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    let nextCalled = false;
    let statusCode = 200;
    let payload = null;
    const req = {
      method: "GET",
      url: "/api/vvault/conversations/index",
      cookies: { sid: token },
      headers: { cookie: `sid=${encodeURIComponent(token)}` },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return body;
      },
    };

    await requireSharedAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 502);
    assert.equal(payload?.errorCode, "AUTH_BRIDGE_MISCONFIGURED");
    assert.equal(payload?.reason, "shared_auth_unconfigured");
  });

  it("surfaces bridge unavailability for shared-only routes when auth_sid cannot be resolved", async () => {
    process.env.AUTH_API_BASE_URL = "http://127.0.0.1:1111";
    process.env.AUTH_COOKIE_NAME = "auth_sid";

    globalThis.fetch = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:1111");
    };

    let nextCalled = false;
    let statusCode = 200;
    let payload = null;
    const req = {
      method: "GET",
      url: "/api/vvault/conversations/index",
      cookies: {},
      headers: { cookie: "auth_sid=shared-session-token" },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return body;
      },
    };

    await requireSharedAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 503);
    assert.equal(payload?.errorCode, "AUTH_BRIDGE_MISCONFIGURED");
    assert.equal(payload?.reason, "shared_auth_unavailable");
  });
});
