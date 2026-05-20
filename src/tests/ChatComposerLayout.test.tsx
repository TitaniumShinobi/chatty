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

// Load Chat only after the mocks above are registered.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Chat = require("../pages/Chat").default;

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const originalScrollTo = HTMLElement.prototype.scrollTo;
const consoleError = console.error;
const consoleWarn = console.warn;
const actWarning = /not wrapped in act|ReactDOMTestUtils\.act/i;
const markdownMockWarnings = /React does not recognize the `(remarkPlugins|rehypePlugins)` prop/i;
const routerFutureWarnings = /React Router Future Flag Warning/i;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function renderChat() {
  const thread = {
    id: "thread-1",
    title: "Thread 1",
    messages: [
      { id: "user-1", role: "user" as const, text: "Hello", ts: Date.now() - 1_000 },
      {
        id: "assistant-1",
        role: "assistant" as const,
        packets: [{ op: "answer.v1", payload: { content: "Hi there" } }],
        ts: Date.now(),
      },
    ],
  };

  const outletContext = {
    threads: [thread],
    sendMessage: jest.fn(),
    reloadThreadMessages: jest.fn(() => Promise.resolve()),
    updateMessageMetadata: jest.fn(),
    newThread: jest.fn(),
    navigate: jest.fn(),
    sendingThreadId: null,
    user: null,
  };

  return render(
    <MemoryRouter
      initialEntries={["/app/chat/thread-1"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route element={<Outlet context={outletContext} />}>
          <Route path="/app/chat/:threadId" element={<Chat />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Chat composer footer layout", () => {
  let scrollToMock: jest.Mock;

  beforeAll(() => {
    console.error = (...args: any[]) => {
      const combined = args.map(String).join(" ");
      if (actWarning.test(combined)) return;
      if (markdownMockWarnings.test(combined)) return;
      // @ts-ignore
      return consoleError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const combined = args.map(String).join(" ");
      if (routerFutureWarnings.test(combined)) return;
      // @ts-ignore
      return consoleWarn.apply(console, args);
    };

    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: MockResizeObserver,
    });
  });

  afterAll(() => {
    console.error = consoleError;
    console.warn = consoleWarn;
  });

  beforeEach(() => {
    scrollToMock = jest.fn();
    HTMLElement.prototype.scrollTo = scrollToMock;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enabled: false }),
      text: async () => "",
    });

    HTMLElement.prototype.getBoundingClientRect = function mockRect() {
      if (this.getAttribute("data-testid") === "chat-composer-footer") {
        return {
          width: 320,
          height: 60,
          top: 0,
          right: 320,
          bottom: 60,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        width: 320,
        height: 24,
        top: 0,
        right: 320,
        bottom: 24,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    HTMLElement.prototype.scrollTo = originalScrollTo;
    jest.clearAllMocks();
  });

  it("keeps the composer footer outside the scroller and sizes the spacer from the measured footer height", async () => {
    renderChat();

    const scroller = screen.getByTestId("chat-message-scroller");
    const footer = screen.getByTestId("chat-composer-footer");
    const spacer = screen.getByTestId("chat-footer-spacer");

    expect(scroller.className).toContain("overflow-auto");
    expect(footer.className).toContain("absolute");
    expect(footer.className).toContain("pointer-events-none");
    expect(scroller).not.toContainElement(footer);
    expect(scroller).toContainElement(spacer);
    expect(screen.queryByText(/Chatty can make mistakes/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(spacer).toHaveStyle({ height: "68px" });
    });

    fireEvent.scroll(scroller, { target: { scrollTop: 120 } });
    expect(screen.getByTestId("chat-composer-footer")).toBeInTheDocument();
  });

  it("anchors a loaded conversation to the bottom on thread switch instead of leaving a dead spacer gap", async () => {
    renderChat();

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: "auto",
        }),
      );
    });
  });
});
