import { getPageDiagnosisChecklist } from "./pageDiagnosisChecklist";

describe("getPageDiagnosisChecklist", () => {
  it("keeps Chat route definitions and runtime receipts in the same page checklist", () => {
    const checklist = getPageDiagnosisChecklist({
      pathname: "/app/chat/nova-001_chat_with_nova-001",
      activeThread: {
        id: "nova-001_chat_with_nova-001",
        constructId: "nova-001",
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
      "chat-runtime-receipt",
      "chat-persistence",
      "chat-reload",
    ]);
    expect(checklist.stages?.find((stage) => stage.id === "chat-runtime-receipt")?.status).toBe("pass");
    expect(checklist.stages?.find((stage) => stage.id === "chat-persistence")?.status).toBe("pass");
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
