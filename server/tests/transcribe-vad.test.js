import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleTranscribeRequest } from '../routes/transcribe.js';
import { getVADEnv, runVADOnPath, shouldUseVAD, trimWavSegment } from '../utils/vad.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.resolve(__dirname, '..');

function selectedPython() {
  if (process.env.TRANSCRIBE_PYTHON) return process.env.TRANSCRIBE_PYTHON;
  const venvPython = path.join(serverRoot, 'venv', 'bin', 'python3');
  if (existsSync(venvPython)) return venvPython;
  return 'python3';
}

function hasWebrtcVad() {
  const result = spawnSync(selectedPython(), ['-c', 'import webrtcvad'], { stdio: 'ignore' });
  return result.status === 0;
}

function wavBuffer({ seconds = 1, sampleRate = 16000, sampleValue = 0 } = {}) {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.floor(seconds * sampleRate);
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let offset = 44; offset < buffer.length; offset += 2) {
    buffer.writeInt16LE(sampleValue, offset);
  }

  return buffer;
}

async function callTranscribeHandler(body) {
  let statusCode = 200;
  let jsonBody = null;
  const req = {
    body,
    headers: {},
    query: {},
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };

  await handleTranscribeRequest(req, res);
  return { status: statusCode, body: jsonBody };
}

describe('transcribe VAD helpers', () => {
  it('defaults VAD on and respects TRANSCRIBE_VAD=off', () => {
    const original = process.env.TRANSCRIBE_VAD;

    delete process.env.TRANSCRIBE_VAD;
    assert.equal(shouldUseVAD(), true);

    process.env.TRANSCRIBE_VAD = 'off';
    assert.equal(shouldUseVAD(), false);

    if (original == null) delete process.env.TRANSCRIBE_VAD;
    else process.env.TRANSCRIBE_VAD = original;
  });

  it('returns VAD env defaults', () => {
    const original = {
      VAD_MODE: process.env.VAD_MODE,
      VAD_FRAME_MS: process.env.VAD_FRAME_MS,
      VAD_MIN_VOICE_MS: process.env.VAD_MIN_VOICE_MS,
    };

    delete process.env.VAD_MODE;
    delete process.env.VAD_FRAME_MS;
    delete process.env.VAD_MIN_VOICE_MS;

    assert.deepEqual(getVADEnv(), {
      VAD_MODE: '3',
      VAD_FRAME_MS: '30',
      VAD_MIN_VOICE_MS: '400',
    });

    for (const [key, value] of Object.entries(original)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });
});

describe('transcribe VAD runtime', () => {
  it('detects silence from a generated WAV', { skip: !hasWebrtcVad() }, async () => {
    const tmp = path.join(serverRoot, `tmp-silence-${Date.now()}.wav`);
    await fs.writeFile(tmp, wavBuffer({ seconds: 1 }));
    try {
      const result = await runVADOnPath(tmp, getVADEnv());
      assert.equal(result.hasSpeech, false);
      assert.equal(result.voicedMs, 0);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });

  it('rejects silent audio before STT', { skip: !hasWebrtcVad() }, async () => {
    const original = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_ANON_TRANSCRIBE: process.env.ALLOW_ANON_TRANSCRIBE,
      TRANSCRIBE_VAD: process.env.TRANSCRIBE_VAD,
      TRANSCRIPTION_BACKEND: process.env.TRANSCRIPTION_BACKEND,
    };

    process.env.NODE_ENV = 'development';
    process.env.ALLOW_ANON_TRANSCRIBE = 'true';
    process.env.TRANSCRIBE_VAD = 'on';
    process.env.TRANSCRIPTION_BACKEND = 'openai';

    const res = await callTranscribeHandler({
      audio: wavBuffer({ seconds: 1 }).toString('base64'),
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.message, "Didn't catch speech. Try again.");

    for (const [key, value] of Object.entries(original)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('can detect and trim the recovered Nova reference WAV', { skip: !hasWebrtcVad() }, async () => {
    const novaRef = path.join(repoRoot, 'resources', 'voices', 'nova_ref.wav');
    assert.equal(existsSync(novaRef), true);

    const result = await runVADOnPath(novaRef, getVADEnv());
    assert.equal(result.hasSpeech, true);
    assert.equal(typeof result.startMs, 'number');
    assert.equal(typeof result.endMs, 'number');

    const trimmed = await trimWavSegment(
      novaRef,
      Math.max(0, result.startMs - 80),
      result.endMs + 120
    );
    try {
      const stat = await fs.stat(trimmed);
      assert.equal(stat.size > 44, true);
    } finally {
      await fs.unlink(trimmed).catch(() => {});
    }
  });
});
