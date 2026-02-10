import mongoose from "mongoose";

const Message = new mongoose.Schema({
  conversation: { type: mongoose.Types.ObjectId, index: true, required: true },
  role: { type: String, enum: ["user", "assistant", "system"], required: true },
  content: { type: String, required: true },
  tokens: Number,
  meta: Object,
  owner: { type: mongoose.Types.ObjectId, index: true, required: true },
}, { timestamps: true });

Message.index({ conversation: 1, createdAt: 1 });

export default mongoose.model("Message", Message);
