import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIN_MODEL_DEFAULTS } from '../lib/linModelDefaults.js';
import {
  LIN_THREE_I_CANON_VERSION,
  LIN_THREE_I_SEATS,
  canonicalizeLinSeatName,
  getLinSeatCanon,
} from '../lib/linSeatCanon.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Lin Three I seat canon', () => {
  it('canonicalizes legacy keys without creating a fourth continuity seat', () => {
    assert.equal(LIN_THREE_I_CANON_VERSION, 'lin-three-i-2026-04-19');
    assert.equal(canonicalizeLinSeatName('coding'), 'intelligence');
    assert.equal(canonicalizeLinSeatName('linear'), 'intelligence');
    assert.equal(canonicalizeLinSeatName('creative'), 'ingenuity');
    assert.equal(canonicalizeLinSeatName('smalltalk'), 'interaction');
    assert.equal(canonicalizeLinSeatName('conversation'), 'interaction');
    assert.deepEqual(Object.keys(LIN_THREE_I_SEATS), ['intelligence', 'ingenuity', 'interaction']);
  });

  it('binds continuity and coding to Qwen-backed Intelligence', () => {
    const intelligence = getLinSeatCanon('coding');
    assert.equal(intelligence.displayName, 'Intelligence');
    assert.equal(intelligence.model, 'ollama:qwen3-coder:30b');
    assert.equal(intelligence.upgradeTargetModel, 'ollama:qwen3-coder:30b');
    assert.equal(intelligence.fallbackModel, 'ollama:qwen3-coder:30b');
    assert.ok(intelligence.responsibilities.includes('coding'));
    assert.ok(intelligence.responsibilities.includes('continuity'));
    assert.ok(intelligence.responsibilities.includes('evidence'));
    assert.equal(LIN_MODEL_DEFAULTS.coding, LIN_MODEL_DEFAULTS.intelligence);
    assert.equal(LIN_MODEL_DEFAULTS.intelligence, intelligence.model);
  });

  it('has a findable developer doc with the decision and source anchors', () => {
    const doc = readRepoFile('docs/standards/lin-three-i-seat-canon.md');
    assert.match(doc, /Lin does not need a fourth continuity seat right now/);
    assert.match(doc, /Intelligence/);
    assert.match(doc, /Ingenuity/);
    assert.match(doc, /Interaction/);
    assert.match(doc, /Qwen3-Coder/i);
    assert.match(doc, /Coding is one subdomain of Intelligence/);
    assert.match(doc, /active local Intelligence model is `ollama:qwen3-coder:30b`/);
    assert.match(doc, /server\/lib\/linSeatCanon\.js/);
    assert.match(doc, /lin-seat-cross-repo-reconciliation\.md/);
  });

  it('has a cross-repo reconciliation map for older seat documents', () => {
    const doc = readRepoFile('docs/standards/lin-seat-cross-repo-reconciliation.md');
    assert.match(doc, /There is no fourth continuity seat/);
    assert.match(doc, /Qwen3-Coder is the active local Intelligence model/);
    assert.match(doc, /DeepSeek.*not the Lin Intelligence default or fallback/);
    assert.match(doc, /CODEX_PROMPT_LEGAL_AND_ORCHESTRATION\.md/);
    assert.match(doc, /Pasted-Transcript-seat-continuity/);
    assert.match(doc, /Do not edit external repos/);
  });
});
