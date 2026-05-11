import {
  getRenderableThreadMessages,
  shouldBlockActiveThreadRender,
  shouldWindowThreadHistory,
} from "./Chat";

describe("Chat history hydration and rendering", () => {
  it("blocks active-thread rendering while only an index preview is available", () => {
    expect(
      shouldBlockActiveThreadRender({
        activeThreadHydration: { status: "loading" },
        thread: {
          isIndexHydrated: true,
          messages: [{ id: "preview-1", text: "recent" }],
        },
      }),
    ).toBe(true);
  });

  it("does not block a fully hydrated active thread", () => {
    expect(
      shouldBlockActiveThreadRender({
        activeThreadHydration: { status: "ready" },
        thread: {
          isIndexHydrated: false,
          messages: Array.from({ length: 120 }, (_, index) => ({
            id: `msg-${index}`,
            text: `message-${index}`,
          })),
        },
      }),
    ).toBe(false);
  });

  it("blocks canonical Zen rendering until exact full VVAULT hydration is ready", () => {
    expect(
      shouldBlockActiveThreadRender({
        activeThreadHydration: {
          status: "partial",
          threadId: "zen-001_chat_with_zen-001",
          hydrationSource: "snapshot-replay",
          hydrationComplete: false,
        },
        thread: {
          id: "zen-001_chat_with_zen-001",
          isIndexHydrated: false,
          messages: [{ id: "cached-later-turn", text: "cached tail" }],
        },
      }),
    ).toBe(true);

    expect(
      shouldBlockActiveThreadRender({
        activeThreadHydration: {
          status: "ready",
          threadId: "zen-001_chat_with_zen-001",
          hydrationSource: "local-fallback",
          hydrationComplete: false,
        },
        thread: {
          id: "zen-001_chat_with_zen-001",
          isIndexHydrated: false,
          messages: [{ id: "local-deferred-turn", text: "local fallback tail" }],
        },
      }),
    ).toBe(true);
  });

  it("allows canonical Zen rendering when hydration is exact full VVAULT truth", () => {
    expect(
      shouldBlockActiveThreadRender({
        activeThreadHydration: {
          status: "ready",
          threadId: "zen-001_chat_with_zen-001",
          hydrationSource: "full",
          hydrationComplete: true,
        },
        thread: {
          id: "zen-001_chat_with_zen-001",
          isIndexHydrated: false,
          messages: [{ id: "vvault-turn", text: "backend truth tail" }],
        },
      }),
    ).toBe(false);
  });

  it("windows only index-hydrated preview threads", () => {
    expect(shouldWindowThreadHistory({ isIndexHydrated: true })).toBe(true);
    expect(shouldWindowThreadHistory({ isIndexHydrated: false })).toBe(false);
  });

  it("renders full loaded history immediately for fully hydrated threads", () => {
    const messages = Array.from({ length: 120 }, (_, index) => ({
      id: `msg-${index}`,
      text: `message-${index}`,
    }));

    expect(
      getRenderableThreadMessages(messages, 50, {
        isIndexHydrated: false,
      }).length,
    ).toBe(120);
  });

  it("keeps preview windowing for index-hydrated threads only", () => {
    const messages = Array.from({ length: 120 }, (_, index) => ({
      id: `msg-${index}`,
      text: `message-${index}`,
    }));

    expect(
      getRenderableThreadMessages(messages, 50, {
        isIndexHydrated: true,
      }).length,
    ).toBe(50);
  });
});
