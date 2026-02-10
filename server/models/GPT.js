import mongoose from 'mongoose';

const capabilitiesSchema = new mongoose.Schema({
  webSearch: {
    type: Boolean,
    default: false
  },
  canvas: {
    type: Boolean,
    default: false
  },
  imageGeneration: {
    type: Boolean,
    default: false
  },
  codeInterpreter: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const gptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  instructions: {
    type: String,
    required: true
  },
  conversationStarters: [{
    type: String,
    trim: true
  }],
  capabilities: {
    type: capabilitiesSchema,
    default: () => ({
      webSearch: false,
      canvas: false,
      imageGeneration: false,
      codeInterpreter: true
    })
  },
  modelId: {
    type: String,
    default: 'chatty-core'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  usage: {
    conversationsUsed: {
      type: Number,
      default: 0
    },
    messagesProcessed: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date,
      default: null
    }
  },
  metadata: {
    category: {
      type: String,
      default: 'general'
    },
    tags: [{
      type: String,
      trim: true
    }],
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    reviewCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for faster queries
gptSchema.index({ userId: 1, createdAt: -1 });
gptSchema.index({ userId: 1, isActive: 1 });
gptSchema.index({ isPublic: 1, createdAt: -1 });

// Update usage when GPT is used
gptSchema.methods.updateUsage = function() {
  this.usage.conversationsUsed += 1;
  this.usage.lastUsed = new Date();
  return this.save();
};

// Get public GPT data (for sharing)
gptSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    name: this.name,
    description: this.description,
    capabilities: this.capabilities,
    modelId: this.modelId,
    metadata: this.metadata,
    usage: this.usage,
    createdAt: this.createdAt
  };
};

// Get full GPT data (for user's own GPTs)
gptSchema.methods.getFullData = function() {
  return {
    id: this._id,
    name: this.name,
    description: this.description,
    instructions: this.instructions,
    conversationStarters: this.conversationStarters,
    capabilities: this.capabilities,
    modelId: this.modelId,
    isActive: this.isActive,
    isPublic: this.isPublic,
    usage: this.usage,
    metadata: this.metadata,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export default mongoose.model('GPT', gptSchema);
