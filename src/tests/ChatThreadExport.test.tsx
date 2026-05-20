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
const Chat = require("../pages/Chat").default;

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function buildLongThread() {
  return {
    id: "lin-001_chat_with_lin-001",
    title: "Lin",
    messages: Array.from({ length: 120 }, (_, index) => ({
      id: `msg-${index + 1}`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      text: `Visible slice message ${index + 1}`,
      ts: Date.now() - ((120 - index) * 1000),
    })),
  };
}

describe("Chat thread export entrypoint", () => {
  beforeAll(() => {
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: MockResizeObserver,
    });
  });

  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enabled: false }),
      text: async () => "",
    });
    URL.createObjectURL = jest.fn(() => "blob:thread-export");
    URL.revokeObjectURL = jest.fn();
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
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    jest.clearAllMocks();
  });

  it("shows all export actions and exports by thread id without reading a visible message slice", async () => {
    const thread = buildLongThread();
    let resolveExport!: (value: { blob: Blob; filename: string; contentType: string }) => void;
    const exportThreadTranscript = jest.fn(
      () =>
        new Promise<{ blob: Blob; filename: string; contentType: string }>((resolve) => {
          resolveExport = resolve;
        }),
    );

    render(
      <MemoryRouter
        initialEntries={["/app/chat/lin-001_chat_with_lin-001"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            element={
              <Outlet
                context={{
                  threads: [thread],
                  sendMessage: jest.fn(),
                  reloadThreadMessages: jest.fn(() => Promise.resolve()),
                  exportThreadTranscript,
                  updateMessageMetadata: jest.fn(),
                  newThread: jest.fn(),
                  navigate: jest.fn(),
                  sendingThreadId: null,
                  user: { id: "user-1" },
                  activeThreadHydration: {
                    threadId: thread.id,
                    status: "partial",
                  },
                }}
              />
            }
          >
            <Route path="/app/chat/:threadId" element={<Chat />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /open export menu/i }));

    expect(screen.getByRole("menuitem", { name: /export as markdown/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /export as pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /export as docx/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /export as markdown/i }));

    await waitFor(() => {
      expect(screen.getByText(/Preparing MD/i)).toBeInTheDocument();
    });

    expect(exportThreadTranscript).toHaveBeenCalledWith(
      "lin-001_chat_with_lin-001",
      "md",
    );

    resolveExport({
      blob: new Blob(["full canonical thread"], { type: "text/markdown" }),
      filename: "lin-transcript.md",
      contentType: "text/markdown",
    });

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});
