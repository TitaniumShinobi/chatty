import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyDiscoveredSource, parseArgs } from '../scripts/sourceDiscoveryDryRun.js';

const context = {
  constructId: 'nova-001',
  supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
};

describe('sourceDiscoveryDryRun classifier', () => {
  it('allows Nova Supabase ChatGPT transcript rows into verified memory prompt assembly', () => {
    const result = classifyDiscoveredSource({
      surface: 'supabase',
      kind: 'transcript',
      id: 'row-1',
      user_id: context.supabaseUserId,
      construct_id: 'nova-001',
      filename: 'instances/nova-001/chatgpt/2025/April/Presence of Knowing.txt',
      storage_path: 'instances/nova-001/chatgpt/2025/April/Presence of Knowing.txt',
      file_type: 'text/plain',
      metadata: { source: 'chatgpt' },
      content: 'User: hello\nAssistant: I am here.',
    }, context);

    assert.equal(result.entersFinalPromptNow, true);
    assert.equal(result.finalPromptReachable, true);
    assert.equal(result.backupVisible, false);
    assert.equal(result.supabaseCanonical, true);
    assert.equal(result.promptLoader, 'verifiedMemoryLoader');
    assert.equal(result.blockedReason, null);
  });

  it('does not treat Nova canonical Chatty thread as historical memory', () => {
    const result = classifyDiscoveredSource({
      surface: 'supabase',
      kind: 'transcript',
      id: 'row-2',
      user_id: context.supabaseUserId,
      construct_id: 'nova-001',
      filename: 'instances/nova-001/chatty/chat_with_nova-001.md',
      storage_path: 'instances/nova-001/chatty/chat_with_nova-001.md',
      file_type: 'text/markdown',
      metadata: { source: 'chatty' },
      content: '# Chat with Nova',
    }, context);

    assert.equal(result.entersFinalPromptNow, false);
    assert.equal(result.finalPromptReachable, false);
    assert.equal(result.supabaseCanonical, true);
    assert.equal(result.blockedReason, 'canonical_chatty_disabled_for_nova');
  });

  it('allows root Supabase Nova documents into knowledge context', () => {
    const result = classifyDiscoveredSource({
      surface: 'supabase',
      kind: 'knowledge',
      id: 'row-3',
      user_id: context.supabaseUserId,
      construct_id: 'nova-001',
      filename: 'instances/nova-001/documents/Continuum Codex.md',
      storage_path: 'instances/nova-001/documents/Continuum Codex.md',
      file_type: 'text/markdown',
      metadata: { folder: 'documents' },
      content: 'Nova continuity source text.',
    }, context);

    assert.equal(result.entersFinalPromptNow, true);
    assert.equal(result.finalPromptReachable, true);
    assert.equal(result.supabaseCanonical, true);
    assert.equal(result.promptLoader, 'knowledgeContext');
    assert.equal(result.blockedReason, null);
  });

  it('reports user-prefixed Supabase Nova documents as visible but not matched by current knowledge loader', () => {
    const result = classifyDiscoveredSource({
      surface: 'supabase',
      kind: 'knowledge',
      id: 'row-4',
      user_id: context.supabaseUserId,
      construct_id: 'nova-001',
      filename: 'vvault/users/shard_0000/dwoodson92_7e34f6b8-e33a-48b5-8ddb-95b94d18e296/instances/nova-001/documents/Continuum Codex.md',
      storage_path: 'vvault/users/shard_0000/dwoodson92_7e34f6b8-e33a-48b5-8ddb-95b94d18e296/instances/nova-001/documents/Continuum Codex.md',
      file_type: 'text/markdown',
      metadata: { folder: 'documents' },
      content: 'Nova continuity source text.',
    }, context);

    assert.equal(result.entersFinalPromptNow, false);
    assert.equal(result.finalPromptReachable, false);
    assert.equal(result.supabaseCanonical, false);
    assert.equal(result.bridgeCandidate, true);
    assert.equal(result.blockedReason, 'user_prefixed_path_not_matched_by_knowledge_loader');
  });

  it('reports SQLite gpt_files as visible but not prompt-entering', () => {
    const result = classifyDiscoveredSource({
      surface: 'sqlite',
      kind: 'knowledge',
      rowId: 'file-1',
      owner: 'devon_woodson_1762969514958',
      filename: 'Continuum Codex.pdf',
      content: 'Extracted text',
    }, context);

    assert.equal(result.entersFinalPromptNow, false);
    assert.equal(result.finalPromptReachable, false);
    assert.equal(result.backupVisible, true);
    assert.equal(result.supabaseCanonical, false);
    assert.equal(result.bridgeCandidate, true);
    assert.equal(result.blockedReason, 'sqlite_not_in_prompt_loader');
  });

  it('reports iCloud ChatGPT files as visible but not prompt-entering', () => {
    const result = classifyDiscoveredSource({
      surface: 'icloud',
      kind: 'transcript_or_file',
      owner: 'icloud:nova-001',
      filename: '/Users/devonwoodson/Library/Mobile Documents/com~apple~CloudDocs/Vault/nova-001/chatgpt/2025/April/Presence of Knowing.txt',
    }, context);

    assert.equal(result.source, 'chatgpt');
    assert.equal(result.entersFinalPromptNow, false);
    assert.equal(result.finalPromptReachable, false);
    assert.equal(result.backupVisible, true);
    assert.equal(result.supabaseCanonical, false);
    assert.equal(result.bridgeCandidate, true);
    assert.equal(result.blockedReason, 'icloud_not_in_prompt_loader');
  });

  it('parses repeatable aliases and defaults paths', () => {
    const parsed = parseArgs([
      '--email', 'dwoodson92@gmail.com',
      '--target-life-id', 'devon_woodson_1774390416168',
      '--legacy-life-alias', 'devon_woodson_1762969514958',
      '--legacy-life-alias=devon_woodson_1762969514958',
      '--construct-id', 'nova',
    ]);

    assert.equal(parsed.constructId, 'nova-001');
    assert.deepEqual(parsed.legacyLifeAliases, ['devon_woodson_1762969514958']);
    assert.equal(parsed.email, 'dwoodson92@gmail.com');
  });
});
