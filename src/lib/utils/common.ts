// Common utility functions to eliminate code duplication

/**
 * Generate a unique ID using timestamp
 */
export const generateId = (): string => Date.now().toString();

/**
 * Generate an ISO timestamp string
 */
export const generateTimestamp = (): string => new Date().toISOString();

/**
 * Select a random item from an array
 */
export const selectRandom = <T>(array: T[]): T => {
  if (array.length === 0) {
    throw new Error('Cannot select from empty array');
  }
  return array[Math.floor(Math.random() * array.length)];
};

/**
 * Create a delay promise
 */
export const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if a message contains any greeting words
 */
export const isGreeting = (message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
  return greetings.some(greeting => lowerMessage.includes(greeting));
};

/**
 * Check if a message is a question
 */
export const isQuestion = (message: string): boolean => {
  return message.includes('?') || 
         message.toLowerCase().startsWith('what') ||
         message.toLowerCase().startsWith('how') ||
         message.toLowerCase().startsWith('why') ||
         message.toLowerCase().startsWith('when') ||
         message.toLowerCase().startsWith('where') ||
         message.toLowerCase().startsWith('who');
};

/**
 * Format file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Generate a random string for unique identifiers
 */
export const generateRandomString = (length: number = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

