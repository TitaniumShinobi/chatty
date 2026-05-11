import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatMarkdownTranscript,
  mergeConversationGroupMessages,
  normalizeConversationMessages,
  parseMarkdownTranscript,
  resolveVaultFileUpdatedAt,
} from "../../vvaultConnector/supabaseStore.js";
import {
  toConversationIndexRecord,
} from "../../vvaultConnector/supabaseStore.mjs";
import {
  formatMessagesToMarkdown,
  parseMarkdownToMessages,
} from "../../vvaultConnector/vvaultApiClient.js";

describe("VVAULT transcript timestamps", () => {
  it("writes per-message timestamps into the canonical Chatty markdown transcript", () => {
    const markdown = formatMarkdownTranscript("Lin", [
      {
        role: "user",
        content: "hello",
        timestamp: "2026-04-25T20:10:00.000Z",
      },
      {
        role: "assistant",
        content: "hi there",
        timestamp: "2026-04-25T20:10:02.000Z",
      },
    ]);

    assert.match(markdown, /\[2026-04-25T20:10:00.000Z\] \*\*User\*\*: hello/);
    assert.match(markdown, /\[2026-04-25T20:10:02.000Z\] \*\*Assistant\*\*: hi there/);
  });

  it("round-trips inline ISO timestamped Chatty markdown through the Supabase parser", () => {
    const markdown = [
      "# Lin",
      "",
      "[2026-04-25T20:10:00.000Z] **User**: hello",
      "",
      "[2026-04-25T20:10:02.000Z] **Assistant**: hi there",
      "",
    ].join("\n");

    const parsed = parseMarkdownTranscript(markdown);
    assert.equal(parsed.length, 2);
    assert.deepEqual(
      parsed.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      })),
      [
        {
          role: "user",
          content: "hello",
          timestamp: "2026-04-25T20:10:00.000Z",
        },
        {
          role: "assistant",
          content: "hi there",
          timestamp: "2026-04-25T20:10:02.000Z",
        },
      ],
    );
  });

  it("keeps inline ISO timestamps compatible with the VVAULT API markdown client", () => {
    const markdown = formatMessagesToMarkdown("Zen", [
      {
        role: "user",
        content: "hello",
        timestamp: "2026-04-25T20:10:00.000Z",
      },
      {
        role: "assistant",
        content: "hi there",
        timestamp: "2026-04-25T20:10:02.000Z",
      },
    ]);

    const parsed = parseMarkdownToMessages(markdown);
    assert.equal(parsed.length, 2);
    assert.deepEqual(
      parsed.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      })),
      [
        {
          role: "user",
          content: "hello",
          timestamp: "2026-04-25T20:10:00.000Z",
        },
        {
          role: "assistant",
          content: "hi there",
          timestamp: "2026-04-25T20:10:02.000Z",
        },
      ],
    );
  });

  it("parses canonical body speaker-plus-parenthesized timestamps used by newer Zen soak writes", () => {
    const markdown = [
      "# Zen",
      "",
      "**User** (2026-05-06T04:45:21.040Z):",
      "Codex long-run soak turn 9/25.",
      "",
      "**Zen** (2026-05-06T04:45:21.042Z):",
      "What remains true about me is I am Zen.",
      "",
    ].join("\n");

    const parsed = parseMarkdownToMessages(markdown);
    assert.equal(parsed.length, 2);
    assert.deepEqual(
      parsed.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      })),
      [
        {
          role: "user",
          content: "Codex long-run soak turn 9/25.",
          timestamp: "2026-05-06T04:45:21.040Z",
        },
        {
          role: "assistant",
          content: "What remains true about me is I am Zen.",
          timestamp: "2026-05-06T04:45:21.042Z",
        },
      ],
    );
  });

  it("prefers explicit updated_at when normalizing transcript metadata dates", () => {
    assert.equal(
      resolveVaultFileUpdatedAt({
        created_at: "2026-02-12T00:00:00.000Z",
        updated_at: "2026-04-26T14:49:28.390Z",
        metadata: {
          updatedAt: "2026-04-20T00:00:00.000Z",
          lastUpdated: "2026-04-18T00:00:00.000Z",
        },
      }),
      "2026-04-26T14:49:28.390Z",
    );
  });

  it("falls back to metadata.updatedAt before legacy metadata.lastUpdated or created_at", () => {
    assert.equal(
      resolveVaultFileUpdatedAt({
        created_at: "2026-02-12T00:00:00.000Z",
        metadata: {
          updatedAt: "2026-04-26T03:33:52.582Z",
          lastUpdated: "2026-04-18T00:00:00.000Z",
        },
      }),
      "2026-04-26T03:33:52.582Z",
    );
    assert.equal(
      resolveVaultFileUpdatedAt({
        created_at: "2026-02-12T00:00:00.000Z",
        metadata: {
          lastUpdated: "2026-04-26T00:57:02.489Z",
        },
      }),
      "2026-04-26T00:57:02.489Z",
    );
  });

  it("normalizes duplicate message ids without dropping distinct messages", () => {
    const normalized = normalizeConversationMessages("zen-001_chat_with_zen-001", [
      {
        id: "zen-001_chat_with_zen-001_msg_0",
        role: "user",
        content: "first",
        timestamp: "2026-04-25T20:10:00.000Z",
      },
      {
        id: "zen-001_chat_with_zen-001_msg_0",
        role: "assistant",
        content: "second",
        timestamp: "2026-04-25T20:10:02.000Z",
      },
      {
        role: "assistant",
        content: "third",
        timestamp: "2026-04-25T20:10:04.000Z",
      },
      {
        id: "zen-001_chat_with_zen-001_msg_0",
        role: "assistant",
        content: "second",
        timestamp: "2026-04-25T20:10:02.000Z",
      },
    ]);

    assert.deepEqual(
      normalized.map((message) => message.id),
      [
        "zen-001_chat_with_zen-001_msg_0",
        "zen-001_chat_with_zen-001_msg_0__dup1",
        "zen-001_chat_with_zen-001_msg_0__dup2",
      ],
    );
    assert.equal(normalized.length, 3);
  });

  it("merges grouped conversations by fingerprint while repairing repeated ids", () => {
    const merged = mergeConversationGroupMessages(
      {
        sessionId: "katana-001_chat_with_katana-001",
        messages: [
          {
            id: "katana-001_chat_with_katana-001_msg_0",
            role: "user",
            content: "alpha",
            timestamp: "2026-04-25T20:10:00.000Z",
          },
        ],
      },
      [
        {
          sessionId: "katana-shadow",
          messages: [
            {
              id: "katana-001_chat_with_katana-001_msg_0",
              role: "assistant",
              content: "beta",
              timestamp: "2026-04-25T20:10:02.000Z",
            },
            {
              id: "katana-001_chat_with_katana-001_msg_0",
              role: "assistant",
              content: "beta",
              timestamp: "2026-04-25T20:10:02.000Z",
            },
          ],
        },
      ],
    );

    assert.equal(merged.messages.length, 2);
    assert.deepEqual(
      merged.messages.map((message) => message.id),
      [
        "katana-001_chat_with_katana-001_msg_0",
        "katana-001_chat_with_katana-001_msg_0__dup1",
      ],
    );
    assert.deepEqual(
      merged.messages.map((message) => message.content),
      ["alpha", "beta"],
    );
  });

  it("builds index previews with unique normalized ids", () => {
    const preview = toConversationIndexRecord({
      id: "row-1",
      filename: "instances/zen-001/chatty/chat_with_zen-001.md",
      construct_id: "zen-001",
      updated_at: "2026-04-26T14:49:28.390Z",
      metadata: {
        sessionId: "zen-001_chat_with_zen-001",
        messages: [
          {
            id: "dup",
            role: "user",
            content: "hello",
            timestamp: "2026-04-25T20:10:00.000Z",
          },
          {
            id: "dup",
            role: "assistant",
            content: "hi",
            timestamp: "2026-04-25T20:10:02.000Z",
          },
          {
            role: "assistant",
            content: "follow up",
            timestamp: "2026-04-25T20:10:04.000Z",
          },
        ],
      },
    });

    assert.deepEqual(
      preview.messages.map((message) => message.id),
      ["dup", "dup__dup1", "zen-001_chat_with_zen-001_msg_0"],
    );
  });
});
