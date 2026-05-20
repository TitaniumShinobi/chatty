import {
  deriveForgeConstructCallsign,
  isForgeDraftReady,
} from "./forgeCallsign";

describe("forgeCallsign", () => {
  test("uses explicit constructCallsign when present", () => {
    expect(deriveForgeConstructCallsign("katana-001", "Ignored Name")).toBe(
      "katana-001",
    );
  });

  test("derives callsign from name when constructCallsign is missing", () => {
    expect(deriveForgeConstructCallsign(null, "My Forge Bot")).toBe(
      "my-forge-bot-001",
    );
  });

  test("returns null when both constructCallsign and name are missing", () => {
    expect(deriveForgeConstructCallsign(undefined, undefined)).toBeNull();
    expect(deriveForgeConstructCallsign("", "   ")).toBeNull();
  });

  test("isForgeDraftReady tracks draft gating", () => {
    expect(isForgeDraftReady("zen-001", "")).toBe(true);
    expect(isForgeDraftReady("", "Name Here")).toBe(true);
    expect(isForgeDraftReady("", "   ")).toBe(false);
  });
});
