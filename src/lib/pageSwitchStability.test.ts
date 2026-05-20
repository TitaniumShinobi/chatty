import {
  buildCanonicalGptsPath,
  classifyVvaultFailure,
  deriveVvaultUiStatus,
  getVvaultUiStatusCopy,
  getGptRouteState,
  shouldBlockShellForGptRoute,
  shouldHonorAsyncChatNavigation,
} from "./pageSwitchStability";

describe("pageSwitchStability", () => {
  it("parses both canonical and alias GPT routes", () => {
    expect(getGptRouteState("/app/gpts/new")).toEqual({
      kind: "new",
      editId: null,
    });
    expect(getGptRouteState("/app/ais/new")).toEqual({
      kind: "new",
      editId: null,
    });
    expect(getGptRouteState("/app/gpts/edit/abc123")).toEqual({
      kind: "edit",
      editId: "abc123",
    });
    expect(getGptRouteState("/app/ais/edit/abc123")).toEqual({
      kind: "edit",
      editId: "abc123",
    });
  });

  it("builds canonical GPT paths", () => {
    expect(buildCanonicalGptsPath()).toBe("/app/gpts");
    expect(buildCanonicalGptsPath("/new")).toBe("/app/gpts/new");
    expect(buildCanonicalGptsPath("/edit/xyz")).toBe("/app/gpts/edit/xyz");
  });

  it("only blocks the shell for active GPT editor overlays", () => {
    expect(
      shouldBlockShellForGptRoute({
        pathname: "/app/gpts",
        isCreatorOpen: false,
        isEditLoading: false,
      }),
    ).toBe(false);

    expect(
      shouldBlockShellForGptRoute({
        pathname: "/app/gpts/new",
        isCreatorOpen: true,
        isEditLoading: false,
      }),
    ).toBe(true);

    expect(
      shouldBlockShellForGptRoute({
        pathname: "/app/ais/edit/abc123",
        isCreatorOpen: false,
        isEditLoading: true,
      }),
    ).toBe(true);
  });

  it("only honors async chat navigation while the user remains on the initiating path", () => {
    expect(
      shouldHonorAsyncChatNavigation({
        startPath: "/app",
        currentPath: "/app",
      }),
    ).toBe(true);

    expect(
      shouldHonorAsyncChatNavigation({
        startPath: "/app",
        currentPath: "/app/vvault",
      }),
    ).toBe(false);
  });

  it("classifies unauthorized and unreachable VVAULT failures", () => {
    expect(
      classifyVvaultFailure("VVAULT API error: 401 - Shared VVAULT authentication required"),
    ).toEqual({
      backendUnavailable: true,
      classification: "unauthorized",
    });

    expect(
      classifyVvaultFailure("AUTH_REQUIRED: Shared VVAULT authentication required"),
    ).toEqual({
      backendUnavailable: true,
      classification: "unauthorized",
    });

    expect(
      classifyVvaultFailure("Failed to fetch /api/vvault/conversations"),
    ).toEqual({
      backendUnavailable: true,
      classification: "unreachable",
    });

    expect(classifyVvaultFailure("something else")).toEqual({
      backendUnavailable: false,
      classification: null,
    });
  });

  it("derives bounded VVAULT UI status without treating local state as canonical", () => {
    expect(
      deriveVvaultUiStatus({
        backendUnavailable: false,
        classification: null,
      }),
    ).toBe("canonicalAvailable");

    expect(
      deriveVvaultUiStatus({
        backendUnavailable: true,
        classification: "unauthorized",
      }),
    ).toBe("authRequired");

    expect(
      deriveVvaultUiStatus({
        backendUnavailable: true,
        classification: "unreachable",
      }),
    ).toBe("unreachable");

    expect(getVvaultUiStatusCopy("canonicalAvailable")).toBeNull();
    expect(getVvaultUiStatusCopy("authRequired")?.message).toContain(
      "Canonical VVAULT read/write is blocked",
    );
    expect(getVvaultUiStatusCopy("unreachable")?.message).toContain(
      "will not treat local state as canonical",
    );
  });
});
