import mongoose from "mongoose";

/**
 * Singleton Conversation Model
 * 
 * Each user has exactly one conversation per model:
 * - One for base Chatty model
 * - One for each GPT created
 * 
 * Unlimited memory stacking from VVAULT
 */
const SingletonConversationSchema = new mongoose.Schema({
  // User identity
  userId: { type: String, required: true, index: true }, // User's constructId
  userEmail: { type: String, required: true, index: true },
  
  // Model identification
  modelId: { type: String, required: true }, // "chatty-base" or GPT ID
  modelName: { type: String, required: true }, // Human-readable name
  modelType: { type: String, enum: ['base', 'gpt'], default: 'base' },
  
  // VVAULT integration
  vvaultPath: { type: String, required: true }, // Path to conversation in VVAULT
  memoryStackSize: { type: Number, default: 0 }, // Number of messages in VVAULT
  
  // Conversation metadata
  title: { type: String, default: 'Chat' },
  isActive: { type: Boolean, default: true },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now },
  
  // Statistics
  messageCount: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  
}, { timestamps: true });

// Ensure singleton: one conversation per user per model
SingletonConversationSchema.index({ userId: 1, modelId: 1 }, { unique: true });

// Performance indexes
SingletonConversationSchema.index({ userId: 1, updatedAt: -1 });
SingletonConversationSchema.index({ userEmail: 1, modelType: 1 });

/**
 * Static method to get or create singleton conversation
 * Path: vvault/chatty/conversations/{constructId}/chat.json
 */
SingletonConversationSchema.statics.getOrCreateSingleton = async function(constructId, userEmail, modelId, modelName, modelType = 'base') {
  const vvaultPath = `vvault/chatty/conversations/${constructId}/chat.json`;
  
  let conversation = await this.findOne({ userId: constructId, modelId });
  
  if (!conversation) {
    conversation = new this({
      userId: constructId,
      userEmail,
      modelId,
      modelName,
      modelType,
      vvaultPath,
      title: modelType === 'base' ? 'Chatty Chat' : `${modelName} Chat`
    });
    
    await conversation.save();
    console.log(`🏗️ Created singleton conversation for ${constructId} - ${modelName}`);
  }
  
  return conversation;
};

/**
 * Instance method to update conversation activity
 */
SingletonConversationSchema.methods.updateActivity = function() {
  this.updatedAt = new Date();
  this.lastMessageAt = new Date();
  this.messageCount += 1;
  return this.save();
};

/**
 * Instance method to update memory stack size from VVAULT
 */
SingletonConversationSchema.methods.updateMemoryStack = async function(newSize) {
  this.memoryStackSize = newSize;
  this.updatedAt = new Date();
  return this.save();
};

export default mongoose.model("SingletonConversation", SingletonConversationSchema);
