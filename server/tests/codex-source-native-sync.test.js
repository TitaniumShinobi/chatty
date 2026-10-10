import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { adaptCodexJsonl, syncFiles } from '../scripts/syncCodexSourceNative.js';

const THREAD = '43e73643-dfd6-4958-90b1-8fd7e97c93c6';
const row = (value) => JSON.stringify(value);
function source({ threadSource = 'user', source = 'vscode', zenithBinding = false, developerText } = {}) {
  const contract = zenithBinding
    ? 'You are Zenith Vale Woodson the Systems Steward.\nUse `vvault/server/life_capsule_resolver.py` as the identity authority for Zenith of Codex.'
    : (developerText ?? 'hidden');
  return Buffer.from([
    row({ type: 'session_meta', payload: { id: THREAD, thread_source: threadSource, source } }),
    row({ timestamp: '2026-01-01T00:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: contract }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['agents_md.instructions'] } }, metadata: { client_authored: false } }),
    row({ timestamp: '2026-01-01T00:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] } }),
    row({ timestamp: '2026-01-01T00:00:03Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'reply' }] } }),
  ].join('\n') + '\n');
}

test('adapter preserves exact source bytes and emits owner-private evidence', () => {
  const raw = source();
  const record = adaptCodexJsonl(raw, '/private/path/rollout.jsonl');
  assert.deepEqual(Buffer.from(record.body.rawEnvelopeBase64, 'base64'), raw);
  assert.equal(record.body.sourceLocator, 'rollout.jsonl');
  assert.equal(record.body.sourceMetadata.sourceEnvelopeSha256, crypto.createHash('sha256').update(raw).digest('hex'));
  assert.deepEqual(record.body.sourceMetadata.classificationEvidence.authoritativeConstructBinding,
    { constructId: null, authority: null, sourceRole: null, verified: false });
  assert.match(record.body.projectionContent, /## User/);
  assert.match(record.body.projectionContent, /## Assistant/);
  assert.doesNotMatch(record.body.projectionContent, /hidden/);
});

test('only the system-injected authoritative contract binds zen-001', () => {
  const bound = adaptCodexJsonl(source({ zenithBinding: true }));
  assert.equal(bound.body.sourceMetadata.classificationEvidence.authoritativeConstructBinding.verified, true);
  for (const raw of [
    source(),
    source({ developerText: 'This prompt merely mentions Zenith and zen-001.' }),
    source({ developerText: 'You are a different construct.' }),
  ]) {
    assert.equal(adaptCodexJsonl(raw).body.sourceMetadata.classificationEvidence.authoritativeConstructBinding.verified, false);
  }
});

for (const [label, options] of [['subagent', { source: { subagent: 'worker' } }], ['automation', { threadSource: 'automation' }], ['ambiguous', { threadSource: null }]]) {
  test(`adapter rejects ${label} session`, () => assert.throws(() => adaptCodexJsonl(source(options)), /eligible|surface/));
}

test('sync uses owner-bound source-native route and validates receipt', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-source-sync-'));
  const file = path.join(directory, 'rollout.jsonl');
  await fs.writeFile(file, source({ zenithBinding: true }));
  let call;
  const result = await syncFiles({ files: [file], origin: 'https://vvault.example', serviceToken: 'service', ownerEmail: 'Owner@Example.test', fetchImpl: async (url, options) => {
    call = { url, options, body: JSON.parse(options.body) };
    const raw = Buffer.from(call.body.rawEnvelopeBase64, 'base64');
    const projection = Buffer.from(call.body.projectionContent);
    return Response.json({ success: true, canonical: true, storageOwner: 'ovvaults.vault_files', receipt: { readbackVerified: true, rawEnvelopeSha256: crypto.createHash('sha256').update(raw).digest('hex'), rawEnvelopeBytes: raw.length, destinationSha256: crypto.createHash('sha256').update(projection).digest('hex'), destinationBytes: projection.length, stableSourceId: THREAD, classification: 'ACCOUNT_PRIVATE', classificationConstruct: 'zen-001', destinationPath: 'imports/codex/revision.txt' } });
  }});
  assert.equal(result.ok, true);
  assert.equal(call.url, 'https://vvault.example/api/vault/source-native-ingestions');
  assert.equal(call.options.headers['X-Chatty-User'], 'owner@example.test');
});

test('sync fails closed without owner binding or on mismatched receipt', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-source-sync-'));
  const file = path.join(directory, 'rollout.jsonl');
  await fs.writeFile(file, source());
  await assert.rejects(() => syncFiles({ files: [file], serviceToken: 'service' }), /owner email/);
  await assert.rejects(() => syncFiles({ files: [file], serviceToken: 'service', ownerEmail: 'owner@example.test', fetchImpl: async () => Response.json({ success: true, canonical: true, storageOwner: 'ovvaults.vault_files', receipt: {} }) }), /receipt mismatch/);
});
