import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOOR_CONTRACT_PATH = path.resolve(
  __dirname,
  "../../config/chatty-vvault-doors.json",
);

let cachedDoorContract = null;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseHttpUrl(value) {
  const candidate = trimString(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeOrigin(value) {
  const parsed = parseHttpUrl(value);
  return parsed ? parsed.origin : null;
}

function normalizePathname(value) {
  const candidate = trimString(value);
  if (!candidate) return null;
  return candidate.startsWith("/") ? candidate : `/${candidate}`;
}

function normalizeDoor(rawDoor) {
  if (!rawDoor || typeof rawDoor !== "object") return null;
  return {
    name: trimString(rawDoor.name) || null,
    chattyPublicOrigin: normalizeOrigin(rawDoor.chattyPublicOrigin),
    chattyApiOrigin: normalizeOrigin(rawDoor.chattyApiOrigin),
    vvaultOrigin: normalizeOrigin(rawDoor.vvaultOrigin),
    authApiOrigin: normalizeOrigin(rawDoor.authApiOrigin),
    authPublicOrigin:
      normalizeOrigin(rawDoor.authPublicOrigin) ||
      normalizeOrigin(rawDoor.authApiOrigin),
    authCookieName: trimString(rawDoor.authCookieName) || "auth_sid",
    sessionBridgePath:
      normalizePathname(rawDoor.sessionBridgePath) ||
      "/api/vault/session-bridge",
    allowedBrowserOrigins: Array.isArray(rawDoor.allowedBrowserOrigins)
      ? rawDoor.allowedBrowserOrigins
          .map((origin) => normalizeOrigin(origin))
          .filter(Boolean)
      : [],
    allowLegacyExchange: rawDoor.allowLegacyExchange === true,
  };
}

export function readDoorContract() {
  if (cachedDoorContract) return cachedDoorContract;
  const raw = fs.readFileSync(DOOR_CONTRACT_PATH, "utf8");
  const parsed = JSON.parse(raw);
  cachedDoorContract = {
    version: Number(parsed?.version || 0) || 0,
    path: DOOR_CONTRACT_PATH,
    doors: {
      private: normalizeDoor(parsed?.doors?.private),
      public: normalizeDoor(parsed?.doors?.public),
    },
  };
  return cachedDoorContract;
}

export function isLocalOrigin(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return false;
  return ["localhost", "127.0.0.1", "::1"].includes(
    (parsed.hostname || "").trim().toLowerCase(),
  );
}

function explicitDoorName(env = process.env) {
  const selected = trimString(env.CHATTY_VVAULT_DOOR || env.RUNTIME_DOOR);
  if (!selected) return null;
  if (selected === "private" || selected === "public") return selected;
  return "invalid";
}

export function resolveDoorName(env = process.env) {
  const explicit = explicitDoorName(env);
  if (explicit && explicit !== "invalid") return explicit;
  return env.NODE_ENV === "production" ? "public" : "private";
}

export function resolveDoorContract(env = process.env) {
  const manifest = readDoorContract();
  const selectedDoor = resolveDoorName(env);
  const problems = [];

  if (explicitDoorName(env) === "invalid") {
    problems.push("door_unknown");
  }

  const door = manifest.doors[selectedDoor];
  if (!door) {
    problems.push("door_unknown");
  }

  const normalizedDoor = door || {
    name: selectedDoor,
    chattyPublicOrigin: null,
    chattyApiOrigin: null,
    vvaultOrigin: null,
    authApiOrigin: null,
    authPublicOrigin: null,
    authCookieName: "auth_sid",
    sessionBridgePath: "/api/vault/session-bridge",
    allowedBrowserOrigins: [],
    allowLegacyExchange: false,
  };

  if (!normalizedDoor.chattyPublicOrigin) problems.push("public_origin_missing");
  if (!normalizedDoor.chattyApiOrigin) problems.push("chatty_api_origin_missing");
  if (!normalizedDoor.vvaultOrigin) problems.push("vvault_origin_missing");
  if (!normalizedDoor.authApiOrigin) problems.push("auth_origin_missing");
  if (!normalizedDoor.allowedBrowserOrigins.length) {
    problems.push("allowed_browser_origins_missing");
  }

  const localDoor = selectedDoor === "private";
  const publicDoor = selectedDoor === "public";
  const doorOrigins = [
    normalizedDoor.chattyPublicOrigin,
    normalizedDoor.chattyApiOrigin,
    normalizedDoor.vvaultOrigin,
    normalizedDoor.authApiOrigin,
    normalizedDoor.authPublicOrigin,
    ...normalizedDoor.allowedBrowserOrigins,
  ].filter(Boolean);

  if (publicDoor && doorOrigins.some((origin) => isLocalOrigin(origin))) {
    problems.push("door_public_with_localhost_target");
  }
  if (localDoor && doorOrigins.some((origin) => !isLocalOrigin(origin))) {
    problems.push("door_private_with_production_target");
  }

  return {
    version: manifest.version,
    path: manifest.path,
    selectedDoor,
    ...normalizedDoor,
    problems: Array.from(new Set(problems)),
  };
}
