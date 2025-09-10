import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  uid: { type: String, unique: true, index: true },   // google sub
  name: String,
  email: { type: String, index: true },
  picture: String,
  emailVerified: { type: Boolean, default: false },
  phoneE164: { type: String, index: true, sparse: true }, // +1...
  phoneVerifiedAt: { type: Date },
  provider: { type: String, default: "google" },
  tier: { type: String, default: "free" }, // free|pro|enterprise
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("User", UserSchema);
