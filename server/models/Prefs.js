import mongoose from "mongoose";

const PrefsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, unique: true },
  theme: { type: String, default: "dark" },
  defaultModel: { type: String, default: "gpt-4o-mini" },
  systemPrompt: { type: String, default: "" },
  shortcuts: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Prefs", PrefsSchema);
