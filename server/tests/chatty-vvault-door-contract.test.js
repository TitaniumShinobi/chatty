import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chattyDoorPath = path.join(repoRoot, "config", "chatty-vvault-doors.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("door contract defines explicit private and public doors", () => {
  const contract = readJson(chattyDoorPath);

  assert.equal(contract.version, 1);
  assert.equal(contract.doors.private.chattyPublicOrigin, "http://localhost:5173");
  assert.equal(contract.doors.private.chattyApiOrigin, "http://127.0.0.1:5050");
  assert.equal(contract.doors.private.vvaultOrigin, "http://127.0.0.1:8000");
  assert.equal(contract.doors.private.authApiOrigin, "http://127.0.0.1:1111");
  assert.equal(contract.doors.public.chattyPublicOrigin, "https://chatty.thewreck.org");
  assert.equal(contract.doors.public.vvaultOrigin, "https://vvault.thewreck.org");
  assert.equal(contract.doors.public.authApiOrigin, "https://auth.thewreck.org");
});

test("door contract matches sibling vvault artifact when available", () => {
  const siblingCandidates = [
    path.resolve(repoRoot, "../../vvault/config/chatty-vvault-doors.json"),
    "/private/tmp/vvault-door-main/config/chatty-vvault-doors.json",
  ];

  const siblingPath = siblingCandidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(siblingPath, "Expected a sibling vvault door contract for parity verification");

  const chattyContract = fs.readFileSync(chattyDoorPath, "utf8");
  const vvaultContract = fs.readFileSync(siblingPath, "utf8");
  assert.equal(chattyContract, vvaultContract);
});
