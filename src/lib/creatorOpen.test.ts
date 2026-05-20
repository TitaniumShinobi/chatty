import {
  buildCreatorOpenState,
  normalizeInitialCreateMessage,
} from "./creatorOpen";

describe("creatorOpen", () => {
  test("normalizeInitialCreateMessage returns null for missing/blank input", () => {
    expect(normalizeInitialCreateMessage(undefined)).toBeNull();
    expect(normalizeInitialCreateMessage(null)).toBeNull();
    expect(normalizeInitialCreateMessage("")).toBeNull();
    expect(normalizeInitialCreateMessage("   ")).toBeNull();
  });

  test("normalizeInitialCreateMessage keeps explicit seeded input", () => {
    expect(normalizeInitialCreateMessage("hello world")).toBe("hello world");
  });

  test("buildCreatorOpenState returns /creator state with null initial message when absent", () => {
    expect(buildCreatorOpenState("/app/chat/thread-1", {})).toEqual({
      returnTo: "/app/chat/thread-1",
      initialCreateMessage: null,
    });
  });

  test("buildCreatorOpenState preserves explicit initial message", () => {
    expect(
      buildCreatorOpenState("/app/chat/thread-1", {
        initialMessage: "create a support bot",
      }),
    ).toEqual({
      returnTo: "/app/chat/thread-1",
      initialCreateMessage: "create a support bot",
    });
  });
});
