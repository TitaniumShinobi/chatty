// fileOpsCommands.ts - CLI command interface for file operations
// Integrates with Chatty's existing CLI system

import { FileOperationsCLI, formatFileSize, formatDate, formatPermissions } from './fileOps.js';

// Color utilities
function colorize(text: string, color: string): string {
  const colors: Record<string, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    dim: '\x1b[2m',
    reset: '\x1b[0m'
  };
  return `${colors[color] || ''}${text}${colors.reset}`;
}

export class FileOpsCommands {
  private fileOps: FileOperationsCLI;

  constructor() {
    this.fileOps = new FileOperationsCLI();
  }

  /** Handle file operations commands */
  async handleCommand(command: string, args: string[]): Promise<string> {
    const cmd = command.toLowerCase();
    
    try {
      switch (cmd) {
        case 'cd':
          return await this.handleCd(args);
        case 'ls':
        case 'list':
          return await this.handleList(args);
        case 'cp':
        case 'copy':
          return await this.handleCopy(args);
        case 'mv':
        case 'move':
          return await this.handleMove(args);
        case 'ln':
        case 'symlink':
          return await this.handleSymlink(args);
        case 'links':
          return await this.handleListSymlinks(args);
        case 'grep':
        case 'search':
          return await this.handleSearch(args);
        case 'find':
          return await this.handleFind(args);
        case 'info':
          return await this.handleInfo(args);
        case 'pwd':
          return await this.handlePwd();
        case 'help':
          return this.showHelp();
        default:
          return colorize(`Unknown file operation command: ${command}`, 'red');
      }
    } catch (error: any) {
      return colorize(`Error executing command: ${error.message}`, 'red');
    }
  }

  private async handleCd(args: string[]): Promise<string> {
    const targetPath = args[0];
    const result = await this.fileOps.safeCd(targetPath);
    
    if (result.success) {
      return colorize(result.message, 'green');
    } else {
      return colorize(result.message, 'red');
    }
  }

  private async handleList(args: string[]): Promise<string> {
    const targetPath = args[0];
    const result = await this.fileOps.listDirectory(targetPath);
    
    if (!result.success) {
      return colorize(result.message, 'red');
    }

    const items = result.data;
    if (!items || items.length === 0) {
      return colorize('Directory is empty', 'yellow');
    }

    let output = colorize(result.message, 'cyan') + '\n';
    output += colorize('─'.repeat(80), 'dim') + '\n';
    
    for (const item of items) {
      const type = item.type === 'directory' ? '📁' : '📄';
      const size = item.size ? formatFileSize(item.size) : '';
      const modified = item.modified ? formatDate(item.modified) : '';
      const perms = item.permissions ? formatPermissions(parseInt(item.permissions, 8)) : '';
      const symlink = item.isSymlink ? ` -> ${item.symlinkTarget}` : '';
      
      output += `${type} ${colorize(item.name, item.type === 'directory' ? 'blue' : 'white')}${symlink}\n`;
      if (size || modified || perms) {
        output += `   ${colorize(`Size: ${size} | Modified: ${modified} | Perms: ${perms}`, 'dim')}\n`;
      }
    }
    
    return output;
  }

  private async handleCopy(args: string[]): Promise<string> {
    if (args.length < 2) {
      return colorize('Usage: /file cp <source> <destination> [--recursive] [--force]', 'yellow');
    }

    const source = args[0];
    const destination = args[1];
    const options = {
      recursive: args.includes('--recursive') || args.includes('-r'),
      force: args.includes('--force') || args.includes('-f')
    };

    const result = await this.fileOps.robustCp(source, destination, options);
    
    if (result.success) {
      return colorize(result.message, 'green');
    } else {
      return colorize(result.message, 'red');
    }
  }

  private async handleMove(args: string[]): Promise<string> {
    if (args.length < 2) {
      return colorize('Usage: /file mv <source> <destination> [--force]', 'yellow');
    }

    const source = args[0];
    const destination = args[1];
    const options = {
      force: args.includes('--force') || args.includes('-f')
    };

    const result = await this.fileOps.moveFile(source, destination, options);
    
    if (result.success) {
      return colorize(result.message, 'green');
    } else {
      return colorize(result.message, 'red');
    }
  }

  private async handleSymlink(args: string[]): Promise<string> {
    if (args.length < 2) {
      return colorize('Usage: /file ln <source> <link_name> [--force]', 'yellow');
    }

    const source = args[0];
    const linkName = args[1];
    const options = {
      force: args.includes('--force') || args.includes('-f')
    };

    const result = await this.fileOps.createSymlink(source, linkName, options);
    
    if (result.success) {
      return colorize(result.message, 'green');
    } else {
      return colorize(result.message, 'red');
    }
  }

  private async handleListSymlinks(args: string[]): Promise<string> {
    const targetPath = args[0];
    const result = await this.fileOps.listSymlinks(targetPath);
    
    if (!result.success) {
      return colorize(result.message, 'red');
    }

    const symlinks = result.data;
    if (!symlinks || symlinks.length === 0) {
      return colorize('No symbolic links found', 'yellow');
    }

    let output = colorize(result.message, 'cyan') + '\n';
    output += colorize('─'.repeat(80), 'dim') + '\n';
    
    for (const link of symlinks) {
      output += `🔗 ${colorize(link.name, 'magenta')} -> ${colorize(link.target, 'blue')}\n`;
    }
    
    return output;
  }

  private async handleSearch(args: string[]): Promise<string> {
    if (args.length < 1) {
      return colorize('Usage: /file grep <search_term> [path] [options]', 'yellow');
    }

    const searchTerm = args[0];
    const targetPath = args[1];
    const options = {
      recursive: args.includes('--recursive') || args.includes('-r'),
      caseInsensitive: args.includes('--ignore-case') || args.includes('-i'),
      wholeWord: args.includes('--word') || args.includes('-w'),
      filePattern: this.extractOptionValue(args, '--pattern') || this.extractOptionValue(args, '-p'),
      maxDepth: parseInt(this.extractOptionValue(args, '--max-depth') || '0') || undefined
    };

    const result = await this.fileOps.robustGrep(searchTerm, targetPath, options);
    
    if (!result.success) {
      return colorize(result.message, 'red');
    }

    const results = result.data;
    if (!results || results.length === 0) {
      return colorize(`No matches found for "${searchTerm}"`, 'yellow');
    }

    let output = colorize(result.message, 'cyan') + '\n';
    output += colorize('─'.repeat(80), 'dim') + '\n';
    
    let currentFile = '';
    for (const match of results) {
      if (match.file !== currentFile) {
        currentFile = match.file;
        output += `\n📄 ${colorize(match.file, 'blue')}\n`;
      }
      output += `  ${colorize(match.line.toString().padStart(4), 'dim')}: ${match.content}\n`;
    }
    
    return output;
  }

  private async handleFind(args: string[]): Promise<string> {
    if (args.length < 1) {
      return colorize('Usage: /file find <pattern> [path] [options]', 'yellow');
    }

    const pattern = args[0];
    const targetPath = args[1];
    const options = {
      recursive: args.includes('--recursive') || args.includes('-r'),
      maxDepth: parseInt(this.extractOptionValue(args, '--max-depth') || '0') || undefined,
      type: this.extractOptionValue(args, '--type') as 'file' | 'directory' | 'both' || 'both'
    };

    const result = await this.fileOps.findFiles(pattern, targetPath, options);
    
    if (!result.success) {
      return colorize(result.message, 'red');
    }

    const results = result.data;
    if (!results || results.length === 0) {
      return colorize(`No files found matching "${pattern}"`, 'yellow');
    }

    let output = colorize(result.message, 'cyan') + '\n';
    output += colorize('─'.repeat(80), 'dim') + '\n';
    
    for (const file of results) {
      const type = file.type === 'directory' ? '📁' : '📄';
      const size = formatFileSize(file.size);
      const modified = formatDate(file.modified);
      
      output += `${type} ${colorize(file.name, file.type === 'directory' ? 'blue' : 'white')}\n`;
      output += `   ${colorize(`Size: ${size} | Modified: ${modified}`, 'dim')}\n`;
    }
    
    return output;
  }

  private async handleInfo(args: string[]): Promise<string> {
    if (args.length < 1) {
      return colorize('Usage: /file info <path>', 'yellow');
    }

    const targetPath = args[0];
    const result = await this.fileOps.getInfo(targetPath);
    
    if (!result.success) {
      return colorize(result.message, 'red');
    }

    const info = result.data;
    let output = colorize(result.message, 'cyan') + '\n';
    output += colorize('─'.repeat(50), 'dim') + '\n';
    
    output += `Name: ${colorize(info.name, 'white')}\n`;
    output += `Type: ${colorize(info.type, info.type === 'directory' ? 'blue' : 'green')}\n`;
    output += `Size: ${colorize(formatFileSize(info.size), 'yellow')}\n`;
    output += `Permissions: ${colorize(formatPermissions(parseInt(info.permissions, 8)), 'magenta')}\n`;
    output += `Created: ${colorize(formatDate(info.created), 'dim')}\n`;
    output += `Modified: ${colorize(formatDate(info.modified), 'dim')}\n`;
    output += `Accessed: ${colorize(formatDate(info.accessed), 'dim')}\n`;
    
    if (info.isSymlink) {
      output += `Symlink Target: ${colorize(info.symlinkTarget, 'blue')}\n`;
    }
    
    return output;
  }

  private async handlePwd(): Promise<string> {
    const currentDir = this.fileOps.getCurrentDir();
    return colorize(`Current directory: ${currentDir}`, 'cyan');
  }

  public showHelp(): string {
    return colorize(`📁 File Operations Commands:

Navigation:
  /file cd <path>              - Change directory
  /file pwd                    - Show current directory
  /file ls [path]              - List directory contents

File Operations:
  /file cp <src> <dest>        - Copy files/directories
    --recursive, -r            - Copy directories recursively
    --force, -f                - Overwrite existing files
  /file mv <src> <dest>        - Move/rename files
    --force, -f                - Overwrite existing files

Symbolic Links:
  /file ln <src> <link>        - Create symbolic link
    --force, -f                - Overwrite existing links
  /file links [path]           - List symbolic links

Search & Find:
  /file grep <term> [path]     - Search text in files
    --recursive, -r            - Search recursively
    --ignore-case, -i          - Case insensitive search
    --word, -w                 - Match whole words only
    --pattern <regex>          - File pattern filter
    --max-depth <n>            - Maximum search depth
  /file find <pattern> [path]  - Find files by name
    --recursive, -r            - Search recursively
    --type <file|dir|both>     - File type filter
    --max-depth <n>            - Maximum search depth

Information:
  /file info <path>            - Get detailed file info
  /file help                   - Show this help

Examples:
  /file cd /home/user
  /file ls --recursive
  /file cp file.txt backup/ --force
  /file ln /usr/bin/python3 py3
  /file grep "function" src/ --recursive --pattern "*.js"
  /file find "*.log" /var/log --type file`, 'cyan');
  }

  private extractOptionValue(args: string[], option: string): string | undefined {
    const index = args.indexOf(option);
    if (index !== -1 && index + 1 < args.length) {
      return args[index + 1];
    }
    return undefined;
  }
}
