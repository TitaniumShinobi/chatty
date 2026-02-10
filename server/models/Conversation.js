import mongoose from "mongoose";

const Conversation = new mongoose.Schema({
  owner: { type: mongoose.Types.ObjectId, index: true, required: true },
  title: String,
  model: String,
  meta: Object,
}, { timestamps: true });

Conversation.index({ owner: 1, updatedAt: -1 });

export default mongoose.model("Conversation", Conversation);
