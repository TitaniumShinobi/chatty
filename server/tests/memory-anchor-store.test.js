import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMemoryAnchorStoreForTests,
  buildMemoryAnchorFilename,
  loadLatestMemoryAnchors,
  selectLatestValidAnchorDocument,
} from '../lib/memoryAnchorStore.js';

function createMockSupabase(rows, { delayMs = 0, error = null } = {}) {
  let queryCount = 0;

  return {
    from(table) {
      assert.equal(table, 'vault_files');

      const filters = {};
      const builder = {
        select() {
          return builder;
        },
        eq(field, value) {
          filters[field] = value;
          return builder;
        },
        then(resolve, reject) {
          queryCount += 1;
          const payload = typeof rows === 'function' ? rows(filters) : rows;
          const result = { data: payload, error };
          const promise = delayMs > 0
            ? new Promise((fulfill) => setTimeout(() => fulfill(result), delayMs))
            : Promise.resolve(result);
          return promise.then(resolve, reject);
        },
      };

      return builder;
    },
    getQueryCount() {
      return queryCount;
    },
  };
}

describe('memoryAnchorStore', () => {
  beforeEach(() => {
    __resetMemoryAnchorStoreForTests();
  });

  it('selects the newest valid memory_anchors row when duplicate rows exist', async () => {
    const constructId = 'lin-001';
    const filename = buildMemoryAnchorFilename(constructId);
    const supabase = createMockSupabase([
      {
        id: 'newest-invalid',
        filename,
        content: JSON.stringify({ pairs: [] }),
        updated_at: '2026-04-25T05:00:00.000Z',
        created_at: '2026-04-25T05:00:00.000Z',
      },
      {
        id: 'newest-valid',
        filename,
        content: JSON.stringify({
          pairs: [
            { user: 'Who are you?', assistant: 'I am Lin.' },
          ],
        }),
        updated_at: '2026-04-25T04:00:00.000Z',
        created_at: '2026-04-25T04:00:00.000Z',
      },
      {
        id: 'older-valid',
        filename,
        content: JSON.stringify({
          pairs: [
            { user: 'hi', assistant: 'hello' },
          ],
        }),
        updated_at: '2026-04-24T04:00:00.000Z',
        created_at: '2026-04-24T04:00:00.000Z',
      },
    ]);

    const loaded = await loadLatestMemoryAnchors(constructId, { supabase, useCache: false });

    assert.equal(loaded.latestRow?.id, 'newest-invalid');
    assert.equal(loaded.row?.id, 'newest-valid');
    assert.equal(loaded.anchors?.pairs?.length, 1);
    assert.equal(loaded.anchors?.pairs?.[0]?.assistant, 'I am Lin.');
    assert.equal(supabase.getQueryCount(), 1);
  });

  it('reuses one anchor query across concurrent and immediate repeat loads', async () => {
    const constructId = 'lin-001';
    const filename = buildMemoryAnchorFilename(constructId);
    const supabase = createMockSupabase([
      {
        id: 'valid-row',
        filename,
        content: JSON.stringify({
          pairs: [
            { user: 'What do you remember?', assistant: 'Enough to answer cleanly.' },
          ],
        }),
        updated_at: '2026-04-25T06:00:00.000Z',
        created_at: '2026-04-25T06:00:00.000Z',
      },
    ], { delayMs: 10 });

    const [first, second, third] = await Promise.all([
      loadLatestMemoryAnchors(constructId, { supabase }),
      loadLatestMemoryAnchors(constructId, { supabase }),
      loadLatestMemoryAnchors(constructId, { supabase }),
    ]);

    assert.equal(supabase.getQueryCount(), 1);
    assert.equal(first.row?.id, 'valid-row');
    assert.equal(second.row?.id, 'valid-row');
    assert.equal(third.row?.id, 'valid-row');

    const repeated = await loadLatestMemoryAnchors(constructId, { supabase });
    assert.equal(repeated.row?.id, 'valid-row');
    assert.equal(supabase.getQueryCount(), 1);
  });

  it('uses created_at-only reads for vault_files anchors and still ranks rows without updated_at', async () => {
    const constructId = 'nova-001';
    const filename = buildMemoryAnchorFilename(constructId);
    let selectedColumns = null;
    const supabase = {
      from(table) {
        assert.equal(table, 'vault_files');
        const filters = {};
        const builder = {
          select(columns) {
            selectedColumns = columns;
            return builder;
          },
          eq(field, value) {
            filters[field] = value;
            return builder;
          },
          then(resolve, reject) {
            assert.equal(filters.construct_id, constructId);
            assert.equal(filters.filename, filename);
            return Promise.resolve({
              data: [
                {
                  id: 'newer-created',
                  filename,
                  content: JSON.stringify({ pairs: [{ user: 'Hello', assistant: 'Hi Devon.' }] }),
                  created_at: '2026-05-02T10:30:00.000Z',
                },
                {
                  id: 'older-created',
                  filename,
                  content: JSON.stringify({ pairs: [{ user: 'Earlier', assistant: 'Earlier answer.' }] }),
                  created_at: '2026-05-01T10:30:00.000Z',
                },
              ],
              error: null,
            }).then(resolve, reject);
          },
        };
        return builder;
      },
    };

    const loaded = await loadLatestMemoryAnchors(constructId, { supabase, useCache: false });

    assert.equal(selectedColumns, 'id, filename, content, created_at');
    assert.equal(loaded.row?.id, 'newer-created');
    assert.equal(loaded.latestRow?.id, 'newer-created');
  });

  it('falls back to no selected row when every duplicate is invalid', () => {
    const selection = selectLatestValidAnchorDocument([
      {
        id: 'broken-json',
        filename: 'instances/lin-001/memory_anchors.json',
        content: '{not-json',
        updated_at: '2026-04-25T06:00:00.000Z',
      },
      {
        id: 'empty-pairs',
        filename: 'instances/lin-001/memory_anchors.json',
        content: JSON.stringify({ pairs: [] }),
        updated_at: '2026-04-25T05:00:00.000Z',
      },
    ]);

    assert.equal(selection.latestRow?.id, 'broken-json');
    assert.equal(selection.row, null);
    assert.equal(selection.anchors, null);
  });
});
