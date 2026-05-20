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

function renderChatWithContext(overrides: Record<string, unknown> = {}) {
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
        initialEntries={["/app/chat/zen-001_chat_with_zen-001"]}
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

  it("shows the generic loading screen only while layout loading is still in progress", () => {
    renderChatWithContext({
      threads: [],
      isLoading: true,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "loading",
      },
    });

    expect(screen.getByText("Loading conversation…")).toBeInTheDocument();
    expect(
      screen.getByText("Please wait while we fetch your data."),
    ).toBeInTheDocument();
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
  });

  it("shows bounded canonical status instead of a Go Home dead end when the thread is absent", () => {
    renderChatWithContext({
      threads: [],
      isLoading: false,
      activeThreadHydration: {
        threadId: "zen-001_chat_with_zen-001",
        status: "partial",
      },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      /Zen transcript unavailable/i,
    );
    expect(screen.queryByText("Go Home")).not.toBeInTheDocument();
    expect(screen.queryByText("Thread not found")).not.toBeInTheDocument();
  });

  it("renders a bounded VVAULT index status without hiding the preview messages", () => {
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

    expect(screen.getByRole("status")).toHaveTextContent(/VVAULT index preview/i);
    expect(screen.getByText("preview")).toBeInTheDocument();
  });
});
