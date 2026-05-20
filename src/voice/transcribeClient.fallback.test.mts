import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { transcribeStream } from "./transcribeClient.ts";

type MockWsEvent = {
  data?: string;
  code?: number;
};

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  binaryType = "";
  closed = false;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MockWsEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: MockWsEvent) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }
}

function setupStreamingTest() {
  process.env.VITE_TRANSCRIBE_WS = "on";
  (globalThis as any).window = { location: { origin: "http://localhost:5173" } };
  (globalThis as any).WebSocket = MockWebSocket;
  MockWebSocket.instances = [];
}

function mockFetch(text = "fallback words") {
  const calls: unknown[][] = [];
  const fetchMock = async (...args: unknown[]) => {
    calls.push(args);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, text }),
    };
  };
  (fetchMock as any).calls = calls;
  (globalThis as any).fetch = fetchMock;
  return fetchMock as typeof fetchMock & { calls: unknown[][] };
}

describe("transcribeStream fallback safety", () => {
  afterEach(() => {
    delete process.env.VITE_TRANSCRIBE_WS;
    delete (globalThis as any).window;
    delete (globalThis as any).WebSocket;
  });

  it("falls back to HTTP on any unresolved WebSocket close", async () => {
    const fetchMock = mockFetch();
    setupStreamingTest();

    const resultPromise = transcribeStream([new Blob(["audio"], { type: "audio/webm" })]);
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onclose?.({ code: 1006 });

    assert.deepEqual(await resultPromise, { ok: true, text: "fallback words" });
    assert.equal(fetchMock.calls.length, 1);
  });

  it("resolves final WebSocket messages without HTTP fallback", async () => {
    const fetchMock = mockFetch();
    setupStreamingTest();

    const resultPromise = transcribeStream([new Blob(["audio"], { type: "audio/webm" })], {
      minWordCount: 1,
    });
    const ws = MockWebSocket.instances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: "final", text: "hello there" }) });

    assert.deepEqual(await resultPromise, { ok: true, text: "hello there" });
    assert.equal(ws.closed, true);
    assert.equal(fetchMock.calls.length, 0);
  });

  it("resolves error WebSocket messages without HTTP fallback", async () => {
    const fetchMock = mockFetch();
    setupStreamingTest();

    const resultPromise = transcribeStream([new Blob(["audio"], { type: "audio/webm" })]);
    const ws = MockWebSocket.instances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: "error", message: "No speech detected" }) });

    assert.deepEqual(await resultPromise, { ok: false, message: "No speech detected" });
    assert.equal(ws.closed, true);
    assert.equal(fetchMock.calls.length, 0);
  });
});
