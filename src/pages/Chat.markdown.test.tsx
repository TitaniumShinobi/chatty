import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildImportedCodexRelayPreview,
  getUserMessageRenderMode,
  isImportedCodexRelayUserMessage,
  renderImportedCodexRelayContext,
  renderUserMessageParagraph,
  shouldRenderUserMarkdownParagraphAsBlock,
} from "./Chat";

describe("Chat user markdown paragraph rendering", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses a block wrapper when a code block renderer output is present", () => {
    expect(
      shouldRenderUserMarkdownParagraphAsBlock([
        "\n",
        <div key="code-shell">
          <pre>const answer = 42;</pre>
        </div>,
      ]),
    ).toBe(true);
  });

  it("does not emit validateDOMNesting warnings for block children", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    const markup = renderToStaticMarkup(
      renderUserMessageParagraph([
        "\n",
        <div key="fenced-code">
          <pre>const answer = 42;</pre>
        </div>,
      ]),
    );

    expect(markup).toContain("<div");
    expect(markup).toContain("<pre>const answer = 42;</pre>");
    expect(markup.startsWith("<p")).toBe(false);
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0] ?? "").includes("validateDOMNesting"),
      ),
    ).toBe(false);
  });

  it("keeps inline-only content inside a real paragraph", () => {
    const markup = renderToStaticMarkup(
      renderUserMessageParagraph([
        "inline ",
        <code key="inline-code">value</code>,
      ]),
    );

    expect(markup.startsWith("<p")).toBe(true);
  });

  it("detects imported Codex relay user turns", () => {
    expect(
      isImportedCodexRelayUserMessage({
        role: "user",
        metadata: {
          sourceProduct: "codex",
          relayImportedAt: "2026-05-10T16:29:14.553Z",
        },
      }),
    ).toBe(true);

    expect(
      isImportedCodexRelayUserMessage({
        role: "user",
        metadata: {
          sourceSeat: "codex",
          relayImportedAt: "2026-05-10T16:29:14.553Z",
        },
      }),
    ).toBe(true);

    expect(
      isImportedCodexRelayUserMessage({
        role: "user",
        metadata: {
          sourceProduct: "chatty",
        },
      }),
    ).toBe(false);
  });

  it("routes imported Codex handoff turns to the imported-context renderer", () => {
    expect(
      getUserMessageRenderMode({
        role: "user",
        text: "very large imported rollout payload",
        metadata: {
          sourceProduct: "codex",
          sourceSeat: "codex",
          relayImportedAt: "2026-05-10T16:29:14.553Z",
        },
      }),
    ).toBe("imported-codex-context");

    expect(
      getUserMessageRenderMode({
        role: "user",
        text: "normal live prompt",
        metadata: {
          sourceProduct: "chatty",
        },
      }),
    ).toBe("live-user");
  });

  it("converts imported markdown images into readable preview text", () => {
    expect(
      buildImportedCodexRelayPreview(
        "![Image #1](/Users/example/Desktop/Screenshot.png)\n\nconsole dump",
        400,
      ),
    ).toContain("[imported image: /Users/example/Desktop/Screenshot.png]");
  });

  it("caps imported Codex handoff previews", () => {
    const preview = buildImportedCodexRelayPreview(
      `handoff start ${"x".repeat(500)} raw tail that should not fit`,
      80,
    );

    expect(preview.length).toBeLessThanOrEqual(83);
    expect(preview).toMatch(/\.\.\.$/);
    expect(preview).not.toContain("raw tail that should not fit");
  });

  it("renders imported Codex context without emitting the full raw blob", () => {
    const hiddenTail = "RAW_IMPORTED_TAIL_SHOULD_NOT_RENDER";
    const importedText = [
      "Imported handoff opening line.",
      "![Image #1](/Users/example/Desktop/Screenshot.png)",
      "x".repeat(1500),
      hiddenTail,
    ].join("\n\n");

    const markup = renderToStaticMarkup(
      renderImportedCodexRelayContext({
        text: importedText,
        importedAt: "2026-05-10T16:29:14.553Z",
      }),
    );

    expect(markup).toContain("Imported Codex handoff context");
    expect(markup).toContain("Imported handoff opening line.");
    expect(markup).toContain("[imported image: /Users/example/Desktop/Screenshot.png]");
    expect(markup).toContain("Full imported content remains in canonical storage.");
    expect(markup).not.toContain(hiddenTail);
    expect(markup).not.toContain("<pre");
  });
});
