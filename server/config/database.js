import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatty');

    console.log(`📊 MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('⚠️  MongoDB connection failed:', error.message);
    console.log('💡 For development without MongoDB, set DEV_MODE=true in .env');
    
    // In development mode, continue without database
    if (process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true') {
      console.log('🚀 Continuing in development mode without database...');
      return;
    }
    
    // Throw error instead of exiting - let the caller decide what to do
    throw error;
  }
};
