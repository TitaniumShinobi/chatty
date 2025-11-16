import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  // Core Identity
  id: { type: String, required: true, unique: true }, // UUID
  email: { type: String, required: true, unique: true, index: true }, // unique: true creates index automatically
  name: { type: String, required: true },
  
  // Authentication
  password: { 
    type: String, 
    default: null 
  }, // PBKDF2 hash for email users (stored here, accessible as passwordHash via virtual)
  provider: { type: String, default: "email" }, // email|google|microsoft
  
  // Status & Lifecycle
  status: { type: String, default: "active" }, // active|deleted|suspended (indexed via schema.index below)
  deletedAt: { type: Date, default: null }, // indexed via schema.index below
  deletionReason: { type: String, default: null },
  canRestoreUntil: { type: Date, default: null }, // indexed via schema.index below
  
  // Audit Trail
  createdAt: { type: Date, default: Date.now }, // Manual creation timestamp
  lastLoginAt: { type: Date, default: null }, // Last login timestamp (also accessible as lastLogin via virtual)
  loginCount: { type: Number, default: 0 },
  
  // Construct-Aware Fields
  constructId: { type: String, unique: true, sparse: true }, // HUMAN-DEVON-001
  vvaultPath: { type: String, default: null, sparse: true }, // /vvault/users/{user_id}/ - null until user links VVAULT account
  vvaultUserId: { type: String, default: null, sparse: true }, // VVAULT user ID after linking (can be different email)
  vvaultLinkedAt: { type: Date, default: null }, // When user linked their VVAULT account
  
  // Security
  failedLoginAttempts: { type: Number, default: 0 },
  lastFailedLoginAt: { type: Date, default: null },
  ipAddresses: [{ type: String }], // Track login IPs
  
  // Legacy fields for backward compatibility
  uid: { type: String, unique: true, sparse: true, index: true, default: null }, // google sub or unique email ID (unique creates index)
  picture: String,
  emailVerified: { type: Boolean, default: false },
  phoneE164: { type: String, index: true, sparse: true }, // +1...
  phoneVerifiedAt: { type: Date },
  tier: { type: String, default: "free" }, // free|pro|enterprise
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt (createdAt will use manual default if provided)
});

// Virtual field aliases for API consistency
// passwordHash: alias for password field (PBKDF2 hash)
UserSchema.virtual('passwordHash').get(function() {
  return this.password;
}).set(function(value) {
  this.password = value;
});

// lastLogin: alias for lastLoginAt field
UserSchema.virtual('lastLogin').get(function() {
  return this.lastLoginAt;
}).set(function(value) {
  this.lastLoginAt = value;
});

// Ensure virtuals are included in JSON output
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// Compound indexes for efficient queries
UserSchema.index({ email: 1, status: 1 });
// constructId already has unique index from schema definition above
UserSchema.index({ deletedAt: 1 });
UserSchema.index({ canRestoreUntil: 1 });
UserSchema.index({ status: 1 });

export default mongoose.model("User", UserSchema);
