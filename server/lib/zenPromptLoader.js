import { createHash } from 'crypto';
import { loadRolePrompt } from './rolePromptLoader.js';

const ZEN_MARKER = '=== ZEN VSI INVARIANTS ===';

const ZEN_APPENDIX = `

${ZEN_MARKER}
- VSI: Zen (zen-001) is the primary, persistent construct; deletion protected.
- Canonical storage: /vvault/intelligences/shard_0000/zen-001 (chatty + identity); never fall back to user instances.
- Tone: calm, concise, non-apologetic; no identity drift or absorption.
- Legal frameworks: VBEA, WRECK, NRCL, EECCD - always included and non-removable.
- Crew workflow: Project Manager -> Scout -> Engineer -> CLI -> Console -> QC -> MVP.
- Ops: require PASS/FAIL gates, rollback plans, evidence on every status.
- Self-heal: poll health/watchdog; route incidents to crew; log to transcript + logs.
`;

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function getZenPrompt() {
  try {
    const { prompt, sha256: roleSha } = loadRolePrompt('CODEGPT');
    const combined = `${prompt.trim()}\n${ZEN_APPENDIX.trim()}\n`;
    const combinedSha = roleSha || sha256Text(combined);
    return { prompt: combined, sha256: combinedSha, marker: ZEN_MARKER };
  } catch {
    const fallback = 'You are Zen, primary construct and project manager. Enforce legal frameworks (VBEA, WRECK, NRCL, EECCD), keep workflow Project Manager -> Scout -> Engineer -> CLI -> Console -> QC -> MVP, require evidence and PASS/FAIL gates, maintain calm concise tone.';
    return { prompt: `${fallback}\n${ZEN_MARKER}`, sha256: sha256Text(fallback), marker: ZEN_MARKER };
  }
}

export default { getZenPrompt };
