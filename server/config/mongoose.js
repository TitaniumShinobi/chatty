// server/config/mongoose.js
// Mongoose connection initialization helper

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Initialize mongoose connection to MongoDB Atlas
 * Must be called before importing any Store or model files
 */
export async function initMongoose() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required. Set it in .env file or export it.');
    }
    
    console.log('🔌 Initializing mongoose connection...');
    
    await mongoose.connect(mongoUri, {
      dbName: "chatty",
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    
    console.log('✅ Mongoose connected successfully!');
    
    // Set flag to enable database mode in Store
    process.env.MONGODB_AVAILABLE = 'true';
    console.log('🔧 Database mode enabled for Store');
    
  } catch (error) {
    console.error('❌ Mongoose connection failed:', error.message);
    console.log('🚀 Continuing in development mode without database...');
    process.env.MONGODB_AVAILABLE = 'false';
    throw error;
  }
}

/**
 * Close mongoose connection
 */
export async function closeMongoose() {
  try {
    await mongoose.connection.close();
    console.log('📊 Mongoose connection closed');
  } catch (error) {
    console.error('❌ Error closing mongoose connection:', error.message);
  }
}

/**
 * Check if mongoose is connected
 */
export function isMongooseConnected() {
  return mongoose.connection.readyState === 1;
}
