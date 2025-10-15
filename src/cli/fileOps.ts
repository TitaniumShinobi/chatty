// fileOps.ts - Advanced file operations CLI commands
// Provides directory navigation, file operations, symbolic links, and text search

import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readlink = promisify(fs.readlink);
const symlink = promisify(fs.symlink);
const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);

export interface FileOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export class FileOperationsCLI {
  private currentDir: string;

  constructor(initialDir?: string) {
    this.currentDir = initialDir || process.cwd();
  }

  /** Get current working directory */
  getCurrentDir(): string {
    return this.currentDir;
  }

  /** Safely navigate to a directory with confirmation */
  async safeCd(targetPath?: string): Promise<FileOperationResult> {
    try {
      const resolvedPath = targetPath ? path.resolve(this.currentDir, targetPath) : this.currentDir;
      const stats = await stat(resolvedPath);
      
      if (!stats.isDirectory()) {
        return {
          success: false,
          message: `Error: "${targetPath}" is not a directory`
        };
      }

      this.currentDir = resolvedPath;
      return {
        success: true,
        message: `Moved to ${this.currentDir}`,
        data: { path: this.currentDir }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot access directory "${targetPath}" - ${error.message}`
      };
    }
  }

  /** List directory contents with detailed information */
  async listDirectory(dirPath?: string): Promise<FileOperationResult> {
    try {
      const targetPath = dirPath ? path.resolve(this.currentDir, dirPath) : this.currentDir;
      const items = await readdir(targetPath);
      const detailedItems = [];

      for (const item of items) {
        const itemPath = path.join(targetPath, item);
        try {
          const stats = await stat(itemPath);
          const isSymlink = stats.isSymbolicLink();
          let symlinkTarget = '';
          
          if (isSymlink) {
            try {
              symlinkTarget = await readlink(itemPath);
            } catch (e) {
              symlinkTarget = 'broken link';
            }
          }

          detailedItems.push({
            name: item,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime,
            isSymlink,
            symlinkTarget: isSymlink ? symlinkTarget : undefined,
            permissions: stats.mode.toString(8).slice(-3)
          });
        } catch (e) {
          detailedItems.push({
            name: item,
            type: 'unknown',
            error: 'Cannot access'
          });
        }
      }

      return {
        success: true,
        message: `Contents of ${targetPath}`,
        data: detailedItems
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot access directory "${dirPath}" - ${error.message}`
      };
    }
  }

  /** Copy files/directories with robust error handling */
  async robustCp(source: string, destination: string, options: { recursive?: boolean; force?: boolean } = {}): Promise<FileOperationResult> {
    try {
      const sourcePath = path.resolve(this.currentDir, source);
      const destPath = path.resolve(this.currentDir, destination);

      // Check if source exists
      const sourceStats = await stat(sourcePath);
      
      // Check if destination exists
      let destExists = false;
      try {
        await stat(destPath);
        destExists = true;
      } catch (e) {
        // Destination doesn't exist, which is fine
      }

      if (destExists && !options.force) {
        return {
          success: false,
          message: `Error: Destination "${destination}" already exists. Use --force to overwrite.`
        };
      }

      if (sourceStats.isDirectory()) {
        if (!options.recursive) {
          return {
            success: false,
            message: `Error: Cannot copy directory "${source}" without --recursive flag`
          };
        }
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await copyFile(sourcePath, destPath);
      }

      return {
        success: true,
        message: `Copied "${source}" to "${destination}"`,
        data: { source: sourcePath, destination: destPath }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot copy "${source}" to "${destination}" - ${error.message}`
      };
    }
  }

  /** Move/rename files and directories */
  async moveFile(source: string, destination: string, options: { force?: boolean } = {}): Promise<FileOperationResult> {
    try {
      const sourcePath = path.resolve(this.currentDir, source);
      const destPath = path.resolve(this.currentDir, destination);

      // Check if source exists
      await stat(sourcePath);
      
      // Check if destination exists
      let destExists = false;
      try {
        await stat(destPath);
        destExists = true;
      } catch (e) {
        // Destination doesn't exist, which is fine
      }

      if (destExists && !options.force) {
        return {
          success: false,
          message: `Error: Destination "${destination}" already exists. Use --force to overwrite.`
        };
      }

      await fs.promises.rename(sourcePath, destPath);

      return {
        success: true,
        message: `Moved "${source}" to "${destination}"`,
        data: { source: sourcePath, destination: destPath }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot move "${source}" to "${destination}" - ${error.message}`
      };
    }
  }

  /** Create symbolic links with duplicate checking */
  async createSymlink(source: string, linkPath: string, options: { force?: boolean } = {}): Promise<FileOperationResult> {
    try {
      const sourcePath = path.resolve(this.currentDir, source);
      const linkTargetPath = path.resolve(this.currentDir, linkPath);

      // Check if source exists
      await stat(sourcePath);

      // Check if link already exists
      let linkExists = false;
      try {
        await stat(linkTargetPath);
        linkExists = true;
      } catch (e) {
        // Link doesn't exist, which is fine
      }

      if (linkExists && !options.force) {
        return {
          success: false,
          message: `Error: Link "${linkPath}" already exists. Use --force to overwrite.`
        };
      }

      // Remove existing link if force is enabled
      if (linkExists && options.force) {
        await fs.promises.unlink(linkTargetPath);
      }

      await symlink(sourcePath, linkTargetPath);
      const resolvedTarget = await readlink(linkTargetPath);

      return {
        success: true,
        message: `Created symlink "${linkPath}" -> "${resolvedTarget}"`,
        data: { source: sourcePath, link: linkTargetPath, target: resolvedTarget }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot create symbolic link "${linkPath}" - ${error.message}`
      };
    }
  }

  /** List all symbolic links in current directory */
  async listSymlinks(dirPath?: string): Promise<FileOperationResult> {
    try {
      const targetPath = dirPath ? path.resolve(this.currentDir, dirPath) : this.currentDir;
      const items = await readdir(targetPath);
      const symlinks = [];

      for (const item of items) {
        const itemPath = path.join(targetPath, item);
        try {
          const stats = await stat(itemPath);
          if (stats.isSymbolicLink()) {
            const target = await readlink(itemPath);
            symlinks.push({
              name: item,
              target,
              path: itemPath
            });
          }
        } catch (e) {
          // Skip items we can't access
        }
      }

      return {
        success: true,
        message: `Symbolic links in ${targetPath}`,
        data: symlinks
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot access directory "${dirPath}" - ${error.message}`
      };
    }
  }

  /** Robust text search across files and directories */
  async robustGrep(searchTerm: string, targetPath?: string, options: { 
    recursive?: boolean; 
    caseInsensitive?: boolean; 
    wholeWord?: boolean;
    filePattern?: string;
    maxDepth?: number;
  } = {}): Promise<FileOperationResult> {
    try {
      const searchPath = targetPath ? path.resolve(this.currentDir, targetPath) : this.currentDir;
      const results = await this.searchInPath(searchTerm, searchPath, options);

      return {
        success: true,
        message: `Search results for "${searchTerm}" in ${searchPath}`,
        data: results
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot search in "${targetPath}" - ${error.message}`
      };
    }
  }

  /** Find files by name pattern */
  async findFiles(pattern: string, dirPath?: string, options: { 
    recursive?: boolean; 
    maxDepth?: number;
    type?: 'file' | 'directory' | 'both';
  } = {}): Promise<FileOperationResult> {
    try {
      const searchPath = dirPath ? path.resolve(this.currentDir, dirPath) : this.currentDir;
      const results = await this.findInPath(pattern, searchPath, options);

      return {
        success: true,
        message: `Found files matching "${pattern}" in ${searchPath}`,
        data: results
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot search in "${dirPath}" - ${error.message}`
      };
    }
  }

  /** Get file/directory information */
  async getInfo(targetPath: string): Promise<FileOperationResult> {
    try {
      const fullPath = path.resolve(this.currentDir, targetPath);
      const stats = await stat(fullPath);
      
      let symlinkTarget = '';
      let isSymlink = false;
      
      if (stats.isSymbolicLink()) {
        isSymlink = true;
        try {
          symlinkTarget = await readlink(fullPath);
        } catch (e) {
          symlinkTarget = 'broken link';
        }
      }

      const info = {
        path: fullPath,
        name: path.basename(fullPath),
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        permissions: stats.mode.toString(8).slice(-3),
        isSymlink,
        symlinkTarget: isSymlink ? symlinkTarget : undefined,
        owner: stats.uid,
        group: stats.gid
      };

      return {
        success: true,
        message: `Information for ${targetPath}`,
        data: info
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error: Cannot get info for "${targetPath}" - ${error.message}`
      };
    }
  }

  // Private helper methods

  private async copyDirectory(source: string, destination: string): Promise<void> {
    await mkdir(destination, { recursive: true });
    const items = await readdir(source);

    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      const stats = await stat(sourcePath);

      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await copyFile(sourcePath, destPath);
      }
    }
  }

  private async searchInPath(searchTerm: string, searchPath: string, options: any, currentDepth = 0): Promise<any[]> {
    const results: any[] = [];
    
    if (options.maxDepth && currentDepth >= options.maxDepth) {
      return results;
    }

    try {
      const items = await readdir(searchPath);
      
      for (const item of items) {
        const itemPath = path.join(searchPath, item);
        
        try {
          const stats = await stat(itemPath);
          
          if (stats.isFile()) {
            if (options.filePattern && !item.match(new RegExp(options.filePattern))) {
              continue;
            }
            
            const content = await fs.promises.readFile(itemPath, 'utf-8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              let searchRegex = new RegExp(
                options.wholeWord ? `\\b${searchTerm}\\b` : searchTerm,
                options.caseInsensitive ? 'gi' : 'g'
              );
              
              if (searchRegex.test(line)) {
                results.push({
                  file: itemPath,
                  line: i + 1,
                  content: line.trim(),
                  match: searchTerm
                });
              }
            }
          } else if (stats.isDirectory() && options.recursive) {
            const subResults = await this.searchInPath(searchTerm, itemPath, options, currentDepth + 1);
            results.push(...subResults);
          }
        } catch (e) {
          // Skip items we can't access
        }
      }
    } catch (e) {
      // Skip directories we can't access
    }

    return results;
  }

  private async findInPath(pattern: string, searchPath: string, options: any, currentDepth = 0): Promise<any[]> {
    const results: any[] = [];
    
    if (options.maxDepth && currentDepth >= options.maxDepth) {
      return results;
    }

    try {
      const items = await readdir(searchPath);
      const regex = new RegExp(pattern, 'i');
      
      for (const item of items) {
        const itemPath = path.join(searchPath, item);
        
        try {
          const stats = await stat(itemPath);
          
          if (regex.test(item)) {
            if ((options.type === 'file' && stats.isFile()) ||
                (options.type === 'directory' && stats.isDirectory()) ||
                (options.type === 'both' || !options.type)) {
              results.push({
                name: item,
                path: itemPath,
                type: stats.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                modified: stats.mtime
              });
            }
          }
          
          if (stats.isDirectory() && options.recursive) {
            const subResults = await this.findInPath(pattern, itemPath, options, currentDepth + 1);
            results.push(...subResults);
          }
        } catch (e) {
          // Skip items we can't access
        }
      }
    } catch (e) {
      // Skip directories we can't access
    }

    return results;
  }
}

// Export utility functions for easy integration
export function formatFileSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export function formatDate(date: Date): string {
  return date.toLocaleString();
}

export function formatPermissions(mode: number): string {
  const permissions = mode.toString(8).slice(-3);
  const rwx = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  return permissions.split('').map(d => rwx[parseInt(d)]).join('');
}
