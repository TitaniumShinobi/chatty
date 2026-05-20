import { spawnSync } from 'child_process'
import * as path from 'path'

/**
 * Regression: ensure markdown lines with an inline ISO timestamp `[...]:`
 * are parsed into messages and surface the ISO timestamp value.
 */
describe('readConversations markdown persistence', () => {
  const constructId = 'zen-001';
  const sessionId = `${constructId}_chat_with_${constructId}`;
  const markdownFixture = `<!-- IMPORT_METADATA
{
  "constructId": "${constructId}",
  "runtimeId": "zen",
  "conversationId": "${sessionId}",
  "conversationTitle": "Chat with Zen",
  "isPrimary": true
}
-->

# Chat with Zen

**Created**: December 12, 2025
**Session ID**: ${sessionId}
**Construct**: Zen

---

## December 12, 2025

**03:40:51 PM EST - Test User** [2025-12-12T20:40:51.443Z]: hello world
`;

  it('parses ISO-in-bracket lines and preserves timestamp', async () => {
    const modulePath = path.join(process.cwd(), 'vvaultConnector', 'supabaseStore.mjs');
    const script = `
      import { pathToFileURL } from 'url';
      const { parseMarkdownTranscript } = await import(pathToFileURL(process.env.PARSE_MODULE_PATH).href);
      const fixture = Buffer.from(process.env.MARKDOWN_FIXTURE_B64, 'base64').toString('utf8');
      const messages = parseMarkdownTranscript(fixture, process.env.DEBUG_TRANSCRIPT_PATH);
      process.stdout.write(JSON.stringify(messages));
    `;

    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PARSE_MODULE_PATH: modulePath,
        MARKDOWN_FIXTURE_B64: Buffer.from(markdownFixture, 'utf8').toString('base64'),
        DEBUG_TRANSCRIPT_PATH: `instances/${constructId}/chatty/chat_with_${constructId}.md`,
      },
    });

    expect(child.status).toBe(0);
    const messages = JSON.parse(child.stdout) as Array<{
      content: string;
      timestamp?: string;
      role: string;
    }>;

    const msg = messages.find((entry) => !('isDateHeader' in entry) || !(entry as { isDateHeader?: boolean }).isDateHeader);
    expect(msg).toBeTruthy();
    expect(msg.content).toBe('hello world');
    expect(msg.timestamp).toBe('2025-12-12T20:40:51.443Z');
    expect(msg.role).toBe('user');
  });
});
