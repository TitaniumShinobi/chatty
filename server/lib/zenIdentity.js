/**
 * Zen identity normalization for Sim build and related APIs.
 * Only zen / zen-001 are allowed for the Zen Sim build lane; all normalize to zen-001.
 */

const ALLOWED_ZEN_ALIASES = new Set(['zen', 'zen-001']);
const NORMALIZED_CALLSIGN = 'zen-001';

/**
 * Normalize Zen callsign for backend execution and persisted job metadata.
 * @param {string} [input] - Raw callsign (for example "zen" or "zen-001")
 * @returns {{ ok: true, normalizedCallsign: string } | { ok: false, error: string }}
 */
function normalizeZenCallsign(input) {
  if (input == null || typeof input !== 'string') {
    return { ok: false, error: 'callsign is required' };
  }

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, error: 'callsign is required' };
  }

  if (!ALLOWED_ZEN_ALIASES.has(trimmed)) {
    return {
      ok: false,
      error: `invalid callsign: only zen or zen-001 allowed, got: ${input}`,
    };
  }

  return { ok: true, normalizedCallsign: NORMALIZED_CALLSIGN };
}

export { normalizeZenCallsign, NORMALIZED_CALLSIGN, ALLOWED_ZEN_ALIASES };
