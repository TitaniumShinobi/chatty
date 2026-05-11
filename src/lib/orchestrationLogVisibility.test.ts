import {
  ORCHESTRATION_LOG_VISIBILITY_STORAGE_KEY,
  readOrchestrationLogVisibility,
  writeOrchestrationLogVisibility,
} from "./orchestrationLogVisibility";

describe("orchestration log visibility preference", () => {
  beforeEach(() => {
    localStorage.removeItem(ORCHESTRATION_LOG_VISIBILITY_STORAGE_KEY);
  });

  it("defaults to hidden when no preference has been stored", () => {
    expect(readOrchestrationLogVisibility()).toBe(false);
  });

  it("restores a hidden preference from storage on the next mount", () => {
    localStorage.setItem(ORCHESTRATION_LOG_VISIBILITY_STORAGE_KEY, "hidden");

    expect(readOrchestrationLogVisibility()).toBe(false);
  });

  it("can persist explicit visibility values", () => {
    writeOrchestrationLogVisibility(false);
    expect(localStorage.getItem(ORCHESTRATION_LOG_VISIBILITY_STORAGE_KEY)).toBe(
      "hidden",
    );

    writeOrchestrationLogVisibility(true);
    expect(readOrchestrationLogVisibility()).toBe(true);
  });
});
