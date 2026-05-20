import { createCreatorReceiptHandshake } from "./creatorReceipt";

describe("createCreatorReceiptHandshake", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("flips pending receipt to error after timeout and emits telemetry", () => {
    const flipPending = jest.fn();
    const telemetry = jest.fn().mockResolvedValue(undefined);
    const handshake = createCreatorReceiptHandshake({
      flipPending,
      timeoutMs: 5000,
      telemetry,
    });

    handshake.onCreatorOpened();
    jest.advanceTimersByTime(5000);

    expect(flipPending).toHaveBeenCalledWith(
      "error",
      "GPT Creator connection failed ❌ - Retry"
    );
    expect(telemetry).toHaveBeenCalledWith("creator_receipt_error");
  });

  test("flips pending receipt to ok when gpt-creator ready message arrives", () => {
    const flipPending = jest.fn();
    const telemetry = jest.fn().mockResolvedValue(undefined);
    const handshake = createCreatorReceiptHandshake({
      flipPending,
      timeoutMs: 5000,
      telemetry,
    });

    handshake.onCreatorOpened();
    handshake.onReady({ data: { type: "gpt-creator:ready" } });

    expect(flipPending).toHaveBeenCalledWith(
      "ok",
      "Connected to GPT Creator ✅"
    );
    expect(telemetry).toHaveBeenCalledWith("creator_receipt_ok");
  });

  test("default telemetry sender does not call fetch", () => {
    const originalFetch = (globalThis as any).fetch;
    const fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;
    try {
      const flipPending = jest.fn();
      const handshake = createCreatorReceiptHandshake({
        flipPending,
        timeoutMs: 1000,
      });

      handshake.onCreatorOpened();
      jest.advanceTimersByTime(1000);
      handshake.onReady({ data: { type: "gpt-creator:ready" } });

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
