/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

jest.mock("react", () => {
  const actualReact = jest.requireActual("react");
  return {
    __esModule: true,
    ...actualReact,
    default: actualReact,
  };
});

jest.mock("../components/MessageOptionsMenu", () => ({
  MessageOptionsMenu: () => null,
}));

jest.mock("../runtime/render", () => ({
  R: ({ packets }: { packets?: Array<{ payload?: { content?: string } }> }) => (
    <div>{packets?.map((packet) => packet.payload?.content).filter(Boolean).join("\n")}</div>
  ),
}));

jest.mock("../components/Mirror", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../components/MirrorSetup", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../lib/vvaultConversationManager", () => ({
  VVAULTConversationManager: {
    getInstance: jest.fn(() => ({})),
  },
}));

jest.mock("../lib/auth", () => ({
  getUserId: jest.fn(() => "user-1"),
}));

jest.mock("../lib/aiService", () => ({
  AIService: {},
}));

jest.mock("../lib/tts", () => ({
  setPendingVoiceReplyPlay: jest.fn(),
  getPendingVoiceReplyPlay: jest.fn(() => null),
  clearPendingVoiceReplyPlay: jest.fn(),
  getSavedTtsConfig: jest.fn(() => ({})),
  getResolvedTtsForPlayback: jest.fn(() => ({ provider: "browser", voiceName: null })),
  speakBrowser: jest.fn(() => Promise.resolve()),
  speakPremium: jest.fn(() => Promise.resolve()),
  isBrowserTtsAvailable: jest.fn(() => false),
}));

jest.mock("../context/SettingsContext", () => ({
  useSettings: jest.fn(() => ({
    settings: {
      general: {
        zenVoice: null,
        linVoice: null,
      },
    },
  })),
}));

jest.mock("../context/TtsPlaybackContext", () => ({
  useTtsPlayback: jest.fn(() => ({
    setTtsPlaying: jest.fn(),
    setCurrentAudioElement: jest.fn(),
  })),
}));

jest.mock("../lib/creatorOpen", () => ({
  buildCreatorOpenState: jest.fn(() => ({})),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Chat = require("./Chat").default;

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const consoleError = console.error;
const actWarning = /not wrapped in act|suspended resource finished loading inside a test/i;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function renderChatWithContext(
  overrides: Record<string, unknown> = {},
  initialEntry = "/app/chat/zen-001_chat_with_zen-001",
) {
  const baseThread = {
    id: "zen-001_chat_with_zen-001",
    title: "Zen",
    messages: [
      {
        id: "__orchestration-proof__:zen-001_chat_with_zen-001",
        role: "system" as const,
        status: "pending" as const,
        text: "Orchestration proof: transcript saved. Proving canonical reload…",
        ts: Date.now() - 2000,
      },
      {
        id: "assistant-1",
        role: "assistant" as const,
        packets: [{ op: "answer.v1", payload: { content: "Zen is here." } }],
        ts: Date.now() - 1000,
      },
    ],
    isIndexHydrated: false,
  };

  const outletContext = {
    threads: [baseThread],
    isLoading: false,
    sendMessage: jest.fn(),
    reloadThreadMessages: jest.fn(() => Promise.resolve()),
    updateMessageMetadata: jest.fn(),
    newThread: jest.fn(),
    navigate: jest.fn(),
    sendingThreadId: null,
    user: { id: "user-1" },
    showOrchestrationLog: false,
    toggleOrchestrationLog: jest.fn(),
    activeThreadHydration: {
      threadId: "zen-001_chat_with_zen-001",
      status: "ready",
      hydrationSource: "full",
      hydrationComplete: true,
    },
    ...overrides,
  };

  return {
    ...render(
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route element={<Outlet context={outletContext} />}>
            <Route path="/app/chat/:threadId" element={<Chat />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
    outletContext,
  };
}

function expectForbiddenChatDeadEndCopyAbsent() {
  expect(document.body).not.toHaveTextContent(/Go Home/i);
  expect(document.body).not.toHaveTextContent(/Thread not found/i);
  expect(document.body).not.toHaveTextContent(/Zen transcript/i);
  expect(document.body).not.toHaveTextContent(/Nova transcript/i);
  expect(document.body).not.toHaveTextContent(/VVAULT transcript unavailable/i);
  expect(document.body).not.toHaveTextContent(/VVAULT readback pending/i);
  expect(document.body).not.toHaveTextContent(/Canonical readback failed/i);
  expect(document.body).not.toHaveTextContent(/Canonical VVAULT readback required/i);
  expect(document.body).not.toHaveTextContent(/local state as canonical/i);
}

function expectMissingCanonicalRouteTextAbsent() {
  expectForbiddenChatDeadEndCopyAbsent();
  expect(document.body).not.toHaveTextContent(/route opened/i);
  expect(document.body).not.toHaveTextContent(/exact transcript/i);
  expect(document.body).not.toHaveTextContent(/raw metadata/i);
  expect(document.body).not.toHaveTextContent(/sentinel transcript/i);
  expect(document.body).not.toHaveTextContent(/runtime_receipt/i);
  expect(document.body).not.toHaveTextContent(/orchestration_checklist/i);
}

describe("Chat orchestration proof surface", () => {
  beforeAll(() => {
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: MockResizeObserver,
    });
    console.error = (...args: any[]) => {
      const combined = args.map(String).join(" ");
      if (actWarning.test(combined)) return;
      // @ts-ignore
      return consoleError.apply(console, args);
    };
  });

  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enabled: false }),
      text: async () => "",
    });
    HTMLElement.prototype.getBoundingClientRect = function mockRect() {
      return {
        width: 320,
        height: 48,
        top: 0,
        right: 320,
        bottom: 48,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    jest.clearAllMocks();
  });

  afterAll(() => {
    console.error = consoleError;
  });

  it("renders the in-thread orchestration proof status alongside the assistant turn", async () => {
    renderChatWithContext();

    expect(
      screen.getByRole("status", {
        name: "",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/orchestration proof: transcript saved\. proving canonical reload/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Zen is here.")).toBeInTheDocument();
  });

  it("wires the composer beaker to the shared orchestration log toggle", async () => {
    const toggleOrchestrationLog = jest.fn();
    renderChatWithContext({ toggleOrchestrationLog });

    fireEvent.click(screen.getByLabelText("Show orchestration log"));

    expect(toggleOrchestrationLog).toHaveBeenCalledTimes(1);
  });

  it("forwards a chat-ui composer send through the outlet sendMessage seam", async () => {
    const { outletContext } = renderChatWithContext();

    const textarea = screen.getByPlaceholderText(/message zen/i);
    fireEvent.change(textarea, { target: { value: "prove it" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(outletContext.sendMessage).toHaveBeenCalledWith(
        "zen-001_chat_with_zen-001",
        "prove it",
        [],
        undefined,
        undefined,
      );
    });
  });

  it("requests exact-thread reload when only a sparse index preview is active", async () => {
    const reloadThreadMessages = jest.fn(() => Promise.resolve());

    renderChatWithContext({
      threads: [
        {
          id: "zen-001_chat_with_zen-001",
          title: "Zen",
          isIndexHydrated: true,
          messages: [{ id: "preview-1", role: "user", text: "preview", ts: Date.now() }],
        },
      ],
      reloadThreadMessages,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "partial",
        hydrationSource: "index-fallback",
        hydrationComplete: false,
      },
    });

    await waitFor(() => {
      expect(reloadThreadMessages).toHaveBeenCalledWith(
        "zen-001_chat_with_zen-001",
      );
    });
  });

  it("keeps preview messages and composer visible while exact-thread reload is still pending", async () => {
    jest.useFakeTimers();
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const reloadThreadMessages = jest.fn(() => new Promise<void>(() => {}));

    try {
      renderChatWithContext({
        threads: [
          {
            id: "zen-001_chat_with_zen-001",
            title: "Zen",
            isIndexHydrated: true,
            messages: [{ id: "preview-1", role: "user", text: "preview", ts: Date.now() }],
          },
        ],
        reloadThreadMessages,
        activeThreadHydration: {
          threadId: "zen-001_chat_with_zen-001",
          status: "partial",
          hydrationSource: "index-fallback",
          hydrationComplete: false,
        },
      });

      await waitFor(() => {
        expect(reloadThreadMessages).toHaveBeenCalledWith(
          "zen-001_chat_with_zen-001",
        );
      });

      jest.advanceTimersByTime(15000);

      expect(screen.getByText("preview")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/message zen/i)).toBeInTheDocument();
      expect(screen.queryByText(/loading conversation/i)).not.toBeInTheDocument();
      expectMissingCanonicalRouteTextAbsent();
      expect(consoleWarn).toHaveBeenCalledWith(
        "⏳ [Chat] Reload still waiting after 15s - keeping loading state until VVAULT returns",
        expect.objectContaining({
          threadId: "zen-001_chat_with_zen-001",
          hydrationStatus: "partial",
          hydrationSource: "index-fallback",
        }),
      );
    } finally {
      consoleWarn.mockRestore();
      jest.useRealTimers();
    }
  });

  it("requests the canonical thread reload before the conversation index is hydrated", async () => {
    const reloadThreadMessages = jest.fn(() => Promise.resolve());

    renderChatWithContext({
      threads: [],
      isLoading: true,
      reloadThreadMessages,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "loading",
      },
    });

    await waitFor(() => {
      expect(reloadThreadMessages).toHaveBeenCalledWith("zen-001_chat_with_zen-001");
    });
    expectMissingCanonicalRouteTextAbsent();
  });

  it("keeps the canonical shell visible before layout/index loading resolves", async () => {
    const reloadThreadMessages = jest.fn(() => Promise.resolve());

    renderChatWithContext({
      threads: [],
      isLoading: true,
      reloadThreadMessages,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "loading",
      },
    });

    await waitFor(() => {
      expect(reloadThreadMessages).toHaveBeenCalledWith("zen-001_chat_with_zen-001");
    });
    expect(screen.getByPlaceholderText(/message zen/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading conversation...")).not.toBeInTheDocument();
    expectMissingCanonicalRouteTextAbsent();
  });

  it("keeps the chat GUI visible while layout loading is still in progress", () => {
    renderChatWithContext({
      threads: [],
      isLoading: true,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "loading",
      },
    });

    expect(screen.getByPlaceholderText(/message zen/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading conversation…")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Please wait while we fetch your data."),
    ).not.toBeInTheDocument();
    expectMissingCanonicalRouteTextAbsent();
  });

  it("does not show the generic loading screen once layout loading has resolved", () => {
    renderChatWithContext({
      threads: [],
      isLoading: false,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "partial",
      },
    });

    expect(screen.queryByText("Loading conversation…")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Please wait while we fetch your data."),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message zen/i)).toBeInTheDocument();
    expectMissingCanonicalRouteTextAbsent();
  });

  it("keeps the missing-thread composer disabled and does not create a thread on submit", async () => {
    const newThread = jest.fn();
    const reloadThreadMessages = jest.fn(() => Promise.resolve());

    renderChatWithContext({
      threads: [],
      isLoading: false,
      newThread,
      reloadThreadMessages,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "partial",
      },
    });

    await waitFor(() => {
      expect(reloadThreadMessages).toHaveBeenCalledWith("zen-001_chat_with_zen-001");
    });

    const textarea = screen.getByPlaceholderText(/message zen/i);
    const sendButton = screen.getByLabelText("Send message");
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "do not spawn a fallback" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    fireEvent.click(sendButton);

    expect(newThread).not.toHaveBeenCalled();
    expectMissingCanonicalRouteTextAbsent();
  });

  it.each([
    ["/app/chat/zen-001_chat_with_zen-001", /message zen/i],
    ["/app/chat/nova-001_chat_with_nova-001", /message nova/i],
  ])(
    "does not leak transcript or metadata text for missing canonical route %s",
    async (route, placeholderPattern) => {
      const reloadThreadMessages = jest.fn(() => Promise.resolve());

      renderChatWithContext({
        threads: [],
        isLoading: false,
        reloadThreadMessages,
        activeThreadHydration: {
          threadId: route.replace("/app/chat/", ""),
          status: "partial",
          hydrationSource: "index-fallback",
          hydrationComplete: false,
        },
      }, route);

      await waitFor(() => {
        expect(reloadThreadMessages).toHaveBeenCalledWith(route.replace("/app/chat/", ""));
      });

      expect(screen.getByPlaceholderText(placeholderPattern)).toBeInTheDocument();
      expectMissingCanonicalRouteTextAbsent();
    },
  );

  it("renders index preview messages without page-wide VVAULT copy", () => {
    renderChatWithContext({
      threads: [
        {
          id: "zen-001_chat_with_zen-001",
          title: "Zen",
          isIndexHydrated: true,
          messages: [{ id: "preview-1", role: "user", text: "preview", ts: Date.now() }],
        },
      ],
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "partial",
        hydrationSource: "index-fallback",
        hydrationComplete: false,
      },
    });

    expect(screen.getByText("preview")).toBeInTheDocument();
    expectMissingCanonicalRouteTextAbsent();
  });

  it("keeps the chat GUI visible and removes page-wide VVAULT copy on hydration error", () => {
    renderChatWithContext({
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "error",
        hydrationSource: "full",
        hydrationComplete: false,
      },
    });

    expect(screen.getByText("Zen is here.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message zen/i)).toBeInTheDocument();
    expectForbiddenChatDeadEndCopyAbsent();
  });

});
