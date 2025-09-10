// Centralized logging utility for consistent logging across the application

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARNING = 3,
  ERROR = 4,
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  context?: string;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private log(level: LogLevel, message: string, data?: any, context?: string): void {
    if (level < this.logLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      context,
    };

    this.logs.push(entry);

    const emoji = this.getEmoji(level);
    const prefix = context ? `[${context}]` : '';
    
    if (data) {
      console.log(`${emoji} ${prefix} ${message}`, data);
    } else {
      console.log(`${emoji} ${prefix} ${message}`);
    }
  }

  private getEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '🔍';
      case LogLevel.INFO: return 'ℹ️';
      case LogLevel.SUCCESS: return '✅';
      case LogLevel.WARNING: return '⚠️';
      case LogLevel.ERROR: return '❌';
      default: return '📝';
    }
  }

  debug(message: string, data?: any, context?: string): void {
    this.log(LogLevel.DEBUG, message, data, context);
  }

  info(message: string, data?: any, context?: string): void {
    this.log(LogLevel.INFO, message, data, context);
  }

  success(message: string, data?: any, context?: string): void {
    this.log(LogLevel.SUCCESS, message, data, context);
  }

  warning(message: string, data?: any, context?: string): void {
    this.log(LogLevel.WARNING, message, data, context);
  }

  error(message: string, data?: any, context?: string): void {
    this.log(LogLevel.ERROR, message, data, context);
  }

  // Specialized logging methods for common patterns
  ai(message: string, data?: any): void {
    this.info(message, data, 'AI');
  }

  storage(message: string, data?: any): void {
    this.info(message, data, 'Storage');
  }

  conversation(message: string, data?: any): void {
    this.info(message, data, 'Conversation');
  }

  file(message: string, data?: any): void {
    this.info(message, data, 'File');
  }

  gpt(message: string, data?: any): void {
    this.info(message, data, 'GPT');
  }

  auth(message: string, data?: any): void {
    this.info(message, data, 'Auth');
  }

  // Get all logs for debugging
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Clear logs
  clear(): void {
    this.logs = [];
  }
}

export const logger = Logger.getInstance();

