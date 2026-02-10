import mongoose from "mongoose";

const DeletionRegistrySchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true }, // unique: true creates index automatically
  originalUserId: { type: String, required: true }, // Reference to original user
  deletedAt: { type: Date, default: Date.now },
  deletionReason: { type: String, default: "user_requested" },
  canRestoreUntil: { type: Date, required: true }, // 30 days from deletion
  isPermanentlyDeleted: { type: Boolean, default: false },
  permanentlyDeletedAt: { type: Date, default: null },
  
  // Metadata
  userAgent: String,
  ipAddress: String,
  deletionMethod: { type: String, default: "self_service" }, // self_service|admin|automated
});

// Index for cleanup queries
DeletionRegistrySchema.index({ canRestoreUntil: 1 });
DeletionRegistrySchema.index({ isPermanentlyDeleted: 1 });

export default mongoose.model("DeletionRegistry", DeletionRegistrySchema);
