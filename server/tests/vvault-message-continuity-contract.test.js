import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRoute() {
  return fs.readFileSync(path.join(repoRoot, 'server/routes/vvault.js'), 'utf8');
}

function readPersistenceHandling() {
  return fs.readFileSync(
    path.join(repoRoot, 'server/lib/vvaultPersistenceHandling.js'),
    'utf8',
  );
}

function readMemoryLoad() {
  return fs.readFileSync(
    path.join(repoRoot, 'server/lib/vvaultMemoryLoad.js'),
    'utf8',
  );
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
    const source = readPersistenceHandling();

    assert.match(source, /detectContinuityResetDraft/);
    assert.match(source, /CONTINUITY_RESET_DRAFT_BLOCKED/);
    assert.match(source, /stage:\s*'assistant_prewrite'/);
  });

  it('blocks canonical post-write readback mismatch before reporting success', () => {
    const source = readPersistenceHandling();
    const readbackStart = source.indexOf('if (vvaultBodyPersistenceRequired)');
    const successStart = source.indexOf("runtimeReceipt.persistence_owner = 'vvault_body'");
    const readbackBlock = source.slice(readbackStart, successStart);

    assert.notEqual(readbackStart, -1, 'canonical readback gate was not found');
    assert.notEqual(successStart, -1, 'canonical persistence success marker was not found');
    assert.ok(readbackStart < successStart, 'readback gate must run before success is marked');
    assert.match(source, /requiresVvaultBodyPersistence\(\{\s*effectiveSession,\s*constructId,\s*canonicalTurnMetadata,\s*normalizedRequestedTranscriptPath,\s*\}\)/);
    assert.match(source, /buildPersistenceRoleResult\(role,\s*outcome\)/);
    assert.match(readbackBlock, /const canonicalReadbackRows = await readConversations\(/);
    assert.match(readbackBlock, /allowLocalFallback:\s*false/);
    assert.match(readbackBlock, /stripChattyMetadataComment\(readbackAssistantTail\.content\) !== String\(aiResponse \|\| ''\)\.trimEnd\(\)/);
    assert.match(readbackBlock, /code:\s*'TRANSCRIPT_READBACK_MISMATCH'/);
    assert.match(readbackBlock, /return \{ handled:\s*true \}/);
  });

  it('does not accept local fallback metadata as the required transcript truth source', () => {
    const source = readMemoryLoad();

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
