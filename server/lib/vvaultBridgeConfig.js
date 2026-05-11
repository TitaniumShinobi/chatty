function normalizeOrigin(value) {
  return (value || "").trim().replace(/\/$/, "");
}

/**
 * Parse VVAULT targets from env.
 *
 * Format:
 *   VVAULT_TARGETS=NAME|ORIGIN|TOKEN,NAME|ORIGIN|TOKEN,...
 *
 * Backward-compat:
 * - If VVAULT_TARGETS is unset, we fall back to VVAULT_URL (+ VVAULT_SERVICE_TOKEN).
 * - Token may be empty to support VVAULT dev-open mode.
 */
export function getVvaultTargets() {
  const rawTargets = String(process.env.VVAULT_TARGETS || "").trim();
  if (rawTargets) {
    const targets = [];
    for (const rawPart of rawTargets.split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      const [nameRaw, originRaw, tokenRaw] = part.split("|");
      const name = (nameRaw || "").trim();
      const origin = normalizeOrigin(originRaw);
      const token = (tokenRaw || "").trim() || null;
      if (!name || !origin) continue;
      targets.push({ name, origin, token });
    }
    return targets;
  }

  const legacyOrigin = normalizeOrigin(process.env.VVAULT_URL || process.env.VVAULT_BASE_URL);
  if (!legacyOrigin) return [];
  const legacyToken = String(process.env.VVAULT_SERVICE_TOKEN || "").trim() || null;
  return [{ name: "legacy", origin: legacyOrigin, token: legacyToken }];
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
  const targets = getVvaultTargets();
  const primary = targets[0] || { name: null, origin: "", token: null };
  const vvaultOrigin = normalizeOrigin(primary.origin);
  const vvaultApiBaseUrl = normalizeOrigin(process.env.VVAULT_API_BASE_URL || vvaultOrigin);
  const serviceToken = primary.token || null;

  return {
    vvaultOrigin,
    vvaultApiBaseUrl,
    serviceToken,
    configured: targets.length > 0,
    missingVvaultUrl: targets.length === 0,
    // Informational only: tokens can be omitted in VVAULT dev-open mode.
    missingServiceToken: getVvaultServiceTokens().length === 0,
  };
}

export function describeVvaultBridgeConfig(config) {
  if (config.configured) {
    return `[VVAULT BRIDGE] configured=true origin=${config.vvaultOrigin}`;
  }
  return `[VVAULT BRIDGE] configured=false missing=VVAULT_URL`;
}
