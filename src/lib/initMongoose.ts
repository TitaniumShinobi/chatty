// src/lib/initMongoose.ts
// Fault-tolerant mongoose initialization for Chatty

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface ConnectionConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: ConnectionConfig = {
  maxRetries: 5,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds
  timeoutMs: 10000,  // 10 seconds
};

let isInitialized = false;
let connectionPromise: Promise<void> | null = null;

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Get connection status
 */
export function isMongooseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Get detailed connection status
 */
export function getConnectionStatus(): {
  readyState: number;
  host: string;
  port: number;
  name: string;
  isConnected: boolean;
} {
  const connection = mongoose.connection;
  return {
    readyState: connection.readyState,
    host: connection.host || 'unknown',
    port: connection.port || 0,
    name: connection.name || 'unknown',
    isConnected: connection.readyState === 1,
  };
}

/**
 * Initialize mongoose connection with retry logic
 */
async function initializeMongoose(config: ConnectionConfig = DEFAULT_CONFIG): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    throw new Error('❌ MONGODB_URI not found in environment variables');
  }

  console.log('🔌 Initializing mongoose connection...');
  console.log(`📡 URI: ${mongoUri.replace(/:[^:@]*@/, ':***@')}`); // Hide password
  
  // Set mongoose options
  mongoose.set('strictQuery', true);
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      console.log(`🔄 Connection attempt ${attempt}/${config.maxRetries}...`);
      
      // Connect with timeout
      await Promise.race([
        mongoose.connect(mongoUri, {
          dbName: 'chatty',
          serverSelectionTimeoutMS: config.timeoutMs,
          connectTimeoutMS: config.timeoutMs,
          socketTimeoutMS: config.timeoutMs,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), config.timeoutMs)
        )
      ]);
      
      // Wait for connection to be ready
      await waitForConnectionReady();
      
      console.log('✅ Mongoose connected successfully!');
      console.log(`📊 Database: ${mongoose.connection.name}`);
      console.log(`🌐 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
      
      // Set flag to enable database mode in Store
      process.env.MONGODB_AVAILABLE = 'true';
      console.log('🔧 Database mode enabled for Store');
      
      isInitialized = true;
      return;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Connection attempt ${attempt} failed:`, lastError.message);
      
      if (attempt < config.maxRetries) {
        const delay = calculateBackoffDelay(attempt, config.baseDelayMs, config.maxDelayMs);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  // All retries failed
  console.error('❌ All connection attempts failed');
  console.error('🚀 Continuing in development mode without database...');
  process.env.MONGODB_AVAILABLE = 'false';
  
  throw new Error(`Failed to connect to MongoDB after ${config.maxRetries} attempts. Last error: ${lastError?.message}`);
}

/**
 * Wait for mongoose connection to be ready
 */
async function waitForConnectionReady(): Promise<void> {
  const maxWaitTime = 5000; // 5 seconds
  const checkInterval = 100; // 100ms
  let waited = 0;
  
  while (mongoose.connection.readyState !== 1 && waited < maxWaitTime) {
    await sleep(checkInterval);
    waited += checkInterval;
  }
  
  if (mongoose.connection.readyState !== 1) {
    throw new Error(`Connection not ready after ${maxWaitTime}ms. State: ${mongoose.connection.readyState}`);
  }
}

/**
 * Main function to wait for mongoose to be ready
 * This is the primary export that should be used in server.js
 */
export async function waitForMongooseReady(): Promise<void> {
  if (isInitialized && isMongooseConnected()) {
    console.log('✅ Mongoose already connected');
    return;
  }
  
  if (connectionPromise) {
    console.log('⏳ Waiting for existing connection attempt...');
    return connectionPromise;
  }
  
  connectionPromise = initializeMongoose();
  
  try {
    await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

/**
 * Close mongoose connection
 */
export async function closeMongoose(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('📊 Mongoose connection closed');
    }
    isInitialized = false;
    process.env.MONGODB_AVAILABLE = 'false';
  } catch (error) {
    console.error('❌ Error closing mongoose connection:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Health check for mongoose connection
 */
export async function mongooseHealthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  details: any;
  error?: string;
}> {
  try {
    if (!isMongooseConnected()) {
      return {
        status: 'unhealthy',
        details: getConnectionStatus(),
        error: 'Not connected'
      };
    }
    
    // Ping the database
    await mongoose.connection.db.admin().ping();
    
    return {
      status: 'healthy',
      details: getConnectionStatus()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: getConnectionStatus(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Export default for easy importing
export default {
  waitForMongooseReady,
  isMongooseConnected,
  getConnectionStatus,
  closeMongoose,
  mongooseHealthCheck,
};
