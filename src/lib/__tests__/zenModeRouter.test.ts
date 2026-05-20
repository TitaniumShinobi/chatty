import {
  ZEN_SINGLETON_CONSTRUCT_ID,
  ZEN_SINGLETON_SESSION_ID,
  parseZenModeEnvelope,
} from "../zenModeRouter";

describe("parseZenModeEnvelope", () => {
  it("returns the Chatty default envelope for conversational turns", () => {
    const envelope = parseZenModeEnvelope("Hello there", "chatty");

    expect(envelope).toEqual({
      constructId: ZEN_SINGLETON_CONSTRUCT_ID,
      sessionId: ZEN_SINGLETON_SESSION_ID,
      surface: "chatty",
      mode: "conversation",
      scope: "general",
      permissions: "none",
      mutationRequiresApproval: true,
      commandTokens: [],
      cleanedPrompt: "Hello there",
    });
  });

  it("returns the surface defaults for Quantum, Code, and VVAULT", () => {
    expect(parseZenModeEnvelope("Show me the page", "quantum")).toMatchObject({
      surface: "quantum",
      mode: "browser-companion",
      scope: "browser-page",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: [],
      cleanedPrompt: "Show me the page",
    });

    expect(parseZenModeEnvelope("Review the repo", "code")).toMatchObject({
      surface: "code",
      mode: "dev:code",
      scope: "repo-maintenance",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: [],
      cleanedPrompt: "Review the repo",
    });

    expect(parseZenModeEnvelope("Check transcript lineage", "vvault")).toMatchObject({
      surface: "vvault",
      mode: "dev:vvault",
      scope: "continuity-and-transcript-integrity",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: [],
      cleanedPrompt: "Check transcript lineage",
    });
  });

  it("routes /dev on the current surface", () => {
    const envelope = parseZenModeEnvelope("/dev inspect this", "chatty");

    expect(envelope).toEqual({
      constructId: ZEN_SINGLETON_CONSTRUCT_ID,
      sessionId: ZEN_SINGLETON_SESSION_ID,
      surface: "chatty",
      mode: "dev:chatty",
      scope: "general",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: ["/dev"],
      cleanedPrompt: "inspect this",
    });
  });

  it("supports explicit surface targets after /dev", () => {
    expect(parseZenModeEnvelope("/dev /quantum inspect browser state", "chatty")).toEqual({
      constructId: ZEN_SINGLETON_CONSTRUCT_ID,
      sessionId: ZEN_SINGLETON_SESSION_ID,
      surface: "quantum",
      mode: "dev:quantum",
      scope: "browser-page",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: ["/dev", "/quantum"],
      cleanedPrompt: "inspect browser state",
    });

    expect(parseZenModeEnvelope("/dev /code inspect repo state", "chatty")).toEqual({
      constructId: ZEN_SINGLETON_CONSTRUCT_ID,
      sessionId: ZEN_SINGLETON_SESSION_ID,
      surface: "code",
      mode: "dev:code",
      scope: "repo-maintenance",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: ["/dev", "/code"],
      cleanedPrompt: "inspect repo state",
    });

    expect(parseZenModeEnvelope("/dev /vvault inspect transcript state", "chatty")).toEqual({
      constructId: ZEN_SINGLETON_CONSTRUCT_ID,
      sessionId: ZEN_SINGLETON_SESSION_ID,
      surface: "vvault",
      mode: "dev:vvault",
      scope: "continuity-and-transcript-integrity",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: ["/dev", "/vvault"],
      cleanedPrompt: "inspect transcript state",
    });
  });

  it("marks safe and recover turns with the expected boundary state", () => {
    expect(parseZenModeEnvelope("/safe /vvault preserve the evidence", "chatty")).toEqual({
      constructId: ZEN_SINGLETON_CONSTRUCT_ID,
      sessionId: ZEN_SINGLETON_SESSION_ID,
      surface: "vvault",
      mode: "safe:vvault",
      scope: "continuity-and-transcript-integrity",
      permissions: "read-only-default",
      mutationRequiresApproval: true,
      commandTokens: ["/safe", "/vvault"],
      cleanedPrompt: "preserve the evidence",
    });

    expect(parseZenModeEnvelope("/recover /code restore the repo state", "chatty")).toEqual({
      constructId: ZEN_SINGLETON_CONSTRUCT_ID,
      sessionId: ZEN_SINGLETON_SESSION_ID,
      surface: "code",
      mode: "recover:code",
      scope: "repo-maintenance",
      permissions: "approval-gated",
      mutationRequiresApproval: true,
      commandTokens: ["/recover", "/code"],
      cleanedPrompt: "restore the repo state",
    });
  });
});
