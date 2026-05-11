import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAIQueryUserIds } from '../lib/aiUserAliases.js';
import { __test__ as aisRouteTest } from '../routes/ais.js';

test('buildAIQueryUserIds includes same-email legacy LIFE ids from registry', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatty-ai-user-alias-'));
  const registryPath = path.join(tmpDir, 'users.json');
  fs.writeFileSync(
    registryPath,
    JSON.stringify({
      users: {
        devon_old: { user_id: 'devon_old', email: 'dwoodson92@gmail.com' },
        devon_new: { user_id: 'devon_new', email: 'dwoodson92@gmail.com' },
        other_user: { user_id: 'other_user', email: 'other@example.com' },
      },
    }),
    'utf8',
  );

  const previous = process.env.AI_AVATAR_USER_REGISTRY_PATH;
  process.env.AI_AVATAR_USER_REGISTRY_PATH = registryPath;
  try {
    const ids = buildAIQueryUserIds({
      userId: 'devon_new',
      originalUserId: 'chatty-sub-123',
      email: 'dwoodson92@gmail.com',
    });
    assert.deepEqual(
      new Set(ids),
      new Set(['devon_old', 'devon_new', 'chatty-sub-123', 'dwoodson92@gmail.com']),
    );
  } finally {
    if (previous === undefined) {
      delete process.env.AI_AVATAR_USER_REGISTRY_PATH;
    } else {
      process.env.AI_AVATAR_USER_REGISTRY_PATH = previous;
    }
  }
});

test('buildSummaryAvatarUrl canonicalizes construct data-image avatars to the avatar route', () => {
  const url = aisRouteTest.buildSummaryAvatarUrl({
    id: 'ai-123',
    constructCallsign: 'sera-001',
    rawAvatar: 'data:image/jpeg;base64,AAAA',
  });
  assert.equal(url, '/api/ais/sera-001/avatar');
});

test('getAIDLookupCandidates keeps the raw GPT id and the normalized callsign', () => {
  const candidates = aisRouteTest.getAIDLookupCandidates('gpt-zen-001-devon_wo');
  assert.deepEqual(candidates, ['gpt-zen-001-devon_wo', 'zen-001']);
});

test('getAIAvatarLookup stays alias-aware for legacy LIFE-owned avatars', () => {
  const source = fs.readFileSync(
    new URL('../lib/aiManager.js', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /async getAIAvatarLookup[\s\S]*const ownerCandidateIds = buildOwnerCandidateIds\(\{\s*userId,\s*chattyUserId,\s*email,/,
  );
  assert.match(
    source,
    /getRawAIRowByCallsign\(callsign, ownerSearchId, \{\s*chattyUserId,\s*email,/,
  );
});

test('legacy avatar fallback resolves vvault from the repo location, not process cwd', () => {
  const source = fs.readFileSync(
    new URL('../routes/ais.js', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /const LEGACY_VVAULT_ROOT_FALLBACK = path\.resolve\(ROUTES_DIR, '\.\.\/\.\.\/\.\.\/vvault'\);/,
  );
  assert.match(
    source,
    /vvaultRoot = path\.resolve\(expandHomeDir\(vvaultRoot\)\);/,
  );
  assert.match(
    source,
    /const prefersCanonicalLocalAvatar =\s*!!rawAvatarPath && rawAvatarPath\.startsWith\('instances\/'\);[\s\S]*await sendLegacyAvatarLookup\(res, lookupForAvatar\)/,
  );
});
