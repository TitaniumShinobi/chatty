import mongoose from "mongoose";

const File = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  key: { type: String, index: true }, // S3 key
  name: String, 
  mime: String, 
  bytes: Number,
  sha256: String,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("File", File);
