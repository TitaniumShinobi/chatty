import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('VVAULT persistence handling', () => {
  it('passes the role and write outcome into buildPersistenceRoleResult', () => {
    const source = readRepoFile('server/lib/vvaultPersistenceHandling.js');

    assert.match(source, /const outcome = await performTranscriptWriteWithRecovery\(params,/);
    assert.match(source, /buildPersistenceRoleResult\(role, outcome\)/);
    assert.doesNotMatch(source, /buildPersistenceRoleResult\(\{\s*role,/);
  });
});
