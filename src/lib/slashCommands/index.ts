/**
 * Slash Commands Registry
 * Central registry for all slash commands in the Chatty system
 */

import { CreateCommand } from '../../cli/commands/create.js';

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[]) => Promise<string>;
  validate?: (args: string[]) => { valid: boolean; error?: string };
}

/**
 * Registry of all available slash commands
 */
export const SLASH_COMMANDS: Record<string, SlashCommand> = {
  create: {
    name: 'create',
    description: 'Generate images from text prompts',
    usage: '/create <prompt>',
    handler: CreateCommand.handle,
    validate: CreateCommand.validateArgs
  }
};

/**
 * Get a slash command by name
 */
export function getSlashCommand(name: string): SlashCommand | undefined {
  return SLASH_COMMANDS[name.toLowerCase()];
}

/**
 * List all available slash commands
 */
export function listSlashCommands(): SlashCommand[] {
  return Object.values(SLASH_COMMANDS);
}

/**
 * Check if a command exists
 */
export function hasSlashCommand(name: string): boolean {
  return name.toLowerCase() in SLASH_COMMANDS;
}

/**
 * Execute a slash command
 */
export async function executeSlashCommand(name: string, args: string[]): Promise<string> {
  const command = getSlashCommand(name);
  if (!command) {
    return `❌ Unknown command: /${name}. Type /help for available commands.`;
  }

  // Validate arguments if validator exists
  if (command.validate) {
    const validation = command.validate(args);
    if (!validation.valid) {
      return `❌ ${validation.error}`;
    }
  }

  try {
    return await command.handler(args);
  } catch (error: any) {
    return `❌ Error executing /${name}: ${error.message}`;
  }
}
