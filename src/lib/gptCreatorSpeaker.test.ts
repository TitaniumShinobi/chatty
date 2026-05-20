import {
  getCreatorSpeakerLabel,
  normalizeCreatorSpeakerRole,
} from "./gptCreatorSpeaker";

describe("gptCreatorSpeaker", () => {
  test("assistant role maps to Lin label", () => {
    expect(normalizeCreatorSpeakerRole("assistant")).toBe("assistant");
    expect(getCreatorSpeakerLabel("assistant")).toBe("Lin:");
  });

  test("user role maps to You label", () => {
    expect(normalizeCreatorSpeakerRole("user")).toBe("user");
    expect(getCreatorSpeakerLabel("user")).toBe("You:");
  });

  test("role normalization is trim/lower defensive", () => {
    expect(normalizeCreatorSpeakerRole(" Assistant ")).toBe("assistant");
    expect(normalizeCreatorSpeakerRole(" USER ")).toBe("user");
  });

  test("unknown/system/tool roles never map to You label", () => {
    expect(normalizeCreatorSpeakerRole("system")).toBe("unknown");
    expect(normalizeCreatorSpeakerRole("tool")).toBe("unknown");
    expect(getCreatorSpeakerLabel("system")).toBe("");
    expect(getCreatorSpeakerLabel("tool")).toBe("");
    expect(getCreatorSpeakerLabel(undefined)).toBe("");
  });

  test("mixed role sequence keeps user/assistant labels stable", () => {
    const labels = ["assistant", "user", "system", "assistant", "tool"].map(
      (role) => getCreatorSpeakerLabel(role),
    );
    expect(labels).toEqual(["Lin:", "You:", "", "Lin:", ""]);
  });
});
