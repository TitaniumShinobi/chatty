import { transcribeStream } from "./transcribeClient";

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
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, text }),
  }));
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

describe("transcribeStream fallback safety", () => {
  afterEach(() => {
    delete process.env.VITE_TRANSCRIBE_WS;
    delete (globalThis as any).window;
    delete (globalThis as any).WebSocket;
  });

  test("falls back to HTTP on any unresolved WebSocket close", async () => {
    const fetchMock = mockFetch();
    setupStreamingTest();

    const resultPromise = transcribeStream([new Blob(["audio"], { type: "audio/webm" })]);
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onclose?.({ code: 1006 });

    await expect(resultPromise).resolves.toEqual({ ok: true, text: "fallback words" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("resolves final WebSocket messages without HTTP fallback", async () => {
    const fetchMock = mockFetch();
    setupStreamingTest();

    const resultPromise = transcribeStream([new Blob(["audio"], { type: "audio/webm" })], {
      minWordCount: 1,
    });
    const ws = MockWebSocket.instances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: "final", text: "hello there" }) });

    await expect(resultPromise).resolves.toEqual({ ok: true, text: "hello there" });
    expect(ws.closed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("resolves error WebSocket messages without HTTP fallback", async () => {
    const fetchMock = mockFetch();
    setupStreamingTest();

    const resultPromise = transcribeStream([new Blob(["audio"], { type: "audio/webm" })]);
    const ws = MockWebSocket.instances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: "error", message: "No speech detected" }) });

    await expect(resultPromise).resolves.toEqual({ ok: false, message: "No speech detected" });
    expect(ws.closed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
