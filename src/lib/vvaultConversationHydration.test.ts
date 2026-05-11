import {
  buildRuntimeResumeAnchorFromTurnState,
  decodeRuntimeResumeAnchorParam,
  canBootstrapCanonicalThreadFromResponse,
  deriveRuntimeResumeAnchorFromTranscript,
  createIdleActiveConversationHydrationState,
  deriveActiveConversationHydrationState,
  deriveActiveConversationHydrationStateFromTranscript,
  findConversationByExactThreadId,
  findConversationForThreadId,
  getAddressBookHydrationModeFromResponse,
  isIncomingActiveThreadStrictlyBetter,
  normalizeConversationHydrationResponse,
  reconcileIncomingThreadsForActiveRoute,
  shouldBackfillActiveConversationFromTranscript,
  shouldAutoRefreshActiveConversation,
  shouldPreserveSnapshotAddressBookFromResponse,
  shouldReloadSparseActiveConversation,
  shouldShowAddressBookLoadErrorFromResponse,
} from "./vvaultConversationHydration";

describe("vvaultConversationHydration", () => {
  const makeThread = (
    id: string,
    timestamps: string[],
    options?: {
      isIndexHydrated?: boolean;
      prefix?: string;
    },
  ) => ({
    id,
    isIndexHydrated: options?.isIndexHydrated ?? false,
    messages: timestamps.map((timestamp, idx) => ({
      id: `${options?.prefix || id}-${idx}`,
      role: idx % 2 === 0 ? "user" : "assistant",
      text: `message-${idx}`,
      ts: Date.parse(timestamp),
      timestamp,
    })),
  });

  it("fails closed when hydration metadata is missing from a full response", () => {
    expect(
      normalizeConversationHydrationResponse({
        conversations: [{ sessionId: "nova-001_chat_with_nova-001" }],
      }),
    ).toEqual({
      conversations: [{ sessionId: "nova-001_chat_with_nova-001" }],
      hydrationSource: "empty-fallback",
      hydrationComplete: false,
    });
  });

  it("keeps omitted index hydration metadata partial", () => {
    expect(
      normalizeConversationHydrationResponse(
        {
          conversations: [{ sessionId: "nova-001_chat_with_nova-001" }],
        },
        "index",
      ),
    ).toEqual({
      conversations: [{ sessionId: "nova-001_chat_with_nova-001" }],
      hydrationSource: "index",
      hydrationComplete: false,
    });
  });

  it("treats index fallback as address-book authority but not active-thread readiness", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "nova-001_chat_with_nova-001",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        hydrationSource: "index-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(getAddressBookHydrationModeFromResponse(response)).toBe("index");
    expect(
      deriveActiveConversationHydrationState(
        response,
        "nova-001_chat_with_nova-001",
      ),
    ).toMatchObject({
      status: "partial",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "index-fallback",
      hydrationComplete: false,
    });
  });

  it("fails closed for empty fallback active-thread hydration", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [],
        hydrationSource: "empty-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(getAddressBookHydrationModeFromResponse(response)).toBe("none");
    expect(
      shouldPreserveSnapshotAddressBookFromResponse(response, {
        loadedConversationCount: 0,
        cachedThreadCount: 3,
      }),
    ).toBe(true);
    expect(
      deriveActiveConversationHydrationState(
        response,
        "nova-001_chat_with_nova-001",
      ),
    ).toMatchObject({
      status: "partial",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "empty-fallback",
      hydrationComplete: false,
    });
  });

  it("preserves snapshot contacts when degraded hydration would shrink a richer address book", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "nova-001_chat_with_nova-001",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        hydrationSource: "index-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(
      shouldPreserveSnapshotAddressBookFromResponse(response, {
        loadedConversationCount: 1,
        cachedThreadCount: 3,
      }),
    ).toBe(true);
  });

  it("does not preserve snapshot contacts when degraded hydration is not shrinking visible contacts", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "nova-001_chat_with_nova-001",
            constructId: "nova-001",
            title: "Nova",
          },
          {
            sessionId: "sera-001_chat_with_sera-001",
            constructId: "sera-001",
            title: "Sera",
          },
        ],
        hydrationSource: "index-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(
      shouldPreserveSnapshotAddressBookFromResponse(response, {
        loadedConversationCount: 2,
        cachedThreadCount: 2,
        visibleContactCount: 2,
      }),
    ).toBe(false);
  });

  it("preserves last-known visible contacts when incomplete hydration returns no rows", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [],
        hydrationSource: "index-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(
      shouldPreserveSnapshotAddressBookFromResponse(response, {
        loadedConversationCount: 0,
        cachedThreadCount: 0,
        visibleContactCount: 3,
      }),
    ).toBe(true);
  });

  it("does not preserve snapshot contacts for a healthy empty index response", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [],
        hydrationSource: "index",
        hydrationComplete: false,
      },
      "full",
    );

    expect(
      shouldPreserveSnapshotAddressBookFromResponse(response, {
        loadedConversationCount: 0,
        cachedThreadCount: 0,
        visibleContactCount: 3,
      }),
    ).toBe(false);
  });

  it("surfaces address-book load error only for degraded empty responses", () => {
    const degradedResponse = normalizeConversationHydrationResponse(
      {
        conversations: [],
        hydrationSource: "empty-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(
      shouldShowAddressBookLoadErrorFromResponse(degradedResponse, {
        loadedConversationCount: 0,
        cachedThreadCount: 0,
        visibleContactCount: 0,
      }),
    ).toBe(true);

    const healthyIndexResponse = normalizeConversationHydrationResponse(
      {
        conversations: [],
        hydrationSource: "index",
        hydrationComplete: false,
      },
      "full",
    );

    expect(
      shouldShowAddressBookLoadErrorFromResponse(healthyIndexResponse, {
        loadedConversationCount: 0,
        cachedThreadCount: 0,
        visibleContactCount: 0,
      }),
    ).toBe(false);
  });

  it("does not preserve last-known visible contacts after a complete empty hydration", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [],
        hydrationSource: "full",
        hydrationComplete: true,
      },
      "full",
    );

    expect(
      shouldPreserveSnapshotAddressBookFromResponse(response, {
        loadedConversationCount: 0,
        cachedThreadCount: 0,
        visibleContactCount: 3,
      }),
    ).toBe(false);
  });

  it("allows transcript backfill when active hydration is partial and the canonical transcript has messages", () => {
    expect(
      shouldBackfillActiveConversationFromTranscript({
        activeThreadHydration: { status: "partial" },
        transcriptMessages: [
          {
            id: "m1",
            role: "assistant",
            content: "Present, continuous, and here as Nova.",
          },
        ],
      }),
    ).toBe(true);
  });

  it("refuses transcript backfill when partial hydration has no canonical transcript body", () => {
    expect(
      shouldBackfillActiveConversationFromTranscript({
        activeThreadHydration: { status: "partial" },
        transcriptContent: "   ",
        transcriptMessages: [],
      }),
    ).toBe(false);
  });

  it("refuses transcript backfill after canonical hydration is already ready", () => {
    expect(
      shouldBackfillActiveConversationFromTranscript({
        activeThreadHydration: { status: "ready" },
        transcriptMessages: [{ id: "m1", role: "user", content: "hello" }],
      }),
    ).toBe(false);
  });

  it("requires the canonical thread to exist in a full payload before marking ready", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "nova-001_chat_with_nova-001",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        hydrationSource: "full",
        hydrationComplete: true,
      },
      "full",
    );

    expect(
      deriveActiveConversationHydrationState(
        response,
        "nova-001_chat_with_nova-001",
      ),
    ).toMatchObject({
      status: "ready",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "full",
      hydrationComplete: true,
    });
  });

  it("treats local deferred fallback as partial even when the canonical thread is present", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "zen-001_chat_with_zen-001",
            constructId: "zen-001",
            title: "Zen",
          },
        ],
        hydrationSource: "local-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(getAddressBookHydrationModeFromResponse(response)).toBe("none");
    expect(
      deriveActiveConversationHydrationState(
        response,
        "zen-001_chat_with_zen-001",
      ),
    ).toMatchObject({
      status: "partial",
      threadId: "zen-001_chat_with_zen-001",
      hydrationSource: "local-fallback",
      hydrationComplete: false,
    });
  });

  it("keeps local deferred missing-thread copy distinct from full remote hydration", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "zen-001_chat_with_zen-001",
            constructId: "zen-001",
            title: "Zen",
          },
        ],
        hydrationSource: "local-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(
      deriveActiveConversationHydrationState(
        response,
        "nova-001_chat_with_nova-001",
      ),
    ).toMatchObject({
      status: "partial",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "local-fallback",
      message:
        "Conversation loaded from a local deferred VVAULT fallback while remote persistence catches up.",
    });
  });

  it("does not allow startup bootstrap from partial hydration responses", () => {
    const partialResponse = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "nova-001_chat_with_nova-001",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        hydrationSource: "index-fallback",
        hydrationComplete: false,
      },
      "full",
    );

    expect(canBootstrapCanonicalThreadFromResponse(partialResponse)).toBe(false);

    const fullResponse = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "nova-001_chat_with_nova-001",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        hydrationSource: "full",
        hydrationComplete: true,
      },
      "full",
    );

    expect(canBootstrapCanonicalThreadFromResponse(fullResponse)).toBe(true);
  });

  it("matches canonical GPT thread ids by construct id", () => {
    expect(
      findConversationForThreadId(
        [
          {
            sessionId: "some-storage-id",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        "nova-001_chat_with_nova-001",
      ),
    ).toEqual({
      sessionId: "some-storage-id",
      constructId: "nova-001",
      title: "Nova",
    });
  });

  it("finds active-route conversations only by exact thread id when requested", () => {
    expect(
      findConversationByExactThreadId(
        [
          {
            sessionId: "some-storage-id",
            constructId: "nova-001",
            title: "Nova",
          },
          {
            sessionId: "nova-001_chat_with_nova-001",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        "nova-001_chat_with_nova-001",
      ),
    ).toEqual({
      sessionId: "nova-001_chat_with_nova-001",
      constructId: "nova-001",
      title: "Nova",
    });
  });

  it("does not mark active hydration ready from a construct-only soft match", () => {
    const response = normalizeConversationHydrationResponse(
      {
        conversations: [
          {
            sessionId: "some-storage-id",
            constructId: "nova-001",
            title: "Nova",
          },
        ],
        hydrationSource: "full",
        hydrationComplete: true,
      },
      "full",
    );

    expect(
      deriveActiveConversationHydrationState(
        response,
        "nova-001_chat_with_nova-001",
      ),
    ).toMatchObject({
      status: "missing",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "full",
      hydrationComplete: true,
    });
  });

  it("preserves a snapshot-seeded active thread against later degraded overwrite", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-20T12:00:00.000Z",
      "2026-04-03T12:00:00.000Z",
      "2026-04-11T12:00:00.000Z",
      "2026-04-18T12:00:00.000Z",
    ]);
    const incomingThread = makeThread(
      "nova-001_chat_with_nova-001",
      [
        "2026-02-14T12:00:00.000Z",
        "2026-03-01T12:00:00.000Z",
      ],
      { isIndexHydrated: true },
    );

    const reconciled = reconcileIncomingThreadsForActiveRoute({
      currentThreads: [currentThread, { id: "sera-001_chat_with_sera-001", messages: [] }],
      incomingThreads: [incomingThread, { id: "sera-001_chat_with_sera-001", messages: [] }],
      activeThreadId: "nova-001_chat_with_nova-001",
      incomingHydrationSource: "index-fallback",
      incomingHydrationComplete: false,
    });

    expect(reconciled[0]).toBe(currentThread);
  });

  it("blocks startup partial hydration from overwriting a better active exact-id thread", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-10T12:00:00.000Z",
      "2026-03-22T12:00:00.000Z",
      "2026-04-08T12:00:00.000Z",
    ]);
    const incomingThread = makeThread(
      "nova-001_chat_with_nova-001",
      ["2026-03-10T12:00:00.000Z", "2026-03-22T12:00:00.000Z"],
      { isIndexHydrated: true },
    );

    expect(
      isIncomingActiveThreadStrictlyBetter({
        currentThread,
        incomingThread,
        incomingHydrationSource: "local-fallback",
        incomingHydrationComplete: false,
      }),
    ).toBe(false);
  });

  it("allows startup full hydration to replace the active exact-id thread only when it is strictly better", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-01T12:00:00.000Z",
      "2026-03-03T12:00:00.000Z",
    ]);
    const incomingThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-01T12:00:00.000Z",
      "2026-03-03T12:00:00.000Z",
      "2026-03-12T12:00:00.000Z",
      "2026-04-04T12:00:00.000Z",
    ]);

    expect(
      isIncomingActiveThreadStrictlyBetter({
        currentThread,
        incomingThread,
        incomingHydrationSource: "full",
        incomingHydrationComplete: true,
      }),
    ).toBe(true);
  });

  it("lets a full VVAULT Zen thread replace stale active UI state even when stale state has a newer tail", () => {
    const staleUiThread = makeThread("zen-001_chat_with_zen-001", [
      "2026-05-05T12:00:00.000Z",
      "2026-05-07T12:00:00.000Z",
    ]);
    const canonicalBackendThread = makeThread("zen-001_chat_with_zen-001", [
      "2026-05-05T12:00:00.000Z",
      "2026-05-05T12:01:00.000Z",
    ]);

    const reconciled = reconcileIncomingThreadsForActiveRoute({
      currentThreads: [staleUiThread],
      incomingThreads: [canonicalBackendThread],
      activeThreadId: "zen-001_chat_with_zen-001",
      incomingHydrationSource: "full",
      incomingHydrationComplete: true,
    });

    expect(reconciled[0]).toBe(canonicalBackendThread);
    expect(reconciled[0].messages.at(-1)?.timestamp).toBe(
      "2026-05-05T12:01:00.000Z",
    );
  });

  it("preserves the active exact-id thread against degraded retry overwrite", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-15T12:00:00.000Z",
      "2026-03-26T12:00:00.000Z",
      "2026-04-02T12:00:00.000Z",
    ]);
    const incomingThread = makeThread(
      "nova-001_chat_with_nova-001",
      ["2026-03-15T12:00:00.000Z"],
      { isIndexHydrated: true },
    );

    expect(
      reconcileIncomingThreadsForActiveRoute({
        currentThreads: [currentThread],
        incomingThreads: [incomingThread],
        activeThreadId: "nova-001_chat_with_nova-001",
        incomingHydrationSource: "index",
        incomingHydrationComplete: false,
      })[0],
    ).toBe(currentThread);
  });

  it("preserves the active exact-id thread against force refresh fallback overwrite", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-20T12:00:00.000Z",
      "2026-04-01T12:00:00.000Z",
      "2026-04-12T12:00:00.000Z",
    ]);

    expect(
      reconcileIncomingThreadsForActiveRoute({
        currentThreads: [currentThread],
        incomingThreads: [],
        activeThreadId: "nova-001_chat_with_nova-001",
        incomingHydrationComplete: false,
      })[0],
    ).toBe(currentThread);
  });

  it("preserves the active exact-id thread when auto-refresh returns a degraded empty list", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-20T12:00:00.000Z",
      "2026-04-07T12:00:00.000Z",
    ]);

    expect(
      reconcileIncomingThreadsForActiveRoute({
        currentThreads: [currentThread],
        incomingThreads: [],
        activeThreadId: "nova-001_chat_with_nova-001",
        incomingHydrationSource: "empty-fallback",
        incomingHydrationComplete: false,
      })[0],
    ).toBe(currentThread);
  });

  it("preserves the active exact-id thread when only a soft-match candidate arrives", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-20T12:00:00.000Z",
      "2026-04-09T12:00:00.000Z",
    ]);
    const softMatchedThread = makeThread("some-storage-id", [
      "2026-04-10T12:00:00.000Z",
    ]);
    (softMatchedThread as any).constructId = "nova-001";

    expect(
      reconcileIncomingThreadsForActiveRoute({
        currentThreads: [currentThread],
        incomingThreads: [softMatchedThread],
        activeThreadId: "nova-001_chat_with_nova-001",
        incomingHydrationSource: "full",
        incomingHydrationComplete: true,
      })[0],
    ).toBe(currentThread);
  });

  it("treats clearly interleaved backward chronology as lower trust even when hydration claims full", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-20T12:00:00.000Z",
      "2026-03-27T12:00:00.000Z",
      "2026-04-05T12:00:00.000Z",
      "2026-04-12T12:00:00.000Z",
    ]);
    const incomingThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-20T12:00:00.000Z",
      "2026-04-05T12:00:00.000Z",
      "2026-02-14T12:00:00.000Z",
      "2026-04-12T12:00:00.000Z",
    ]);

    expect(
      isIncomingActiveThreadStrictlyBetter({
        currentThread,
        incomingThread,
        incomingHydrationSource: "full",
        incomingHydrationComplete: true,
      }),
    ).toBe(false);
  });

  it("backfills safe older history from a fuller exact-id thread while preserving the current clean tail", () => {
    const currentThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-03-20T12:00:00.000Z",
      "2026-04-05T12:00:00.000Z",
      "2026-04-12T12:00:00.000Z",
      "2026-04-18T12:00:00.000Z",
    ]);
    const incomingThread = makeThread("nova-001_chat_with_nova-001", [
      "2026-02-01T12:00:00.000Z",
      "2026-02-14T12:00:00.000Z",
      "2026-03-20T12:00:00.000Z",
      "2026-04-05T12:00:00.000Z",
      "2026-02-14T18:00:00.000Z",
      "2026-04-12T12:00:00.000Z",
      "2026-04-18T12:00:00.000Z",
    ]);

    const reconciled = reconcileIncomingThreadsForActiveRoute({
      currentThreads: [currentThread],
      incomingThreads: [incomingThread],
      activeThreadId: "nova-001_chat_with_nova-001",
      incomingHydrationSource: "full",
      incomingHydrationComplete: true,
    });

    expect(reconciled[0].messages).toHaveLength(7);
    expect(reconciled[0].messages.slice(-4)).toEqual(currentThread.messages);
    expect(reconciled[0].messages[0]?.timestamp).toBe("2026-02-01T12:00:00.000Z");
    expect(reconciled[0].messages[1]?.timestamp).toBe("2026-02-14T12:00:00.000Z");
    expect(reconciled[0].messages[2]?.timestamp).toBe("2026-02-14T18:00:00.000Z");
  });

  it("creates an idle hydration state when no active route exists", () => {
    expect(createIdleActiveConversationHydrationState()).toEqual({
      status: "idle",
      threadId: null,
      hydrationSource: null,
      hydrationComplete: false,
    });
  });

  it("treats canonical transcript payloads as ready active-thread hydration", () => {
    expect(
      deriveActiveConversationHydrationStateFromTranscript({
        threadId: "nova-001_chat_with_nova-001",
        transcriptSource: "canonical-transcript",
        transcriptMessages: [
          {
            id: "m1",
            role: "assistant",
            content: "hello",
            timestamp: "2026-04-26T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      status: "ready",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "full",
      hydrationComplete: true,
    });
  });

  it("treats local deferred transcript payloads as ready but degraded hydration", () => {
    expect(
      deriveActiveConversationHydrationStateFromTranscript({
        threadId: "nova-001_chat_with_nova-001",
        transcriptSource: "local-deferred",
        transcriptMessages: [
          {
            id: "m1",
            role: "assistant",
            content: "hello",
            timestamp: "2026-04-26T00:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      status: "ready",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "local-fallback",
      hydrationComplete: false,
    });
  });

  it("treats empty transcript payloads as missing active-thread hydration", () => {
    expect(
      deriveActiveConversationHydrationStateFromTranscript({
        threadId: "nova-001_chat_with_nova-001",
        transcriptSource: "empty",
        transcriptMessages: [],
        transcriptContent: "",
      }),
    ).toMatchObject({
      status: "missing",
      threadId: "nova-001_chat_with_nova-001",
      hydrationSource: "empty-fallback",
      hydrationComplete: false,
    });
  });

  describe("shouldAutoRefreshActiveConversation", () => {
    const baseOptions = {
      pathname: "/app/chat/nova-001_chat_with_nova-001",
      activeId: "nova-001_chat_with_nova-001",
      conversationHydrationMode: "snapshot" as const,
      activeThreadHydration: createIdleActiveConversationHydrationState(),
      forceRefreshInFlight: false,
      vvaultFailureClassification: null,
    };

    it("rejects non-chat routes", () => {
      expect(
        shouldAutoRefreshActiveConversation({
          ...baseOptions,
          pathname: "/",
        }),
      ).toBe(false);
    });

    it("rejects a bare /app/chat shell without a concrete thread id", () => {
      expect(
        shouldAutoRefreshActiveConversation({
          ...baseOptions,
          pathname: "/app/chat",
        }),
      ).toBe(false);
    });

    it("rejects when there is no resolved active thread id", () => {
      expect(
        shouldAutoRefreshActiveConversation({
          ...baseOptions,
          activeId: null,
        }),
      ).toBe(false);
    });

    it("rejects while the active thread hydration is loading", () => {
      expect(
        shouldAutoRefreshActiveConversation({
          ...baseOptions,
          activeThreadHydration: {
            status: "loading",
          },
        }),
      ).toBe(false);
    });

    it.each(["partial", "missing", "error"] as const)(
      "allows exact-thread recovery while the active thread hydration is %s",
      (status) => {
        expect(
          shouldAutoRefreshActiveConversation({
            ...baseOptions,
            activeThreadHydration: {
              status,
            },
          }),
        ).toBe(true);
      },
    );

    it("rejects while a force refresh is already in flight", () => {
      expect(
        shouldAutoRefreshActiveConversation({
          ...baseOptions,
          forceRefreshInFlight: true,
        }),
      ).toBe(false);
    });

    it.each(["auth-needed", "bridge-misconfigured"] as const)(
      "rejects when the failure classification is %s",
      (classification) => {
        expect(
          shouldAutoRefreshActiveConversation({
            ...baseOptions,
            vvaultFailureClassification: classification,
          }),
        ).toBe(false);
      },
    );

    it.each([null, "unreachable"] as const)(
      "allows one degraded auto-refresh when failure classification is %s",
      (classification) => {
        expect(
          shouldAutoRefreshActiveConversation({
            ...baseOptions,
            vvaultFailureClassification: classification,
          }),
        ).toBe(true);
      },
    );
  });

  describe("shouldReloadSparseActiveConversation", () => {
    it("rejects reload while active hydration is still loading", () => {
      expect(
        shouldReloadSparseActiveConversation({
          thread: {
            messages: [],
            isIndexHydrated: true,
          },
          activeThreadHydration: { status: "loading" },
          isReloading: false,
          reloadAttempted: false,
        }),
      ).toBe(false);
    });

    it("allows one sparse reload while active hydration is partial", () => {
      expect(
        shouldReloadSparseActiveConversation({
          thread: {
            messages: [],
            isIndexHydrated: true,
          },
          activeThreadHydration: { status: "partial" },
          isReloading: false,
          reloadAttempted: false,
        }),
      ).toBe(true);
    });

    it.each(["ready", "missing", "error"] as const)(
      "allows one sparse reload when active hydration is %s",
      (status) => {
        expect(
          shouldReloadSparseActiveConversation({
            thread: {
              messages: [],
              isIndexHydrated: true,
            },
            activeThreadHydration: { status },
            isReloading: false,
            reloadAttempted: false,
          }),
        ).toBe(true);
      },
    );

    it("rejects a second sparse reload attempt for the same thread state", () => {
      expect(
        shouldReloadSparseActiveConversation({
          thread: {
            messages: [],
            isIndexHydrated: true,
          },
          activeThreadHydration: { status: "ready" },
          isReloading: false,
          reloadAttempted: true,
        }),
      ).toBe(false);
    });

    it("rejects reload when a full thread is already present", () => {
      expect(
        shouldReloadSparseActiveConversation({
          thread: {
            messages: [{ id: "m1" }],
            isIndexHydrated: false,
          },
          activeThreadHydration: { status: "ready" },
          isReloading: false,
          reloadAttempted: false,
        }),
      ).toBe(false);
    });
  });

  describe("runtime continuity anchors", () => {
    it("derives a resume anchor from the latest hydrated assistant tail", () => {
      const anchor = deriveRuntimeResumeAnchorFromTranscript({
        threadId: "zen-001_chat_with_zen-001",
        hydrationSource: "full",
        hydrationComplete: true,
        transcriptMessages: [
          {
            role: "assistant",
            metadata: {
              runtimeTurnState: {
                constructId: "zen-001",
                constructRevision: "construct-runtime-v1:zen-001",
                continuitySeq: 18,
                assistantTurnId: "rt_18_tail",
                tailHash: "abc123def456",
                hydrationTruth: "full",
              },
            },
          },
        ],
      });

      expect(anchor).toEqual({
        v: 1,
        sourceSeat: "chatty",
        constructId: "zen-001",
        constructRevision: "construct-runtime-v1:zen-001",
        threadId: "zen-001_chat_with_zen-001",
        continuitySeq: 18,
        assistantTurnId: "rt_18_tail",
        tailHash: "abc123def456",
        hydrationTruth: "full",
        issuedAt: expect.any(String),
      });
    });

    it("fails closed when hydration stayed degraded", () => {
      expect(
        deriveRuntimeResumeAnchorFromTranscript({
          threadId: "zen-001_chat_with_zen-001",
          hydrationSource: "local-fallback",
          hydrationComplete: false,
          transcriptMessages: [
            {
              role: "assistant",
              metadata: {
                runtimeTurnState: {
                  constructId: "zen-001",
                  constructRevision: "construct-runtime-v1:zen-001",
                  continuitySeq: 18,
                  assistantTurnId: "rt_18_tail",
                  tailHash: "abc123def456",
                  hydrationTruth: "full",
                },
              },
            },
          ],
        }),
      ).toBeNull();
    });

    it("decodes a base64url resume token and normalizes it", () => {
      const raw = JSON.stringify({
        v: 1,
        sourceSeat: "codex",
        constructId: "zen-001",
        constructRevision: "construct-runtime-v1:zen-001",
        threadId: "zen-001_chat_with_zen-001",
        continuitySeq: 9,
        assistantTurnId: "rt_9_tail",
        tailHash: "deadbeefcafefeed",
        hydrationTruth: "full",
        issuedAt: "2026-05-08T12:00:00.000Z",
      });
      const encoded = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

      expect(decodeRuntimeResumeAnchorParam(encoded)).toEqual({
        v: 1,
        sourceSeat: "codex",
        constructId: "zen-001",
        constructRevision: "construct-runtime-v1:zen-001",
        threadId: "zen-001_chat_with_zen-001",
        continuitySeq: 9,
        assistantTurnId: "rt_9_tail",
        tailHash: "deadbeefcafefeed",
        hydrationTruth: "full",
        issuedAt: "2026-05-08T12:00:00.000Z",
      });
    });

    it("builds a local chatty resume anchor from a runtime turn state packet", () => {
      expect(
        buildRuntimeResumeAnchorFromTurnState({
          threadId: "zen-001_chat_with_zen-001",
          runtimeTurnState: {
            constructId: "zen-001",
            constructRevision: "construct-runtime-v1:zen-001",
            continuitySeq: 22,
            assistantTurnId: "rt_22_tail",
            tailHash: "feedface12345678",
            hydrationTruth: "full",
          },
        }),
      ).toEqual({
        v: 1,
        sourceSeat: "chatty",
        constructId: "zen-001",
        constructRevision: "construct-runtime-v1:zen-001",
        threadId: "zen-001_chat_with_zen-001",
        continuitySeq: 22,
        assistantTurnId: "rt_22_tail",
        tailHash: "feedface12345678",
        hydrationTruth: "full",
        issuedAt: expect.any(String),
      });
    });
  });
});
