import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { pathToFileURL } from 'url'

/**
 * Regression: ensure markdown lines with an inline ISO timestamp `[...]:`
 * are parsed into messages and surface the ISO timestamp value.
 */
describe('readConversations markdown persistence', () => {
  const userId = 'test_user_123';
  const constructId = 'zen-001';
  const sessionId = `${constructId}_chat_with_${constructId}`;

  const writeFixture = (root: string) => {
    const convoDir = path.join(
      root,
      'users',
      'shard_0000',
      userId,
      'instances',
      constructId,
      'chatty'
    );
    fs.mkdirSync(convoDir, { recursive: true });

    const md = `<!-- IMPORT_METADATA
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

    fs.writeFileSync(path.join(convoDir, `chat_with_${constructId}.md`), md, 'utf8');
  };

  it('parses ISO-in-bracket lines and preserves timestamp', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vvault-'));
    process.env.VVAULT_ROOT_PATH = tmpRoot;

    writeFixture(tmpRoot);

    const modulePath = path.join(process.cwd(), 'vvaultConnector', 'readConversations.js');
    const { readConversations } = await import(pathToFileURL(modulePath).href);

    const conversations = await readConversations(userId, constructId);
    expect(conversations.length).toBe(1);
    const convo = conversations[0];
    expect(convo.sessionId).toBe(sessionId);
    expect(convo.messages.length).toBe(1);
    const msg = convo.messages[0];
    expect(msg.content).toBe('hello world');
    expect(msg.timestamp).toBe('2025-12-12T20:40:51.443Z');
    expect(msg.role).toBe('user');
  });
});
