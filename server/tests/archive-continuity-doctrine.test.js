import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('archive continuity doctrine', () => {
  it('classifies docs/archive as continuity evidence instead of discardable legacy notes', () => {
    const archiveReadme = readRepoFile('docs/archive/README.md');
    const doctrine = readRepoFile('docs/standards/archive-continuity-evidence.md');

    assert.match(archiveReadme, /archive-backed continuity evidence/i);
    assert.match(archiveReadme, /reconcile them/i);
    assert.doesNotMatch(archiveReadme, /Archived docs are historical context, not canonical truth/);

    assert.match(doctrine, /Devon's current direct corrections/i);
    assert.match(doctrine, /Transcript-backed and archive-backed coherent design history/i);
    assert.match(doctrine, /Live runtime receipts and code paths/i);
  });

  it('requires agents to label archive/runtime conflicts instead of dismissing them', () => {
    const doctrine = readRepoFile('docs/standards/archive-continuity-evidence.md');
    const checklist = readRepoFile('docs/standards/orchestration-runtime-checklist.md');
    const promptHeader = readRepoFile('docs/prompts/agent-archive-continuity-header.md');

    for (const label of [
      'implementation drift',
      'documentation compression',
      'unwired design intent',
      'superseded with evidence',
      'needs Devon reconciliation',
    ]) {
      assert.match(doctrine, new RegExp(label, 'i'));
      assert.match(checklist, new RegExp(label, 'i'));
      assert.match(promptHeader, new RegExp(label, 'i'));
    }
  });

  it('adds the archive audit to the runtime checklist and reusable prompt header', () => {
    const standardsReadme = readRepoFile('docs/standards/README.md');
    const promptsReadme = readRepoFile('docs/prompts/README.md');
    const checklist = readRepoFile('docs/standards/orchestration-runtime-checklist.md');

    assert.match(standardsReadme, /archive-continuity-evidence\.md/);
    assert.match(promptsReadme, /agent-archive-continuity-header\.md/);
    assert.match(checklist, /Archive Continuity Audit/);
    assert.match(checklist, /avoid asking Devon to re-explain/i);
  });
});
