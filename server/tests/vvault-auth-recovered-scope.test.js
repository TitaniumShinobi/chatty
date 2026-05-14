import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('VVAULT auth recovery receipt scope', () => {
  it('derives auth recovery logging from the normalized auth receipt before inference logs emit', () => {
    const routeSource = readRepoFile('server/routes/vvault.js');
    const authRecoveredDefinition = routeSource.indexOf('const authRecovered = Boolean(authReceipt?.dev_auth_fallback);');
    const firstAuthRecoveredLog = routeSource.indexOf('auth_recovered: authRecovered');

    assert.notEqual(authRecoveredDefinition, -1, 'authRecovered must be defined from the auth receipt');
    assert.notEqual(firstAuthRecoveredLog, -1, 'auth recovery log field was not found');
    assert.ok(
      authRecoveredDefinition < firstAuthRecoveredLog,
      'authRecovered must be defined before handleConstructInference logs use it',
    );
  });
});
