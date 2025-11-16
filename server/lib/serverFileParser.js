// Server-compatible file parser for Node.js
// Simplified version that works without browser APIs

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export class ServerFileParser {
  static async parseFile(file, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB
      extractText = true,
      storeContent = true
    } = options;

    try {
      // Read file content
      let buffer;
      if (file.buffer && Buffer.isBuffer(file.buffer)) {
        buffer = file.buffer;
      } else if (file.buffer && typeof file.buffer === 'string') {
        buffer = Buffer.from(file.buffer, 'base64');
      } else if (file.path && typeof file.path === 'string') {
        buffer = await fs.readFile(file.path);
      } else {
        throw new Error('No file path or buffer provided for parsing');
      }
      
      if (buffer.length > maxSize) {
        throw new Error(`File too large: ${buffer.length} bytes (max: ${maxSize})`);
      }

      // Convert to base64 for storage
      const content = buffer.toString('base64');
      
      // Extract text based on file type
      let extractedText = '';
      const fileExtension = path.extname(file.originalname || file.name || '').toLowerCase();
      
      if (extractText) {
        extractedText = await this.extractTextFromBuffer(buffer, fileExtension);
      }

      // Generate metadata
      const metadata = {
        fileCategory: this.getFileCategory(fileExtension),
        programmingLanguage: this.getProgrammingLanguage(fileExtension),
        encoding: 'utf-8',
        lastModified: new Date().toISOString(),
        wordCount: extractedText.split(/\s+/).filter(word => word.length > 0).length,
        complexity: this.assessComplexity(extractedText, fileExtension)
      };

      return {
        name: file.originalname || file.name || 'unknown',
        type: file.mimetype || file.type || 'application/octet-stream',
        size: buffer.length,
        content: storeContent ? content : '',
        extractedText,
        metadata
      };
    } catch (error) {
      console.error('Error parsing file:', error);
      throw error;
    }
  }

  static async extractTextFromBuffer(buffer, fileExtension) {
    try {
      switch (fileExtension) {
        case '.txt':
        case '.md':
        case '.json':
        case '.js':
        case '.ts':
        case '.tsx':
        case '.jsx':
        case '.py':
        case '.html':
        case '.css':
        case '.xml':
        case '.csv':
          return buffer.toString('utf-8');
        
        case '.pdf':
          // For PDF, we'll need a PDF parser library
          // For now, return a placeholder
          return '[PDF content - text extraction not implemented on server]';
        
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.webp':
          return '[Image file - OCR not available on server]';
        
        default:
          return '[Binary file - text extraction not available]';
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      return '[Error extracting text]';
    }
  }

  static getFileCategory(extension) {
    const categories = {
      '.txt': 'text',
      '.md': 'markdown',
      '.json': 'data',
      '.js': 'code',
      '.ts': 'code',
      '.tsx': 'code',
      '.jsx': 'code',
      '.py': 'code',
      '.html': 'web',
      '.css': 'web',
      '.xml': 'data',
      '.csv': 'data',
      '.pdf': 'document',
      '.png': 'image',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.gif': 'image',
      '.webp': 'image'
    };
    return categories[extension] || 'unknown';
  }

  static getProgrammingLanguage(extension) {
    const languages = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.xml': 'xml',
      '.csv': 'csv'
    };
    return languages[extension] || null;
  }

  static assessComplexity(text, extension) {
    if (!text || text.length < 100) return 'simple';
    
    const lines = text.split('\n').length;
    const words = text.split(/\s+/).length;
    
    if (extension === '.py' || extension === '.js' || extension === '.ts') {
      // Code complexity assessment
      const functions = (text.match(/function|def|class|const|let|var/g) || []).length;
      if (functions > 10 || lines > 200) return 'complex';
      if (functions > 3 || lines > 50) return 'moderate';
      return 'simple';
    }
    
    // Text complexity assessment
    if (words > 1000 || lines > 100) return 'complex';
    if (words > 200 || lines > 20) return 'moderate';
    return 'simple';
  }

  static generateSummary(fileInfo) {
    const { name, type, size, metadata } = fileInfo;
    const sizeKB = Math.round(size / 1024);
    
    let summary = `${name} (${sizeKB}KB, ${type})`;
    
    if (metadata.programmingLanguage) {
      summary += ` - ${metadata.programmingLanguage} code`;
    } else if (metadata.fileCategory === 'image') {
      summary += ` - Image file`;
    } else if (metadata.fileCategory === 'document') {
      summary += ` - Document`;
    } else if (metadata.wordCount > 0) {
      summary += ` - ${metadata.wordCount} words`;
    }
    
    return summary;
  }
}
