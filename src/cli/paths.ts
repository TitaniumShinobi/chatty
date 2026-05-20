import os from 'node:os';
import path from 'node:path';

const DEFAULT_CHATTY_CLI_HOME = path.join(os.homedir(), '.chatty-cli');

export function expandHomePath(input: string): string {
  if (input === '~') {
    return os.homedir();
  }

  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2));
  }

  return input;
}

export function resolveUserPath(input: string): string {
  return path.resolve(expandHomePath(input));
}

export function getChattyCliHome(): string {
  return resolveUserPath(process.env.CHATTY_CLI_HOME || DEFAULT_CHATTY_CLI_HOME);
}

export function getChattyCliSettingsFile(): string {
  return resolveUserPath(
    process.env.CHATTY_CLI_SETTINGS_FILE || path.join(getChattyCliHome(), 'settings.json')
  );
}

export function getChattyCliConversationsDir(): string {
  return resolveUserPath(
    process.env.CHATTY_CLI_CONVERSATIONS_DIR || path.join(getChattyCliHome(), 'conversations')
  );
}

export function getChattyCliFileRoot(): string {
  return resolveUserPath(process.env.CHATTY_CLI_FILE_ROOT || process.cwd());
}

export function getChattyCliDbPath(): string {
  return resolveUserPath(process.env.CHATTY_DB_PATH || path.join(getChattyCliHome(), 'chatty.db'));
}
