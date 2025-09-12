// JavaScript version of logger for CLI compatibility

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  SUCCESS: 2,
  WARNING: 3,
  ERROR: 4,
};

class Logger {
  constructor() {
    this.logLevel = LogLevel.INFO;
    this.logs = [];
  }

  static getInstance() {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level) {
    this.logLevel = level;
  }

  log(level, message, data, context) {
    if (level < this.logLevel) return;

    const entry = {
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

  getEmoji(level) {
    switch (level) {
      case LogLevel.DEBUG: return '🔍';
      case LogLevel.INFO: return 'ℹ️';
      case LogLevel.SUCCESS: return '✅';
      case LogLevel.WARNING: return '⚠️';
      case LogLevel.ERROR: return '❌';
      default: return '📝';
    }
  }

  debug(message, data, context) {
    this.log(LogLevel.DEBUG, message, data, context);
  }

  info(message, data, context) {
    this.log(LogLevel.INFO, message, data, context);
  }

  success(message, data, context) {
    this.log(LogLevel.SUCCESS, message, data, context);
  }

  warning(message, data, context) {
    this.log(LogLevel.WARNING, message, data, context);
  }

  error(message, data, context) {
    this.log(LogLevel.ERROR, message, data, context);
  }

  // Specialized logging methods for common patterns
  ai(message, data) {
    this.info(message, data, 'AI');
  }

  storage(message, data) {
    this.info(message, data, 'Storage');
  }

  conversation(message, data) {
    this.info(message, data, 'Conversation');
  }

  file(message, data) {
    this.info(message, data, 'File');
  }

  gpt(message, data) {
    this.info(message, data, 'GPT');
  }

  auth(message, data) {
    this.info(message, data, 'Auth');
  }

  // Get all logs for debugging
  getLogs() {
    return [...this.logs];
  }

  // Clear logs
  clear() {
    this.logs = [];
  }
}

export const logger = Logger.getInstance();
