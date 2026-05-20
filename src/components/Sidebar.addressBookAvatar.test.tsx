import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "./Sidebar";

jest.mock("../lib/ThemeContext", () => ({
  useTheme: () => ({
    actualTheme: "light",
    activeThemeScript: null,
  }),
}));

jest.mock("@assets/stars/litChatty_star.svg", () => "lit-star.svg", { virtual: true });
jest.mock("@assets/stars/moonChatty_star.svg", () => "moon-star.svg", { virtual: true });
jest.mock("@assets/stars/luckyChatty_star.svg", () => "lucky-star.svg", { virtual: true });
jest.mock("@assets/stars/chatty_star.png", () => "chatty-star.png", { virtual: true });
jest.mock("../../assets/icons/simforge_day.svg?url", () => "simforge-day.svg", { virtual: true });
jest.mock("../../assets/icons/simforge_night.svg?url", () => "simforge-night.svg", { virtual: true });

function renderSidebar(conversations: any[]) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Sidebar
        conversations={conversations}
        threads={[]}
        currentConversationId="sera-001_contact"
        onConversationSelect={() => {}}
        onNewConversationWithGPT={() => {}}
        onDeleteConversation={() => {}}
        onRenameConversation={() => {}}
        onOpenLibrary={() => {}}
        onOpenSearch={() => {}}
        onShowSettings={() => {}}
        currentUser={{ name: "Devon Woodson", plan: "Plus" }}
      />
    </MemoryRouter>,
  );
}

describe("Sidebar address book avatars", () => {
  it("renders provided avatars without inventing canonical routes for any row", () => {
    const novaAvatar = "data:image/svg+xml;base64,bm92YQ==";
    const html = renderSidebar([
      {
        id: "nova-001_contact",
        title: "Nova",
        messages: [],
        createdAt: "",
        updatedAt: "",
        constructId: "nova-001",
        avatar: novaAvatar,
      },
      {
        id: "sera-001_contact",
        title: "Sera",
        messages: [],
        createdAt: "",
        updatedAt: "",
        constructId: "sera-001",
        avatar: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
      },
      {
        id: "katana-001_contact",
        title: "Katana",
        messages: [],
        createdAt: "",
        updatedAt: "",
        constructId: "katana-001",
      },
      {
        id: "val-001_contact",
        title: "Val",
        messages: [],
        createdAt: "",
        updatedAt: "",
        constructId: "val-001",
      },
      {
        id: "hydro-001_contact",
        title: "Hydro",
        messages: [],
        createdAt: "",
        updatedAt: "",
        constructId: "hydro-001",
      },
    ]);

    expect(html).toContain(`src="${novaAvatar}"`);
    expect(html).toContain('src="/api/ais/sera-001/avatar?v=vvault-identity-v2"');
    expect(html).not.toContain("/api/ais/nova-001/avatar");
    expect(html).not.toContain("/api/ais/katana-001/avatar");
    expect(html).not.toContain("/api/ais/val-001/avatar");
    expect(html).not.toContain("/api/ais/hydro-001/avatar");
    expect(html).toContain("Katana");
    expect(html).toContain("Val");
    expect(html).toContain("Hydro");
    expect(html).not.toContain("lucide-image-off");
    expect(html).toContain(">K</div>");
    expect(html).toContain(">V</div>");
    expect(html).toContain(">H</div>");
  });

  it("renders the normalized avatar field when only avatarUrl survives hydration", () => {
    const html = renderSidebar([
      {
        id: "nova-001_contact",
        title: "Nova",
        messages: [],
        createdAt: "",
        updatedAt: "",
        constructId: "nova-001",
        avatar: "avatar",
        avatarUrl: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
      },
    ]);

    expect(html).toContain('src="/api/ais/nova-001/avatar?v=vvault-identity-v2"');
  });

  it("renders trusted same-construct backend avatars after Layout normalization", () => {
    const html = renderSidebar(
      ["sera-001", "nova-001", "katana-001", "hydro-001"].map((constructId) => ({
        id: `${constructId}_contact`,
        title: constructId,
        messages: [],
        createdAt: "",
        updatedAt: "",
        constructId,
        avatar: `/api/ais/${constructId}/avatar?v=vvault-identity-v2`,
        avatarUrl: `/api/ais/${constructId}/avatar?v=vvault-identity-v2`,
      })),
    );

    expect(html).toContain('src="/api/ais/sera-001/avatar?v=vvault-identity-v2"');
    expect(html).toContain('src="/api/ais/nova-001/avatar?v=vvault-identity-v2"');
    expect(html).toContain('src="/api/ais/katana-001/avatar?v=vvault-identity-v2"');
    expect(html).toContain('src="/api/ais/hydro-001/avatar?v=vvault-identity-v2"');
  });

  it("keeps unfinished navigation surfaces hidden in the public MVP sidebar", () => {
    const html = renderSidebar([]);

    expect(html).not.toContain("Finance");
    expect(html).not.toContain("Get More");
    expect(html).not.toContain("Zen");
    expect(html).not.toContain("Lin");
    expect(html).not.toContain("Val");
    expect(html).toContain("Continuity");
    expect(html).toContain("simForge");
    expect(html).toContain("Library");
  });
});
