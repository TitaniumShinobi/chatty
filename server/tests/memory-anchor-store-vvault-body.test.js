import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMemoryAnchorStoreForTests,
  loadLatestMemoryAnchors,
} from '../lib/memoryAnchorStore.js';

const originalFetch = globalThis.fetch;
const ORIGINAL_ENV = {
  VVAULT_API_BASE_URL: process.env.VVAULT_API_BASE_URL,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  __resetMemoryAnchorStoreForTests();
  if (ORIGINAL_ENV.VVAULT_API_BASE_URL === undefined) delete process.env.VVAULT_API_BASE_URL;
  else process.env.VVAULT_API_BASE_URL = ORIGINAL_ENV.VVAULT_API_BASE_URL;
});

describe('memoryAnchorStore VVAULT body cutover', () => {
  it('loads anchor pairs from body-native memories before querying Supabase', async () => {
    process.env.VVAULT_API_BASE_URL = 'http://127.0.0.1:8000';
    let supabaseQueries = 0;
    const supabase = {
      from() {
        supabaseQueries += 1;
        throw new Error('Supabase should not be queried when VVAULT body answers');
      },
    };
    globalThis.fetch = async (url) => {
      assert.equal(String(url), 'http://127.0.0.1:8000/api/chatty/construct/lin-001/memories');
      return new Response(JSON.stringify({
        success: true,
        status: 'body_native',
        memories: [{ context: 'Devon asked for the narrow lane.', response: 'Lin stayed on the narrow lane.', source_file: 'chat_with_lin.md' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const loaded = await loadLatestMemoryAnchors('lin-001', { supabase, useCache: false });

    assert.equal(supabaseQueries, 0);
    assert.equal(loaded.source, 'vvault_body');
    assert.equal(loaded.anchors.pairs.length, 1);
    assert.equal(loaded.anchors.pairs[0].assistant, 'Lin stayed on the narrow lane.');
  });
});
