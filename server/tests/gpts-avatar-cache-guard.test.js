import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('GPTsPage refetches API avatars when retry nonce changes', () => {
  const source = fs.readFileSync(
    new URL('../../src/pages/GPTsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /const fetchUrl = addRetryToken\(avatarUrl, avatarRetryNonce\);[\s\S]*fetch\(fetchUrl,\s*\{[\s\S]*cache:\s*"no-store"/,
  );
  assert.match(
    source,
    /\}, \[ais, avatarRetryNonce, markAvatarFailed\]\);/,
  );
});
