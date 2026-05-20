import { resolveRuntimeHandshakeConfig } from "./runtimeHandshakeConfig.js";

export function getVvaultTargets() {
  return resolveRuntimeHandshakeConfig(process.env).vvaultTargets;
}

export function getVvaultServiceTokens() {
  const tokens = new Set();
  for (const t of getVvaultTargets()) {
    if (t.token) tokens.add(t.token);
  }
  return Array.from(tokens);
}

export function describeVvaultTargets(targets) {
  const names = targets.map((t) => t.name).join(",");
  const present = targets.length > 0;
  const hasAnyToken = targets.some((t) => Boolean(t.token));
  return `[VVAULT TARGETS] present=${present} count=${targets.length} names=${names || "none"} hasAnyToken=${hasAnyToken}`;
}

/**
 * Backward-compatible single-target config view.
 * This intentionally returns the first configured target as "primary".
 * Multi-target callers should use getVvaultTargets().
 */
export function getVvaultBridgeConfig() {
  const handshake = resolveRuntimeHandshakeConfig(process.env);
  const targets = handshake.vvaultTargets;
  const primary = targets[0] || { name: null, origin: "", token: null };
  const vvaultOrigin = handshake.vvaultOrigin || "";
  const vvaultApiBaseUrl = handshake.vvaultApiBaseUrl || "";
  const serviceToken = primary.token || null;

  return {
    vvaultOrigin,
    vvaultApiBaseUrl,
    serviceToken,
    configured: targets.length > 0,
    missingVvaultUrl: targets.length === 0,
    // Informational only: tokens can be omitted in VVAULT dev-open mode.
    missingServiceToken: getVvaultServiceTokens().length === 0,
    problems: handshake.problems,
    environment: handshake.environment,
  };
}

export function describeVvaultBridgeConfig(config) {
  if (config.configured) {
    return `[VVAULT BRIDGE] configured=true environment=${config.environment} origin=${config.vvaultOrigin}`;
  }
  return `[VVAULT BRIDGE] configured=false environment=${config.environment} missing=VVAULT_URL problems=${(config.problems || []).join(",") || "none"}`;
}
