/**
 * @jest-environment jsdom
 */
import { handleSlash } from "./commands";

describe("handleSlash", () => {
  beforeEach(() => {
    // Clear listeners between tests by replacing window with a fresh EventTarget
    (globalThis as any).window = new EventTarget();
  });

  test("dispatches creator event without default initial message", () => {
    const handler = jest.fn();
    window.addEventListener("chatty:open-gpt-creator", handler);

    const result = handleSlash("/creator");

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.initialMessage).toBeUndefined();
  });

  test("dispatches creator event with provided prompt", () => {
    const handler = jest.fn();
    window.addEventListener("chatty:open-gpt-creator", handler);

    const result = handleSlash("/creator hello world");

    expect(result).toBe(true);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.initialMessage).toBe("hello world");
  });

  test("returns false for non-command text", () => {
    const handler = jest.fn();
    window.addEventListener("chatty:open-gpt-creator", handler);

    const result = handleSlash("just chatting");

    expect(result).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  test("when push is provided, /creator invokes push with receipt message", () => {
    const push = jest.fn();
    window.addEventListener("chatty:open-gpt-creator", () => {});

    const result = handleSlash("/creator", push);

    expect(result).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    const receipt = push.mock.calls[0][0];
    expect(receipt.text).toBe("Opening GPT Creator…");
    expect(receipt.role).toBe("system");
    expect(receipt.status).toBe("pending");
  });

  test("dispatches help event", () => {
    const handler = jest.fn();
    window.addEventListener("chatty:open-help", handler);

    const result = handleSlash("/help");

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("dispatches pickup event with pending receipt", () => {
    const handler = jest.fn();
    const push = jest.fn();
    window.addEventListener("chatty:pickup-codex", handler);

    const result = handleSlash("/pickup", push);

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    const receipt = push.mock.calls[0][0];
    expect(receipt.text).toBe("Syncing latest Codex handoff from VVAULT…");
    expect(receipt.role).toBe("system");
    expect(receipt.status).toBe("pending");
  });

  test("dispatches reset event", () => {
    const handler = jest.fn();
    window.addEventListener("chatty:reset-conversation", handler);

    const result = handleSlash("/reset");

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
