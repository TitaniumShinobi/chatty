import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { setupTranscribeStream } from "../routes/transcribeStream.js";

function restoreEnv(original) {
  for (const [key, value] of Object.entries(original)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("transcribe stream setup", () => {
  it("does not register a WebSocket server when TRANSCRIBE_WS is off", () => {
    const original = { TRANSCRIBE_WS: process.env.TRANSCRIBE_WS };
    process.env.TRANSCRIBE_WS = "off";

    const server = createServer();
    const before = server.listenerCount("upgrade");
    const wss = setupTranscribeStream(server);

    assert.equal(wss, null);
    assert.equal(server.listenerCount("upgrade"), before);

    restoreEnv(original);
  });

  it("registers /api/transcribe/stream when TRANSCRIBE_WS is on", () => {
    const original = {
      TRANSCRIBE_WS: process.env.TRANSCRIBE_WS,
      TRANSCRIPTION_BACKEND: process.env.TRANSCRIPTION_BACKEND,
    };
    process.env.TRANSCRIBE_WS = "on";
    process.env.TRANSCRIPTION_BACKEND = "openai";

    const server = createServer();
    const before = server.listenerCount("upgrade");
    const wss = setupTranscribeStream(server);

    assert.ok(wss);
    assert.equal(wss.options.path, "/api/transcribe/stream");
    assert.equal(server.listenerCount("upgrade") > before, true);

    wss.close();
    restoreEnv(original);
  });
});
