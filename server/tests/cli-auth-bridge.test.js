import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCliCallbackRedirect,
  normalizeCliCallbackUrl,
} from "../lib/cliAuthBridge.js";

describe("cli auth bridge helpers", () => {
  it("accepts localhost callback URLs on the expected path", () => {
    assert.equal(
      normalizeCliCallbackUrl("http://localhost:5174/cli-auth-callback"),
      "http://localhost:5174/cli-auth-callback",
    );
    assert.equal(
      normalizeCliCallbackUrl("http://127.0.0.1:9123/cli-auth-callback"),
      "http://127.0.0.1:9123/cli-auth-callback",
    );
  });

  it("rejects remote hosts, missing ports, and wrong paths", () => {
    assert.equal(
      normalizeCliCallbackUrl("http://example.com:5174/cli-auth-callback"),
      null,
    );
    assert.equal(
      normalizeCliCallbackUrl("https://localhost:5174/cli-auth-callback"),
      null,
    );
    assert.equal(
      normalizeCliCallbackUrl("http://localhost/cli-auth-callback"),
      null,
    );
    assert.equal(
      normalizeCliCallbackUrl("http://localhost:5174/not-cli"),
      null,
    );
  });

  it("builds callback redirects with exchange parameters", () => {
    const redirect = buildCliCallbackRedirect(
      "http://localhost:5174/cli-auth-callback",
      {
        code: "abc123",
        cid: "cid-001",
      },
    );

    assert.equal(
      redirect,
      "http://localhost:5174/cli-auth-callback?code=abc123&cid=cid-001",
    );
  });
});
