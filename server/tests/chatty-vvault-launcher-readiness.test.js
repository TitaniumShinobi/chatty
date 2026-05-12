import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");
const standaloneLauncher = fs.readFileSync(
  path.join(repoRoot, "scripts", "open-chatty-standalone.sh"),
  "utf8",
);
const runtimeSupervisor = fs.readFileSync(
  path.join(repoRoot, "scripts", "keep-running.sh"),
  "utf8",
);

describe("Chatty VVAULT launcher readiness contract", () => {
  it("uses strict VVAULT readiness instead of shallow health for startup gating", () => {
    assert.match(
      standaloneLauncher,
      /CHATTY_VVAULT_READY_URL="\$\{CHATTY_VVAULT_READY_URL:-http:\/\/127\.0\.0\.1:8000\/api\/ready\}"/,
    );
    assert.match(
      runtimeSupervisor,
      /VVAULT_READY_URL="\$\{CHATTY_VVAULT_READY_URL:-http:\/\/127\.0\.0\.1:8000\/api\/ready\}"/,
    );

    assert.doesNotMatch(standaloneLauncher, /CHATTY_VVAULT_HEALTH_URL=.*8000\/api\/health/);
    assert.doesNotMatch(runtimeSupervisor, /VVAULT_HEALTH_URL=.*8000\/api\/health/);
  });

  it("keeps Chatty backend liveness separate from VVAULT readiness", () => {
    assert.match(
      standaloneLauncher,
      /CHATTY_BACKEND_HEALTH_URL="\$\{CHATTY_BACKEND_HEALTH_URL:-http:\/\/127\.0\.0\.1:5050\/api\/health\}"/,
    );
    assert.match(runtimeSupervisor, /SERVER_HEALTH_URL="http:\/\/127\.0\.0\.1:5050\/api\/health"/);
  });

  it("targets the shared auth authority on port 1111 in the local managed launcher path", () => {
    assert.match(
      standaloneLauncher,
      /CHATTY_AUTH_HEALTH_URL="\$\{CHATTY_AUTH_HEALTH_URL:-http:\/\/127\.0\.0\.1:1111\/health\}"/,
    );
    assert.match(
      runtimeSupervisor,
      /AUTH_HEALTH_URL="\$\{CHATTY_AUTH_HEALTH_URL:-http:\/\/127\.0\.0\.1:1111\/health\}"/,
    );
    assert.match(runtimeSupervisor, /AUTH_PORT_VALUE="\$\{AUTH_PORT:-1111\}"/);
  });
});
