import {
  buildStableAddressBookContacts,
  compareAddressBookContacts,
  getCanonicalAddressBookThreadId,
  isAddressBookConstructPinned,
  isAddressBookConstructVisible,
  resolveAddressBookContactSelection,
} from "./addressBookContacts";

describe("address book contact visibility and order", () => {
  it("keeps exactly the three Chatty Address Book contacts visible", () => {
    expect(isAddressBookConstructVisible("nova-001")).toBe(true);
    expect(isAddressBookConstructVisible("sera-001")).toBe(true);
    expect(isAddressBookConstructVisible("katana-001")).toBe(true);
    expect(isAddressBookConstructVisible("zen-001")).toBe(false);
    expect(isAddressBookConstructVisible("lin-001")).toBe(false);
    expect(isAddressBookConstructVisible("val-001")).toBe(false);
    expect(isAddressBookConstructVisible("hydro-001")).toBe(false);
    expect(isAddressBookConstructVisible("synth")).toBe(false);
    expect(isAddressBookConstructVisible("synth-001")).toBe(false);
    expect(isAddressBookConstructVisible("db-override-test-001")).toBe(false);
    expect(isAddressBookConstructVisible("db-override-test-002")).toBe(false);
  });

  it("does not treat Hydro work-file paths as Address Book contacts", () => {
    expect(
      isAddressBookConstructVisible(
        "instances/hydro-001/code/chatty/Fix looping basic work.md",
      ),
    ).toBe(false);
    expect(isAddressBookConstructPinned("hydro-001")).toBe(false);
  });

  it("does not pin system, workbench, or contact rows in the Address Book", () => {
    expect(isAddressBookConstructPinned("zen-001")).toBe(false);
    expect(isAddressBookConstructPinned("lin-001")).toBe(false);
    expect(isAddressBookConstructPinned("val-001")).toBe(false);
    expect(isAddressBookConstructPinned("nova-001")).toBe(false);
    expect(isAddressBookConstructPinned("sera-001")).toBe(false);
    expect(isAddressBookConstructPinned("katana-001")).toBe(false);
  });

  it("uses stable contact order instead of recency shuffling", () => {
    const ordered = [
      { constructId: "katana-001", title: "Katana" },
      { constructId: "zen-001", title: "Zen" },
      { constructId: "val-001", title: "Val" },
      { constructId: "nova-001", title: "Nova" },
      { constructId: "lin-001", title: "Lin" },
      { constructId: "sera-001", title: "Sera" },
    ].sort(compareAddressBookContacts);

    expect(ordered.map((contact) => contact.constructId)).toEqual([
      "nova-001",
      "sera-001",
      "katana-001",
      "lin-001",
      "val-001",
      "zen-001",
    ]);
  });

  it("builds stable shell rows for all three contacts even when VVAULT only returns some records", () => {
    const contacts = buildStableAddressBookContacts({
      conversationThreads: [
        {
          id: "katana-001_chat_with_katana-001",
          title: "Chat with Katana",
          constructId: "katana-001",
          messages: [{ id: "katana-real" }],
          isIndexHydrated: false,
        },
        {
          id: "nova-001_chat_with_nova-001",
          title: "Chat with Nova",
          constructId: "nova-001",
          messages: [{ id: "nova-real" }],
          isIndexHydrated: false,
        },
      ],
    });

    expect(contacts.map((contact) => contact.title)).toEqual([
      "Nova",
      "Sera",
      "Katana",
    ]);
    expect(contacts.map((contact) => contact.constructId)).toEqual([
      "nova-001",
      "sera-001",
      "katana-001",
    ]);
    expect(contacts[1]).toMatchObject({
      id: "sera-001_chat_with_sera-001",
      messages: [],
      isIndexHydrated: true,
      addressBookSource: "shell",
      isAddressBookShell: true,
      avatar: null,
      avatarUrl: null,
    });
  });

  it("overlays GPT contact data only until a real VVAULT row exists", () => {
    const contacts = buildStableAddressBookContacts({
      conversationThreads: [
        {
          id: "nova-001_chat_with_nova-001",
          title: "Chat with Nova",
          constructId: "nova-001",
          avatar: "data:image/png;base64,nova",
          isIndexHydrated: false,
        },
      ],
      gptContactCards: [
        {
          id: "nova-001_contact",
          title: "Nova GPT",
          constructId: "nova-001",
          avatar: "data:image/png;base64,wrong-nova",
        },
        {
          id: "sera-001_contact",
          title: "Sera GPT",
          constructId: "sera-001",
          avatar: "data:image/png;base64,sera",
        },
      ],
    });

    expect(contacts).toHaveLength(3);
    expect(contacts[0]).toMatchObject({
      id: "nova-001_chat_with_nova-001",
      title: "Nova",
      avatar: "data:image/png;base64,nova",
      addressBookSource: "vvault",
      isAddressBookShell: false,
    });
    expect(contacts[1]).toMatchObject({
      id: "sera-001_chat_with_sera-001",
      title: "Sera",
      avatar: "data:image/png;base64,sera",
      addressBookSource: "gpt",
      isAddressBookShell: false,
      isIndexHydrated: true,
    });
  });

  it("preserves trusted same-construct backend avatar routes and explicit non-backend avatars", () => {
    const contacts = buildStableAddressBookContacts({
      conversationThreads: [
        {
          id: "nova-001_chat_with_nova-001",
          title: "Chat with Nova",
          constructId: "nova-001",
          avatar: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
          avatarUrl: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
        },
        {
          id: "katana-001_chat_with_katana-001",
          title: "Chat with Katana",
          constructId: "katana-001",
          avatarUrl: "https://example.test/katana.png",
        },
      ],
      gptContactCards: [
        {
          id: "sera-001_contact",
          title: "Sera GPT",
          constructId: "sera-001",
          avatar: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
          avatarUrl: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
        },
      ],
    });

    expect(contacts[0]).toMatchObject({
      constructId: "nova-001",
      avatar: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
      avatarUrl: "/api/ais/nova-001/avatar?v=vvault-identity-v2",
    });
    expect(contacts[1]).toMatchObject({
      constructId: "sera-001",
      avatar: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
      avatarUrl: "/api/ais/sera-001/avatar?v=vvault-identity-v2",
    });
    expect(contacts[2]).toMatchObject({
      constructId: "katana-001",
      avatar: "https://example.test/katana.png",
      avatarUrl: "https://example.test/katana.png",
    });
  });

  it("keeps Sera as a contact when her only avatar is a rejected generated placeholder", () => {
    const contacts = buildStableAddressBookContacts({
      gptContactCards: [
        {
          id: "sera-001_contact",
          title: "Sera GPT",
          constructId: "sera-001",
          avatar: "data:image/svg+xml;base64,PHN2Zy8+",
          avatarUrl: "/assets/avatars/sera.svg?v=generated",
        },
      ],
    });

    expect(contacts.map((contact) => contact.title)).toEqual([
      "Nova",
      "Sera",
      "Katana",
    ]);
    expect(contacts[1]).toMatchObject({
      id: "sera-001_chat_with_sera-001",
      constructId: "sera-001",
      title: "Sera",
      avatar: null,
      avatarUrl: null,
      addressBookSource: "gpt",
      isAddressBookShell: false,
    });
  });

  it("derives canonical Address Book route ids only for real Chatty contacts", () => {
    expect(getCanonicalAddressBookThreadId("nova-001")).toBe(
      "nova-001_chat_with_nova-001",
    );
    expect(getCanonicalAddressBookThreadId("zen-001")).toBeNull();
    expect(getCanonicalAddressBookThreadId("hydro-001")).toBeNull();
  });

  it("resolves Address Book selection only through eligible Chatty contacts", () => {
    expect(
      resolveAddressBookContactSelection({
        id: "sera-001_contact",
        constructId: "sera-001",
        title: "Sera GPT",
      }),
    ).toEqual({
      constructId: "sera-001",
      threadId: "sera-001_chat_with_sera-001",
      title: "Sera",
    });
    expect(
      resolveAddressBookContactSelection("katana-001_chat_with_katana-001"),
    ).toEqual({
      constructId: "katana-001",
      threadId: "katana-001_chat_with_katana-001",
      title: "Katana",
    });
    expect(resolveAddressBookContactSelection("hydro-001_contact")).toBeNull();
    expect(
      resolveAddressBookContactSelection(
        "instances/hydro-001/code/chatty/Fix looping basic work.md",
      ),
    ).toBeNull();
  });

  it("canonicalizes address book row ids from constructId to prevent stale VVAULT record id mismatches", () => {
    const contacts = buildStableAddressBookContacts({
      conversationThreads: [
        {
          id: "stale-vvault-uuid-1234",
          title: "Chat with Nova",
          constructId: "nova-001",
          messages: [{ id: "m1" }],
        },
        {
          id: "nova-001_chat_with_nova-001",
          title: "Chat with Katana",
          constructId: "katana-001",
          messages: [{ id: "m2" }],
        },
      ],
    });

    expect(contacts).toHaveLength(3);
    expect(contacts[0]).toMatchObject({
      id: "nova-001_chat_with_nova-001",
      constructId: "nova-001",
      title: "Nova",
      addressBookSource: "vvault",
      isAddressBookShell: false,
    });
    expect(contacts[1]).toMatchObject({
      id: "sera-001_chat_with_sera-001",
      constructId: "sera-001",
      title: "Sera",
      addressBookSource: "shell",
      isAddressBookShell: true,
    });
    expect(contacts[2]).toMatchObject({
      id: "katana-001_chat_with_katana-001",
      constructId: "katana-001",
      title: "Katana",
      addressBookSource: "vvault",
      isAddressBookShell: false,
    });
  });
});
