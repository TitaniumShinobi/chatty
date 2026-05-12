import { getPageDiagnosisChecklist } from "./pageDiagnosisChecklist";

describe("getPageDiagnosisChecklist", () => {
  it("keeps Chat route definitions and runtime receipts in the same page checklist", () => {
    const checklist = getPageDiagnosisChecklist({
      pathname: "/app/chat/nova-001_chat_with_nova-001",
      activeThread: {
        id: "nova-001_chat_with_nova-001",
        constructId: "nova-001",
        providerName: "openrouter",
        modelId: "gpt-4",
        isFallback: false,
        hydrationSource: "full",
        hydrationStatus: "ready",
        identityCoherent: true,
        messages: [{ role: "assistant" }],
      },
      runtimeChecklist: {
        constructId: "nova-001",
        overallStatus: "pass",
        stages: [
          {
            id: "persistence",
            label: "Persistence",
            status: "pass",
            why: "Transcript write was owned by the server.",
          },
        ],
      },
    });

    expect(checklist.title).toBe("Chat page checklist");
    expect(checklist.stages?.map((stage) => stage.id)).toEqual([
      "chat-selected-ai",
      "chat-canonical-route",
      "chat-provider-model",
      "chat-fallback",
      "chat-hydration",
      "chat-identity-coherence",
      "chat-runtime-receipt",
      "chat-persistence",
      "chat-reload",
    ]);
    expect(checklist.stages?.find((stage) => stage.id === "chat-runtime-receipt")?.status).toBe("pass");
    expect(checklist.stages?.find((stage) => stage.id === "chat-persistence")?.status).toBe("pass");
    expect(checklist.stages?.find((stage) => stage.id === "chat-provider-model")?.status).toBe("pass");
    expect(checklist.stages?.find((stage) => stage.id === "chat-fallback")?.status).toBe("pass");
    expect(checklist.stages?.find((stage) => stage.id === "chat-hydration")?.status).toBe("pass");
    expect(checklist.stages?.find((stage) => stage.id === "chat-identity-coherence")?.status).toBe("pass");
  });

  it("shows fallback warn state when thread is running in fallback mode", () => {
    const checklist = getPageDiagnosisChecklist({
      pathname: "/app/chat/lin-001_chat_with_lin-001",
      activeThread: {
        id: "lin-001_chat_with_lin-001",
        constructId: "lin-001",
        isFallback: true,
        hydrationSource: "local-fallback",
        hydrationStatus: "partial",
      },
    });

    expect(checklist.stages?.find((stage) => stage.id === "chat-fallback")?.status).toBe("warn");
    expect(checklist.stages?.find((stage) => stage.id === "chat-hydration")?.status).toBe("warn");
  });

  it("shows hydration fail state when hydration errored or missing", () => {
    const checklist = getPageDiagnosisChecklist({
      pathname: "/app/chat/val-001_chat_with_val-001",
      activeThread: {
        id: "val-001_chat_with_val-001",
        constructId: "val-001",
        hydrationStatus: "error",
        hydrationSource: "empty-fallback",
      },
    });

    expect(checklist.stages?.find((stage) => stage.id === "chat-hydration")?.status).toBe("fail");
  });

  it("shows identity coherence fail state when coherence check failed", () => {
    const checklist = getPageDiagnosisChecklist({
      pathname: "/app/chat/zen-001_chat_with_zen-001",
      activeThread: {
        id: "zen-001_chat_with_zen-001",
        constructId: "zen-001",
        identityCoherent: false,
      },
    });

    expect(checklist.stages?.find((stage) => stage.id === "chat-identity-coherence")?.status).toBe("fail");
  });

  it("returns definition checklists for non-chat signed-in pages", () => {
    const checklist = getPageDiagnosisChecklist({
      pathname: "/app/vvault",
      activeThread: null,
      runtimeChecklist: null,
    });

    expect(checklist.title).toBe("VVAULT page checklist");
    expect(checklist.stages?.map((stage) => stage.id)).toEqual([
      "vvault-bridge",
      "vvault-auth",
      "vvault-files",
      "vvault-read-write-state",
    ]);
    expect(checklist.summary?.skipped).toBe(4);
  });

  it("maps GPT creation routes to the GPT Creator checklist", () => {
    const checklist = getPageDiagnosisChecklist({
      pathname: "/app/gpts/new",
    });

    expect(checklist.title).toBe("GPT Creator checklist");
    expect(checklist.stages?.some((stage) => stage.id === "creator-chat-handoff")).toBe(true);
  });
});
