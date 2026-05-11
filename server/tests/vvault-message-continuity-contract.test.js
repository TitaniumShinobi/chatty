import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRoute() {
  return fs.readFileSync(path.join(repoRoot, 'server/routes/vvault.js'), 'utf8');
}

function readRuntimeTurnState() {
  return fs.readFileSync(path.join(repoRoot, 'server/lib/runtimeTurnState.js'), 'utf8');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} was not found`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('/api/vvault/message continuity contract', () => {
  it('does not let skipPersistence bypass canonical transcript truth', () => {
    const source = readRoute();
    const helper = extractFunction(source, 'shouldRequireCanonicalTranscriptTruth');

    assert.doesNotMatch(helper, /skipPersistence\s*===\s*true/);
    assert.match(helper, /continueTurn === true/);
    assert.match(helper, /exactCanonicalThreadTargeted/);
  });

  it('blocks reset-shaped continuation drafts before canonical persistence', () => {
    const source = readRoute();

    assert.match(source, /function detectContinuityResetDraft/);
    assert.match(source, /CONTINUITY_RESET_DRAFT_BLOCKED/);
    assert.match(source, /stage:\s*'assistant_prewrite'/);
  });

  it('does not accept local fallback metadata as the required transcript truth source', () => {
    const source = readRoute();

    assert.match(source, /persistedStateSource === 'local_fallback_metadata'/);
    assert.match(source, /routeTurnEnvelope\.runtimeTurnState = null/);
    assert.match(source, /allowLocalFallback:\s*false/);
  });

  it('rejects continuation when the continuity sequence drifted', () => {
    const source = readRuntimeTurnState();
    const validator = extractFunction(source, 'validateRuntimeResumeRequest');

    assert.match(validator, /failureReason = 'continuity_seq_mismatch'/);
    assert.match(validator, /resumeFromContinuitySeq !== normalizedState\.continuitySeq/);
  });
});
