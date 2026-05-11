import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  clearZenLiveTranscriptForTest,
  formatZenLiveSseEvent,
  getZenLiveTranscriptSnapshot,
  publishZenLiveTranscriptEvent,
  shapeZenLiveTranscriptEvent,
  subscribeZenLiveTranscript,
  ZEN_LIVE_SESSION_ID,
} from '../lib/zenLiveTranscript.js';

describe('Zen live transcript stream', () => {
  beforeEach(() => {
    clearZenLiveTranscriptForTest();
  });

  it('sanitizes live events into the canonical Zen singleton session', () => {
    const shaped = shapeZenLiveTranscriptEvent({
      kind: 'assistant_token',
      sessionId: 'not-zen',
      constructId: 'nova-001',
      turnId: 'turn-1',
      sourceProduct: 'quantum',
      token: 'hello',
      secret: 'must not pass',
    });

    assert.equal(shaped.ok, true);
    assert.equal(shaped.event.sessionId, ZEN_LIVE_SESSION_ID);
    assert.equal(shaped.event.constructId, 'zen-001');
    assert.equal(shaped.event.delta, 'hello');
    assert.equal(Object.hasOwn(shaped.event, 'secret'), false);
  });

  it('normalizes Quantum mode hints into a canonical Zen mode envelope', () => {
    const shaped = shapeZenLiveTranscriptEvent({
      kind: 'user_message',
      turnId: 'turn-mode-1',
      sourceProduct: 'quantum',
      content: '/dev /quantum check this tab',
      modeEnvelope: {
        mode: 'dev',
        triggeredBy: '/dev /quantum',
        permissions: 'write-everything',
        secret: 'must not pass',
      },
    });

    assert.equal(shaped.ok, true);
    assert.deepEqual(shaped.event.modeEnvelope, {
      constructId: 'zen-001',
      sessionId: ZEN_LIVE_SESSION_ID,
      surface: 'quantum',
      mode: 'dev:quantum',
      scope: 'browser-page',
      permissions: 'read-only-default',
      mutationRequiresApproval: true,
      commandTokens: ['/dev', '/quantum'],
      cleanedPrompt: '',
    });
    assert.equal(Object.hasOwn(shaped.event.modeEnvelope, 'secret'), false);
  });

  it('keeps recovery mode approval-gated even when an event asks for weaker permissions', () => {
    const shaped = shapeZenLiveTranscriptEvent({
      kind: 'status',
      sourceProduct: 'chatty',
      status: 'switching mode',
      modeEnvelope: {
        surface: 'code',
        mode: 'recover:code',
        permissions: 'none',
        commandTokens: ['/recover', '/code'],
        cleanedPrompt: 'restore the owned process',
      },
    });

    assert.equal(shaped.ok, true);
    assert.equal(shaped.event.modeEnvelope.surface, 'code');
    assert.equal(shaped.event.modeEnvelope.mode, 'recover:code');
    assert.equal(shaped.event.modeEnvelope.permissions, 'approval-gated');
    assert.equal(shaped.event.modeEnvelope.mutationRequiresApproval, true);
    assert.equal(shaped.event.modeEnvelope.cleanedPrompt, 'restore the owned process');
  });

  it('rejects unknown event kinds', () => {
    const shaped = shapeZenLiveTranscriptEvent({ kind: 'teleport' });
    assert.equal(shaped.ok, false);
    assert.equal(shaped.error, 'invalid_zen_live_event_kind');
  });

  it('publishes events to listeners and preserves local history', () => {
    const received = [];
    const unsubscribe = subscribeZenLiveTranscript(ZEN_LIVE_SESSION_ID, (event) => {
      received.push(event);
    });

    const result = publishZenLiveTranscriptEvent({
      kind: 'user_message',
      turnId: 'turn-2',
      sourceProduct: 'quantum',
      content: 'from Quantum',
    });

    unsubscribe();

    assert.equal(result.ok, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].content, 'from Quantum');
    assert.equal(getZenLiveTranscriptSnapshot(ZEN_LIVE_SESSION_ID).length, 1);
  });

  it('serializes one server-sent event record', () => {
    const result = publishZenLiveTranscriptEvent({
      kind: 'assistant_done',
      turnId: 'turn-3',
      content: 'complete',
    });

    const line = formatZenLiveSseEvent(result.event);
    assert.match(line, /^event: zen-live-event\n/);
    assert.match(line, /\ndata: \{/);
    assert.match(line, /\n\n$/);
  });

  it('replays recent durable history after in-memory listeners are cleared', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zen-live-transcript-'));
    const originalStorePath = process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH;
    process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH = path.join(tempDir, 'zen-live-transcript.json');

    try {
      const result = publishZenLiveTranscriptEvent({
        kind: 'user_message',
        turnId: 'turn-durable-1',
        sourceProduct: 'chatty',
        content: 'persist me',
      });

      assert.equal(result.ok, true);
      clearZenLiveTranscriptForTest({ keepDurable: true });

      const replayed = getZenLiveTranscriptSnapshot(ZEN_LIVE_SESSION_ID);
      assert.equal(replayed.length, 1);
      assert.equal(replayed[0].turnId, 'turn-durable-1');
      assert.equal(replayed[0].content, 'persist me');
    } finally {
      clearZenLiveTranscriptForTest();
      if (typeof originalStorePath === 'undefined') {
        delete process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH;
      } else {
        process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH = originalStorePath;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
