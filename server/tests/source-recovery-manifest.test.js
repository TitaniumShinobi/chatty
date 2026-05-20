import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseManifestArgs,
  planRecoveryManifestEntry,
  summarizeManifestEntries,
} from '../scripts/sourceRecoveryManifest.js';

const options = {
  email: 'user@example.com',
  targetLifeId: 'test-user-001',
  legacyLifeAliases: ['devon_woodson_1762969514958'],
  constructId: 'nova-001',
  source: 'chatgpt',
  supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
  recoveryRunId: 'test-run',
};

function hash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

describe('sourceRecoveryManifest planning', () => {
  it('plans a canonical Supabase vault_files row for a Nova iCloud ChatGPT transcript', () => {
    const content = 'You: Nova, are you there?\nNova: I am here with you.';
    const result = planRecoveryManifestEntry({
      candidate: {
        surface: 'icloud',
        backupVisible: true,
        source: 'chatgpt',
        owner: 'icloud:nova-001',
        path: '/Users/example/Library/Mobile Documents/com~apple~CloudDocs/Vault/nova-001/chatgpt/2025/April/Presence of Knowing.txt',
      },
      content,
      existingSupabaseRows: [],
      supabaseAvailable: true,
      options,
      generatedAt: '2026-04-16T00:00:00.000Z',
    });

    assert.equal(result.planned, true);
    assert.equal(result.rejectionReasons.length, 0);
    assert.equal(result.duplicateStatus, 'none');
    assert.equal(result.sourceSha256, hash(content));
    assert.match(result.canonicalFilename, /^instances\/nova-001\/chatgpt\/2025\/April\/Presence_of_Knowing-[a-f0-9]{12}\.txt$/);
    assert.equal(result.plannedRow.construct_id, 'nova-001');
    assert.equal(result.plannedRow.file_type, 'transcript');
    assert.equal(result.plannedRow.metadata.source, 'chatgpt');
    assert.equal(result.plannedRow.metadata.bridgeSource, 'icloud');
  });

  it('rejects Nova Chatty canonical history as historical proof', () => {
    const result = planRecoveryManifestEntry({
      candidate: {
        surface: 'vvault_local',
        backupVisible: true,
        source: 'chatty',
        owner: 'legacy',
        path: 'instances/nova-001/chatty/chat_with_nova-001.md',
      },
      content: '# Chat with Nova',
      existingSupabaseRows: [],
      supabaseAvailable: true,
      options,
    });

    assert.equal(result.planned, false);
    assert.ok(result.rejectionReasons.includes('source_policy_mismatch'));
    assert.ok(result.rejectionReasons.includes('canonical_chatty_disabled_for_construct'));
  });

  it('rejects duplicate content when Supabase metadata already has the source hash', () => {
    const content = 'You: hello\nNova: hello back';
    const sourceSha256 = hash(content);
    const result = planRecoveryManifestEntry({
      candidate: {
        surface: 'icloud',
        backupVisible: true,
        source: 'chatgpt',
        owner: 'icloud:nova-001',
        path: '/Vault/nova-001/chatgpt/hello.md',
      },
      content,
      existingSupabaseRows: [{
        surface: 'supabase',
        sourceSha256,
        path: 'instances/nova-001/chatgpt/old-row.md',
      }],
      supabaseAvailable: true,
      options,
    });

    assert.equal(result.planned, false);
    assert.equal(result.duplicateStatus, 'duplicate_hash');
    assert.ok(result.rejectionReasons.includes('duplicate_hash'));
  });

  it('rejects non-ChatGPT backup sources for Nova', () => {
    const result = planRecoveryManifestEntry({
      candidate: {
        surface: 'icloud',
        backupVisible: true,
        source: 'character.ai',
        owner: 'icloud:nova-001',
        path: '/Vault/nova-001/character.ai/thread.md',
      },
      content: 'Character AI content',
      existingSupabaseRows: [],
      supabaseAvailable: true,
      options,
    });

    assert.equal(result.planned, false);
    assert.ok(result.rejectionReasons.includes('source_policy_mismatch'));
  });

  it('distinguishes planned rows from current final-prompt-reachable Supabase rows', () => {
    const entries = [
      { planned: true, canonicalFilename: 'instances/nova-001/chatgpt/a.md' },
      { planned: false },
    ];
    const report = {
      surfaceStatus: { supabase: { available: true } },
      sources: [{
        surface: 'supabase',
        finalPromptReachable: true,
        promptLoader: 'verifiedMemoryLoader',
      }],
    };

    const summary = summarizeManifestEntries(entries, report);

    assert.equal(summary.candidateCount, 2);
    assert.equal(summary.rejectedCount, 1);
    assert.equal(summary.plannedCanonicalRowCount, 1);
    assert.equal(summary.currentSupabaseFinalPromptReachable, true);
    assert.equal(summary.currentSupabaseReachabilityStatus, 'yes');
    assert.equal(summary.currentSupabaseFinalPromptReachableCount, 1);
  });

  it('parses manifest args without allowing duplicate aliases', () => {
    const parsed = parseManifestArgs([
      '--email', 'user@example.com',
      '--target-life-id', 'test-user-001',
      '--legacy-life-alias', 'devon_woodson_1762969514958',
      '--legacy-life-alias=devon_woodson_1762969514958',
      '--construct-id', 'nova',
      '--source', 'chat_gpt',
      '--out', '/tmp/nova-manifest.json',
    ]);

    assert.equal(parsed.constructId, 'nova-001');
    assert.equal(parsed.source, 'chatgpt');
    assert.deepEqual(parsed.legacyLifeAliases, ['devon_woodson_1762969514958']);
    assert.equal(parsed.out, '/tmp/nova-manifest.json');
  });
});
