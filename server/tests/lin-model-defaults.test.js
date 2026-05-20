import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIN_MODEL_DEFAULTS as SERVER_LIN_MODEL_DEFAULTS } from '../lib/linModelDefaults.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('shared Lin model defaults', () => {
  it('keeps server defaults loaded from the shared JSON source of truth', () => {
    const sharedDefaults = JSON.parse(readRepoFile('config/linModelDefaults.json'));

    assert.equal(SERVER_LIN_MODEL_DEFAULTS.conversation, sharedDefaults.conversation);
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.smalltalk, sharedDefaults.smalltalk);
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.creative, sharedDefaults.creative);
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.coding, sharedDefaults.intelligence);
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.intelligence, sharedDefaults.intelligence);
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.codingFallback, sharedDefaults.codingFallback);
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.conversation, 'ollama:phi4-mini:latest');
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.smalltalk, 'ollama:phi4-mini:latest');
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.creative, 'ollama:mistral-small3.2:24b');
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.coding, 'ollama:qwen3-coder:30b');
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.intelligence, 'ollama:qwen3-coder:30b');
    assert.equal(SERVER_LIN_MODEL_DEFAULTS.codingFallback, 'ollama:qwen3-coder:30b');
  });

  it('keeps the client wrapper importing the same shared JSON instead of duplicating defaults', () => {
    const clientWrapper = readRepoFile('src/config/linModelDefaults.ts');
    const modelProviders = readRepoFile('src/lib/modelProviders.ts');

    assert.match(clientWrapper, /from ["']\.\.\/\.\.\/config\/linModelDefaults\.json["']/);
    assert.doesNotMatch(clientWrapper, /conversation:\s*["']openrouter:/);
    assert.doesNotMatch(clientWrapper, /creative:\s*["']openrouter:/);
    assert.doesNotMatch(clientWrapper, /coding:\s*["']openrouter:/);
    assert.match(modelProviders, /LIN_CONVERSATION_MODEL = LIN_MODEL_DEFAULTS\.conversation/);
    assert.match(modelProviders, /LIN_DEFAULT_MODELS = \{/);
  });

  it('keeps runtime consumers on the shared defaults instead of stale private triads', () => {
    const consumerFiles = [
      'src/engine/optimizedZen.ts',
      'src/engine/orchestration/TriadGate.ts',
      'src/engine/orchestration/UnifiedLinOrchestrator.ts',
      'src/engine/seatRunner.ts',
      'src/engine/enhancedSeatRunner.ts',
      'src/engine/transcript/DeepTranscriptParser.ts',
      'src/engine/character/DriftPrevention.ts',
      'src/engine/character/PersonaDetectionEngine.ts',
      'src/engine/orchestration/PersonalityOrchestrator.ts',
      'src/lib/orchestration/triad_sanity_check.ts',
      'server/routes/conversations.js',
      'server/lib/fullSeatSynthesis.js',
    ];

    for (const file of consumerFiles) {
      const source = readRepoFile(file);
      assert.doesNotMatch(source, /qwen2\.5-coder:latest/);
      assert.doesNotMatch(source, /phi3:latest/);
      assert.doesNotMatch(source, /mistral:latest|mistral:instruct/);
    }
  });

  it('keeps browser-visible models.json aligned with shared Lin defaults', () => {
    const rootModels = JSON.parse(readRepoFile('models.json'));
    const publicModels = JSON.parse(readRepoFile('public/models.json'));

    assert.equal(rootModels.smalltalk.tag, SERVER_LIN_MODEL_DEFAULTS.smalltalk);
    assert.equal(rootModels.creative.tag, SERVER_LIN_MODEL_DEFAULTS.creative);
    assert.equal(rootModels.coding.tag, SERVER_LIN_MODEL_DEFAULTS.coding);
    assert.match(rootModels.coding.role, /Intelligence seat/i);
    assert.deepEqual(publicModels, rootModels);
  });
});
