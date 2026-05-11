import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import aisRouter, { __test__ as aisRouteTest } from '../routes/ais.js';
import { AIManager } from '../lib/aiManager.js';

const aiManager = AIManager.getInstance();
const testSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const TEST_OWNER = `avatar-test-owner-${testSuffix}`;
const TEST_ID = `ai-avatar-${testSuffix}`;
const TEST_CALLSIGN = `avatar-hardening-${testSuffix}-001`;
const TEST_AVATAR = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#10B981"/></svg>').toString('base64')}`;
const LEGACY_OWNER = `avatar-legacy-owner-${testSuffix}`;
const CURRENT_OWNER = `avatar-current-owner-${testSuffix}`;
const LEGACY_EMAIL = `avatar-alias-${testSuffix}@example.com`;
const LEGACY_ID = `ai-avatar-legacy-${testSuffix}`;
const LEGACY_CALLSIGN = `avatar-legacy-${testSuffix}-001`;
const LEGACY_REGISTRY_PATH = path.join(os.tmpdir(), `chatty-avatar-registry-${testSuffix}.json`);
const LOCAL_FILE_ID = `ai-avatar-local-file-${testSuffix}`;
const LOCAL_FILE_CALLSIGN = `avatar-local-file-${testSuffix}-001`;
const LOCAL_FILE_RELATIVE_PATH = `instances/${LOCAL_FILE_CALLSIGN}/identity/avatar.png`;
const SERA_ALIAS_CALLSIGN = 'sera-001';
const SERA_ALIAS_RELATIVE_PATH = `instances/${SERA_ALIAS_CALLSIGN}/identity/avatar.png`;
const WEBP_ALIAS_CALLSIGN = `avatar-webp-alias-${Math.random().toString(16).slice(2, 8)}-001`;
const WEBP_ALIAS_RELATIVE_PATH = `instances/${WEBP_ALIAS_CALLSIGN}/identity/avatar.webp`;
const MIRROR_ONLY_ID = `ai-avatar-mirror-only-${testSuffix}`;
const MIRROR_ONLY_CALLSIGN = `avatarmirror${Date.now()}-001`;
const MIRROR_ONLY_RELATIVE_PATH = `instances/${MIRROR_ONLY_CALLSIGN}/identity/avatar.png`;
const STALE_SYSTEM_CALLSIGN = `staleavatar${Date.now()}-001`;
const LOCAL_FILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW0cAAAAASUVORK5CYII=',
  'base64',
);
const LOCAL_FILE_WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/vuUAAA=',
  'base64',
);

let originalGetAI;
let originalGetAllAIsSummary;
let originalRegistryPath;
let originalVvaultRootPath;
let localVvaultRoot;
let getAICallCount = 0;

function createApp() {
  const app = express();
  app.use((req, _res, next) => {
    const headerUser = req.headers['x-test-user'];
    const headerEmail = req.headers['x-test-email'];
    const userId = typeof headerUser === 'string' && headerUser.trim() ? headerUser.trim() : TEST_OWNER;
    const email = typeof headerEmail === 'string' && headerEmail.trim() ? headerEmail.trim() : `${userId}@example.com`;
    req.user = {
      id: userId,
      email,
    };
    next();
  });
  app.use('/api/ais', aisRouter);
  return app;
}

async function withServer(run) {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function fetchAvatar(baseUrl, idOrCallsign, userId = TEST_OWNER, email = null) {
  const headers = { 'x-test-user': userId };
  if (email) headers['x-test-email'] = email;
  const response = await fetch(`${baseUrl}/api/ais/${encodeURIComponent(idOrCallsign)}/avatar`, {
    headers,
  });
  const body = Buffer.from(await response.arrayBuffer());
  return { response, body };
}

before(() => {
  originalRegistryPath = process.env.AI_AVATAR_USER_REGISTRY_PATH;
  originalVvaultRootPath = process.env.VVAULT_ROOT_PATH;
  process.env.AI_AVATAR_USER_REGISTRY_PATH = LEGACY_REGISTRY_PATH;
  fs.writeFileSync(
    LEGACY_REGISTRY_PATH,
    JSON.stringify({
      users: {
        [LEGACY_OWNER]: { user_id: LEGACY_OWNER, email: LEGACY_EMAIL },
        [CURRENT_OWNER]: { user_id: CURRENT_OWNER, email: LEGACY_EMAIL },
      },
    }),
    'utf8'
  );

  const insertStmt = aiManager.db.prepare(`
    INSERT INTO ais (
      id, name, description, instructions, conversation_starters, avatar, capabilities,
      construct_callsign, model_id, is_active, privacy, created_at, updated_at, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    TEST_ID,
    'Avatar Hardening Test AI',
    'Test AI for avatar route hardening',
    '',
    '[]',
    TEST_AVATAR,
    '{}',
    TEST_CALLSIGN,
    'openai:gpt-4o-mini',
    1,
    'private',
    new Date().toISOString(),
    new Date().toISOString(),
    TEST_OWNER
  );

  insertStmt.run(
    LEGACY_ID,
    'Legacy Avatar Test AI',
    'Test AI for same-email legacy avatar recovery',
    '',
    '[]',
    TEST_AVATAR,
    '{}',
    LEGACY_CALLSIGN,
    'openai:gpt-4o-mini',
    1,
    'private',
    new Date().toISOString(),
    new Date().toISOString(),
    LEGACY_OWNER
  );

  localVvaultRoot = fs.mkdtempSync(path.join(os.homedir(), `.chatty-avatar-vvault-${testSuffix}-`));
  process.env.VVAULT_ROOT_PATH = `~/${path.relative(os.homedir(), localVvaultRoot)}`;
  const localAvatarPath = path.join(
    localVvaultRoot,
    'users',
    'shard_0000',
    LEGACY_OWNER,
    LOCAL_FILE_RELATIVE_PATH,
  );
  fs.mkdirSync(path.dirname(localAvatarPath), { recursive: true });
  fs.writeFileSync(localAvatarPath, LOCAL_FILE_PNG);
  const seraAliasAvatarPath = path.join(
    localVvaultRoot,
    'users',
    'shard_0000',
    LEGACY_OWNER,
    SERA_ALIAS_RELATIVE_PATH,
  );
  fs.mkdirSync(path.dirname(seraAliasAvatarPath), { recursive: true });
  fs.writeFileSync(seraAliasAvatarPath, LOCAL_FILE_PNG);
  const webpAliasAvatarPath = path.join(
    localVvaultRoot,
    'users',
    'shard_0000',
    LEGACY_OWNER,
    WEBP_ALIAS_RELATIVE_PATH,
  );
  fs.mkdirSync(path.dirname(webpAliasAvatarPath), { recursive: true });
  fs.writeFileSync(webpAliasAvatarPath, LOCAL_FILE_WEBP);
  const mirrorOnlyAvatarPath = path.join(
    localVvaultRoot,
    'users',
    'shard_0000',
    LEGACY_OWNER,
    MIRROR_ONLY_RELATIVE_PATH,
  );
  fs.mkdirSync(path.dirname(mirrorOnlyAvatarPath), { recursive: true });
  fs.writeFileSync(mirrorOnlyAvatarPath, LOCAL_FILE_PNG);

  insertStmt.run(
    LOCAL_FILE_ID,
    'Local File Avatar Test AI',
    'Test AI for canonical local avatar fallback',
    '',
    '[]',
    LOCAL_FILE_RELATIVE_PATH,
    '{}',
    LOCAL_FILE_CALLSIGN,
    'openai:gpt-4o-mini',
    1,
    'private',
    new Date().toISOString(),
    new Date().toISOString(),
    LEGACY_OWNER,
  );

  insertStmt.run(
    MIRROR_ONLY_ID,
    'Mirror Only Avatar Test AI',
    'Test AI for materialized VVAULT identity mirror avatar fallback',
    '',
    '[]',
    null,
    '{}',
    MIRROR_ONLY_CALLSIGN,
    'openai:gpt-4o-mini',
    1,
    'private',
    new Date().toISOString(),
    new Date().toISOString(),
    LEGACY_OWNER,
  );

  insertStmt.run(
    STALE_SYSTEM_CALLSIGN,
    'Stale System Avatar Test AI',
    'Stale local rows with construct ids must not block canonical avatar fallback',
    '',
    '[]',
    null,
    '{}',
    STALE_SYSTEM_CALLSIGN,
    'openai:gpt-4o-mini',
    1,
    'private',
    new Date().toISOString(),
    new Date().toISOString(),
    'system',
  );

  originalGetAI = aiManager.getAI.bind(aiManager);
  aiManager.getAI = async (...args) => {
    getAICallCount += 1;
    return originalGetAI(...args);
  };
  originalGetAllAIsSummary = aiManager.getAllAIsSummary.bind(aiManager);
});

after(() => {
  try {
    aiManager.db.prepare('DELETE FROM ais WHERE id = ?').run(TEST_ID);
    aiManager.db.prepare('DELETE FROM ais WHERE id = ?').run(LEGACY_ID);
    aiManager.db.prepare('DELETE FROM ais WHERE id = ?').run(LOCAL_FILE_ID);
    aiManager.db.prepare('DELETE FROM ais WHERE id = ?').run(STALE_SYSTEM_CALLSIGN);
    aiManager.db.prepare('DELETE FROM gpts WHERE id = ?').run(TEST_ID);
    aiManager.db.prepare('DELETE FROM gpts WHERE id = ?').run(LEGACY_ID);
    aiManager.db.prepare('DELETE FROM gpts WHERE id = ?').run(LOCAL_FILE_ID);
    aiManager.db.prepare('DELETE FROM gpts WHERE id = ?').run(STALE_SYSTEM_CALLSIGN);
  } catch (error) {
    console.warn('[ais-avatar-route.test] Cleanup warning:', error.message);
  }
  if (originalGetAI) {
    aiManager.getAI = originalGetAI;
  }
  if (originalGetAllAIsSummary) {
    aiManager.getAllAIsSummary = originalGetAllAIsSummary;
  }
  if (originalRegistryPath === undefined) {
    delete process.env.AI_AVATAR_USER_REGISTRY_PATH;
  } else {
    process.env.AI_AVATAR_USER_REGISTRY_PATH = originalRegistryPath;
  }
  if (originalVvaultRootPath === undefined) {
    delete process.env.VVAULT_ROOT_PATH;
  } else {
    process.env.VVAULT_ROOT_PATH = originalVvaultRootPath;
  }
  try {
    fs.unlinkSync(LEGACY_REGISTRY_PATH);
  } catch {
    // Nothing to clean up.
  }
  if (localVvaultRoot) {
    fs.rmSync(localVvaultRoot, { recursive: true, force: true });
  }
});

describe('AIs avatar route hardening', () => {
  it('resolves avatar by AI id', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, TEST_ID);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.ok(body.length > 0);
    });
  });

  it('resolves avatar by construct callsign', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, TEST_CALLSIGN);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.ok(body.length > 0);
    });
  });

  it('resolves avatar by synthetic supabase callsign id', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, `supabase-${TEST_CALLSIGN}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.ok(body.length > 0);
    });
  });

  it('returns deterministic placeholder when avatar lookup misses', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, `missing-${testSuffix}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.match(response.headers.get('cache-control') || '', /no-store/i);
      assert.match(response.headers.get('vary') || '', /Cookie/i);
      assert.match(body.toString('utf8'), /<svg/i);
    });
  });

  it('returns 403 for unauthorized avatar access', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ais/${encodeURIComponent(TEST_ID)}/avatar`, {
        headers: { 'x-test-user': `unauthorized-${testSuffix}` },
      });
      const payload = await response.json();
      assert.equal(response.status, 403);
      assert.equal(payload.success, false);
    });
  });

  it('does not let a forbidden callsign row block shared avatar lookup', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, TEST_CALLSIGN, `unauthorized-${testSuffix}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.match(body.toString('utf8'), /<svg/i);
    });
  });

  it('does not let a stale local system row block canonical construct avatar lookup', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, STALE_SYSTEM_CALLSIGN, CURRENT_OWNER, LEGACY_EMAIL);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.match(body.toString('utf8'), /<svg/i);
    });
  });

  it('recovers same-email legacy avatar rows for the current user identity lane', async () => {
    await withServer(async (baseUrl) => {
      const { response: exactResponse, body: exactBody } = await fetchAvatar(
        baseUrl,
        LEGACY_ID,
        CURRENT_OWNER,
        LEGACY_EMAIL,
      );
      assert.equal(exactResponse.status, 200);
      assert.match(exactResponse.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.match(exactBody.toString('utf8'), /#10B981/);

      const { response, body } = await fetchAvatar(baseUrl, LEGACY_CALLSIGN, CURRENT_OWNER, LEGACY_EMAIL);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/i);
      assert.match(body.toString('utf8'), /#10B981/);
    });
  });

  it('serves canonical local avatar files from the vvault identity path', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, LOCAL_FILE_CALLSIGN, CURRENT_OWNER, LEGACY_EMAIL);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.match(response.headers.get('cache-control') || '', /no-store/i);
      assert.match(response.headers.get('vary') || '', /Cookie/i);
      assert.deepEqual(body, LOCAL_FILE_PNG);
    });
  });

  it('serves Sera canonical PNG through same-email VVAULT owner aliases', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, SERA_ALIAS_CALLSIGN, CURRENT_OWNER, LEGACY_EMAIL);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.deepEqual(body.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      assert.deepEqual(body, LOCAL_FILE_PNG);
    });
  });

  it('serves identity avatar.webp through same-email VVAULT owner aliases', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, WEBP_ALIAS_CALLSIGN, CURRENT_OWNER, LEGACY_EMAIL);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      assert.deepEqual(body, LOCAL_FILE_WEBP);
    });
  });

  it('serves materialized VVAULT identity mirror avatars before placeholder fallback', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await fetchAvatar(baseUrl, MIRROR_ONLY_CALLSIGN, LEGACY_OWNER, LEGACY_EMAIL);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.deepEqual(body, LOCAL_FILE_PNG);
    });
  });

  it('does not invoke full getAI hydration on summary/avatar hot paths', async () => {
    getAICallCount = 0;
    await withServer(async (baseUrl) => {
      const listResponse = await fetch(`${baseUrl}/api/ais`, {
        headers: { 'x-test-user': TEST_OWNER },
      });
      assert.equal(listResponse.status, 200);

      const avatarResponse = await fetch(`${baseUrl}/api/ais/${encodeURIComponent(TEST_ID)}/avatar`, {
        headers: { 'x-test-user': TEST_OWNER },
      });
      assert.equal(avatarResponse.status, 200);
    });
    assert.equal(getAICallCount, 0);
  });

  it('promotes VVAULT-backed summary avatars without full getAI hydration', async () => {
    const rows = await aisRouteTest.hydrateAISummaryAvatarsFromVVAULT(
      [
        {
          id: 'nova-001',
          constructCallsign: 'nova-001',
          name: 'Nova',
          avatar: null,
          avatarUrl: null,
        },
      ],
      {
        userId: TEST_OWNER,
        userEmail: `${TEST_OWNER}@example.com`,
        mergeFromVVAULTImpl: async (constructId) => ({
          hasAvatar: constructId === 'nova-001',
        }),
      },
    );

    assert.equal(rows[0].avatar, '/api/ais/nova-001/avatar');
    assert.equal(rows[0].avatarUrl, '/api/ais/nova-001/avatar');
  });

  it('keeps GET /api/ais local summary bounded when the local loader stalls', async () => {
    aiManager.getAllAIsSummary = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
      return [];
    };

    await withServer(async (baseUrl) => {
      const startedAt = Date.now();
      const response = await fetch(`${baseUrl}/api/ais`, {
        headers: { 'x-test-user': TEST_OWNER },
      });
      const elapsedMs = Date.now() - startedAt;
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.ok(elapsedMs < 2000, `expected bounded summary response, got ${elapsedMs}ms`);
    });
  });

  it('uses local-only summary loading before the bounded Supabase merge path', async () => {
    const seenOptions = [];
    aiManager.getAllAIsSummary = async (...args) => {
      seenOptions.push(args[3] || null);
      return [];
    };

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ais`, {
        headers: { 'x-test-user': TEST_OWNER },
      });
      assert.equal(response.status, 200);
    });

    assert.deepEqual(seenOptions, [{ includeSupabase: false }]);
  });
});
