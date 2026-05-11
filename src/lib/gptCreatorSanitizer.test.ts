import {
  isPromptDumpLikeAssistantContent,
  sanitizeCreateTabHistory,
  shouldAutoSendInitialCreateMessage,
} from "./gptCreatorSanitizer";

describe("gptCreatorSanitizer", () => {
  test("sanitizeCreateTabHistory drops system rows and assistant prompt dumps, keeping last 12 clean turns", () => {
    const noisyHistory = [
      { role: "system", content: "Opened GPT Creator", timestamp: 1 },
      {
        role: "assistant",
        content:
          "Dual Mode:\n- GPTCreator Create Tab\nMemory Continuity:\n- Use injected memories\nLin is a tether, not a name.",
        timestamp: 2,
      },
      ...Array.from({ length: 15 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `clean-${index}`,
        timestamp: index + 3,
      })),
    ];

    const sanitized = sanitizeCreateTabHistory(noisyHistory, 12);

    expect(sanitized).toHaveLength(12);
    expect(sanitized.every((m) => m.role === "user" || m.role === "assistant")).toBe(
      true,
    );
    expect(sanitized.some((m) => m.content.includes("Dual Mode"))).toBe(false);
    expect(sanitized[0].content).toBe("clean-3");
    expect(sanitized[11].content).toBe("clean-14");
  });

  test("isPromptDumpLikeAssistantContent detects Lin identity dumps but not normal chat", () => {
    const dump = `
Dual Mode:
- GPTCreator Create Tab: Conversational agent helping users create GPTs

Memory Continuity:
- Use injected memories as absolute context

Lin is a tether, not a name.
`;
    const normal = "I'm Lin. Tell me the GPT name, purpose, and tone you want.";

    expect(isPromptDumpLikeAssistantContent(dump)).toBe(true);
    expect(isPromptDumpLikeAssistantContent(normal)).toBe(false);
  });

  test("shouldAutoSendInitialCreateMessage is false when initial message is null", () => {
    expect(
      shouldAutoSendInitialCreateMessage({
        isVisible: true,
        initialCreateMessage: null,
        initialConfig: null,
        activeTab: "create",
        isCreateGenerating: false,
        createMessagesLength: 0,
        lastSentMessage: null,
      }),
    ).toBe(false);
  });

  test("shouldAutoSendInitialCreateMessage is true only for a fresh explicit initial message", () => {
    expect(
      shouldAutoSendInitialCreateMessage({
        isVisible: true,
        initialCreateMessage: "build me a support bot",
        initialConfig: null,
        activeTab: "create",
        isCreateGenerating: false,
        createMessagesLength: 0,
        lastSentMessage: null,
      }),
    ).toBe(true);
  });
});
