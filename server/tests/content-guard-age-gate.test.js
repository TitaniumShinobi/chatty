import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('content guard age gate', () => {
  it('does not age-gate ordinary conversation solely because roleplay is enabled', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'server/lib/contentGuard.js'), 'utf8');

    assert.match(source, /const intimateRequest = containsIntimateContent\(userMessage\)/);
    assert.match(source, /if \(isRoleplayConstruct && intimateRequest\)/);
    assert.doesNotMatch(source, /if \(isRoleplayConstruct\)\s*\{\s*const stepUpNeeded/);
  });
});
