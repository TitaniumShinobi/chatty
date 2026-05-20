/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useOutletContext } from "react-router-dom";

import Layout from "./Layout";

const mockFetchMe = jest.fn();
const mockLogout = jest.fn();
const mockGetUserId = jest.fn(() => "user-1");
const mockGetAllAIs = jest.fn();
const mockBootstrapConstructs = jest.fn();
const mockWaitForBackendReady = jest.fn();
const mockLoadAllConversationsResponse = jest.fn();
const mockCreateConversation = jest.fn();
const mockSaveUserConversations = jest.fn();
const mockClearUserData = jest.fn();

jest.mock("../lib/messageRecovery", () => ({}));

jest.mock("../lib/clientEnv", () => ({
  getClientEnvValue: jest.fn(() => ""),
  isClientDevEnv: jest.fn(() => false),
}));

jest.mock("../lib/auth", () => ({
  fetchMe: (...args: unknown[]) => mockFetchMe(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}));

jest.mock("../lib/vvaultConversationManager", () => ({
  VVAULTConversationManager: {
    getInstance: () => ({
      loadAllConversationsResponse: mockLoadAllConversationsResponse,
      createConversation: mockCreateConversation,
      saveUserConversations: mockSaveUserConversations,
      clearUserData: mockClearUserData,
    }),
  },
}));

jest.mock("../lib/aiService", () => ({
  AIService: {
    getInstance: () => ({
      getAllAIs: mockGetAllAIs,
    }),
  },
}));

jest.mock("../lib/masterScripts", () => ({
  bootstrapConstructs: (...args: unknown[]) => mockBootstrapConstructs(...args),
}));

jest.mock("../lib/backendReady", () => ({
  waitForBackendReady: (...args: unknown[]) => mockWaitForBackendReady(...args),
}));

jest.mock("../lib/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("../context/SettingsContext", () => ({
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSettings: () => ({
    settings: {
      security: { screenTimeout: 0 },
      general: {},
    },
  }),
}));

jest.mock("../hooks/useIdleTimeout", () => ({
  useIdleTimeout: jest.fn(),
}));

jest.mock("../hooks/useZenGuidance", () => ({
  useZenGuidance: () => ({
    currentStep: null,
    currentStepIndex: 0,
    totalSteps: 0,
    isVisible: false,
    nextStep: jest.fn(),
    previousStep: jest.fn(),
    hide: jest.fn(),
  }),
}));

jest.mock("./Sidebar", () => ({
  __esModule: true,
  default: ({
    conversations = [],
    isVVAULTConnected,
  }: {
    conversations?: Array<{ title?: string }>;
    isVVAULTConnected: boolean;
  }) => (
    <aside
      data-testid="layout-sidebar"
      data-vvault-connected={String(isVVAULTConnected)}
      data-conversation-titles={conversations
        .map((conversation) => conversation.title || "")
        .join("|")}
    />
  ),
}));

jest.mock("./SearchPopup", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("./SettingsModal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("./ProjectsModal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("./ShareConversationModal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("./StorageFailureFallback", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("./ZenGuidance", () => ({
  __esModule: true,
  default: () => null,
}));

type LayoutProbeContext = {
  threads: Array<unknown>;
  addressBookContacts?: Array<{ title?: string; constructId?: string | null }>;
  user: { email?: string } | null;
  activeThreadHydration?: {
    status?: string;
    message?: string;
  };
};

function LayoutProbe() {
  const context = useOutletContext<LayoutProbeContext>();

  return (
    <section data-testid="layout-gui-probe">
      <span data-testid="layout-user-email">{context.user?.email || ""}</span>
      <span data-testid="layout-thread-count">{context.threads.length}</span>
      <span data-testid="layout-address-book-count">
        {context.addressBookContacts?.length || 0}
      </span>
      <span data-testid="layout-address-book-titles">
        {(context.addressBookContacts || [])
          .map((contact) => contact.title || contact.constructId || "")
          .join("|")}
      </span>
      <span data-testid="layout-active-hydration-status">
        {context.activeThreadHydration?.status || ""}
      </span>
      <span data-testid="layout-active-hydration-message">
        {context.activeThreadHydration?.message || ""}
      </span>
    </section>
  );
}

function renderLayout() {
  return render(
    <MemoryRouter
      initialEntries={["/app/chat/zen-001_chat_with_zen-001"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/app" element={<Layout />}>
          <Route path="chat/:threadId" element={<LayoutProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout VVAULT GUI error behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetchMe.mockResolvedValue({
      id: "user-1",
      sub: "user-1",
      email: "devon@example.com",
    });
    mockGetAllAIs.mockResolvedValue([]);
    mockBootstrapConstructs.mockResolvedValue({ success: true, errors: [] });
    mockWaitForBackendReady.mockResolvedValue(undefined);
    mockLoadAllConversationsResponse.mockResolvedValue({ conversations: [] });
    mockCreateConversation.mockResolvedValue({
      id: "zen-001_chat_with_zen-001",
      title: "Zen",
      messages: [],
    });
    mockSaveUserConversations.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["401 Unauthorized", "VVAULT API error: 401 Unauthorized - Authentication required"],
    [
      "503 Service Unavailable",
      "VVAULT API error: 503 Service Unavailable - AUTH_BRIDGE_MISCONFIGURED",
    ],
  ])(
    "keeps the shell visible when VVAULT conversations fail with %s",
    async (_label, expectedMessage) => {
      mockLoadAllConversationsResponse.mockRejectedValueOnce(
        new Error(expectedMessage),
      );

      renderLayout();

      await waitFor(() => {
        expect(mockLoadAllConversationsResponse).toHaveBeenCalledWith(
          "devon@example.com",
        );
      });

      expect(await screen.findByTestId("layout-gui-probe")).toBeInTheDocument();
      expect(screen.getByTestId("layout-user-email")).toHaveTextContent(
        "devon@example.com",
      );
      expect(screen.getByTestId("layout-thread-count")).toHaveTextContent("0");

      await waitFor(() => {
        expect(screen.getByTestId("layout-sidebar")).toHaveAttribute(
          "data-vvault-connected",
          "false",
        );
      });

      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(document.body).not.toHaveTextContent(
        /Connecting to VVAULT|VVAULT authentication required|VVAULT unavailable|VVAULT auth required|Canonical VVAULT read\/write is blocked/i,
      );
    },
  );

  it("hydrates exactly the three Chatty Address Book contacts from VVAULT records", async () => {
    mockLoadAllConversationsResponse.mockResolvedValueOnce({
      conversations: [
        {
          sessionId: "zen-001_chat_with_zen-001",
          title: "Chat with Zen",
          constructId: "zen-001",
          messages: [],
        },
        {
          sessionId: "lin-001_chat_with_lin-001",
          title: "Chat with Lin",
          constructId: "lin-001",
          messages: [],
        },
        {
          sessionId: "val-001_chat_with_val-001",
          title: "Chat with Val",
          constructId: "val-001",
          messages: [],
        },
        {
          sessionId: "hydro-001_chatty_hydro_chat",
          title: "Hydro Ask - chatty",
          constructId: "hydro-001",
          messages: [],
        },
        {
          sessionId: "nova-001_chat_with_nova-001",
          title: "Chat with Nova",
          constructId: "nova-001",
          messages: [],
        },
        {
          sessionId: "sera-001_chat_with_sera-001",
          title: "Chat with Sera",
          constructId: "sera-001",
          messages: [],
        },
        {
          sessionId: "katana-001_chat_with_katana-001",
          title: "Chat with Katana",
          constructId: "katana-001",
          messages: [],
        },
      ],
    });

    renderLayout();

    expect(await screen.findByTestId("layout-gui-probe")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("layout-address-book-count")).toHaveTextContent(
        "3",
      );
    });

    expect(screen.getByTestId("layout-address-book-count")).toHaveTextContent(
      "3",
    );
    expect(screen.getByTestId("layout-address-book-titles")).toHaveTextContent(
      "Nova|Sera|Katana",
    );
    expect(screen.getByTestId("layout-sidebar")).toHaveAttribute(
      "data-conversation-titles",
      "Nova|Sera|Katana",
    );
  });

  it("keeps the app-level Diagnosis control available in the signed-in shell", async () => {
    renderLayout();

    expect(await screen.findByTestId("layout-gui-probe")).toBeInTheDocument();
    expect(screen.getByTestId("app-diagnosis-control")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Show Diagnosis"));

    expect(screen.getByTestId("orchestration-inspector")).toBeInTheDocument();
    expect(screen.getByText("Chat page checklist")).toBeInTheDocument();
    expect(screen.getByLabelText("Hide Diagnosis")).toBeInTheDocument();
  });
});
