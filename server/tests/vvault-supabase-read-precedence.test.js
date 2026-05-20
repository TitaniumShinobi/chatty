import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { shouldPreferVvaultApiConversationRead } from '../../vvaultConnector/supabaseStore.mjs';
import { readConversations } from '../../vvaultConnector/readConversations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readConversationsSource = () =>
  fs.readFileSync(path.resolve(__dirname, '../../vvaultConnector/readConversations.js'), 'utf8');
const vvaultRouteSource = () =>
  fs.readFileSync(path.resolve(__dirname, '../routes/vvault.js'), 'utf8');

const ORIGINAL_ENV = {
  VVAULT_API_BASE_URL: process.env.VVAULT_API_BASE_URL,
  VVAULT_URL: process.env.VVAULT_URL,
  VVAULT_BASE_URL: process.env.VVAULT_BASE_URL,
  VVAULT_SERVICE_TOKEN: process.env.VVAULT_SERVICE_TOKEN,
  CHATTY_ALLOW_LEGACY_SUPABASE_CONVERSATION_READS: process.env.CHATTY_ALLOW_LEGACY_SUPABASE_CONVERSATION_READS,
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('VVAULT conversation read precedence', () => {
  it('prefers the VVAULT API whenever an email-bearing user context exists', () => {
    assert.equal(
      shouldPreferVvaultApiConversationRead({
        userEmail: 'devon@example.com',
        supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
      }),
      true,
    );
  });

  it('also allows VVAULT API first for email-only service contexts', () => {
    assert.equal(
      shouldPreferVvaultApiConversationRead({
        userEmail: 'devon@example.com',
        supabaseUserId: null,
      }),
      true,
    );
  });

  it('cannot try the VVAULT API first for UUID-only lookups without email context', () => {
    assert.equal(
      shouldPreferVvaultApiConversationRead({
        userEmail: null,
        supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
      }),
      false,
    );
  });

  it('reads from VVAULT API before any legacy Supabase fallback when email context is available', async () => {
    process.env.VVAULT_API_BASE_URL = 'http://127.0.0.1:8000';
    process.env.VVAULT_SERVICE_TOKEN = 'test-token';
    delete process.env.CHATTY_ALLOW_LEGACY_SUPABASE_CONVERSATION_READS;

    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        success: true,
        content: '[2026-05-04T12:00:00.000Z] **User**: hello\n\n[2026-05-04T12:00:01.000Z] **Zen**: hi',
        updated_at: '2026-05-04T12:00:01.000Z',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const conversations = await readConversations({
      userEmail: 'devon@example.com',
      supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
    }, 'zen-001');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://127.0.0.1:8000/api/chatty/transcript/zen-001');
    assert.equal(calls[0].options.headers['X-Chatty-User'], 'devon@example.com');
    assert.equal(calls[0].options.headers['X-Chatty-Supabase-User-Id'], '7e34f6b8-e33a-48b5-8ddb-95b94d18e296');
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].persistenceSource, 'vvault-api');
    assert.equal(conversations[0].messages.length, 2);
  });

  it('prefers fresher transcript markdown when the VVAULT API message array is stale', async () => {
    process.env.VVAULT_API_BASE_URL = 'http://127.0.0.1:8000';
    process.env.VVAULT_SERVICE_TOKEN = 'test-token';
    delete process.env.CHATTY_ALLOW_LEGACY_SUPABASE_CONVERSATION_READS;

    globalThis.fetch = async () => new Response(JSON.stringify({
      success: true,
      messages: [
        {
          role: 'user',
          content: 'hello',
          timestamp: '2026-05-04T12:00:00.000Z',
        },
        {
          role: 'assistant',
          content: 'hi',
          timestamp: '2026-05-04T12:00:01.000Z',
        },
      ],
      content: [
        '[2026-05-04T12:00:00.000Z] **User**: hello',
        '',
        '[2026-05-04T12:00:01.000Z] **Zen**: hi',
        '',
        '[2026-05-06T04:45:00.000Z] **User**: newest user turn',
        '',
        '[2026-05-06T04:45:01.000Z] **Zen**: newest assistant turn',
      ].join('\n'),
      updated_at: '2026-05-06T04:45:01.000Z',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const conversations = await readConversations({
      userEmail: 'devon@example.com',
      supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
    }, 'zen-001');

    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].messages.length, 4);
    assert.equal(conversations[0].messages.at(-1)?.content, 'newest assistant turn');
    assert.equal(conversations[0].messages.at(-1)?.timestamp, '2026-05-06T04:45:01.000Z');
  });

  it('keeps VVAULT/Postgres fallback construct-scoped instead of returning all user conversations', () => {
    const source = readConversationsSource();

    assert.match(source, /WHERE \(c\.user_email = \$1 OR c\.user_id = \$1\)/);
    assert.match(source, /c\.construct_id = \$2/);
    assert.match(source, /c\.construct_callsign = \$2/);
    assert.match(source, /c\.session_id = \$3/);
    assert.match(source, /`\$\{constructId\}_chat_with_\$\{constructId\}`/);
  });

  it('keeps canonical Chatty route history lookups email-bearing so VVAULT API reads stay ahead of local fallback', () => {
    const source = vvaultRouteSource();
    assert.match(source, /function buildConversationLookupContext/);
    assert.match(source, /userEmail: req\.user\?\.email \|\| null/);
    assert.match(source, /readConversations\(lookupId, constructId\)/);
    assert.match(source, /supabaseUserId: UUID_LOOKUP_RE\.test\(String\(dataOwnerUserId \|\| ''\)\.trim\(\)\)/);
  });
});
