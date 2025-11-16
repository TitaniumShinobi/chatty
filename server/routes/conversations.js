import express from "express";
import { Store } from "../store.js";
import { requireAuth } from "../middleware/auth.js";

const r = express.Router();

// Apply authentication middleware to all routes
r.use(requireAuth);

r.get("/", async (req, res) => {
  try {
    console.log(`📥 Fetching conversations for user: ${req.user.email} (ID: ${req.user.sub})`);
    const rows = await Store.listConversations(req.user.sub);
    console.log(`✅ Loaded ${rows.length} conversations for user: ${req.user.email}`);
    res.json({ ok: true, conversations: rows });
  } catch (error) {
    console.error(`❌ List conversations error for user ${req.user.email}:`, error);
    res.status(500).json({ ok: false, error: "Failed to load conversations" });
  }
});

r.post("/", async (req, res) => {
  try {
    console.log(`📝 Creating conversation for user: ${req.user.email} (ID: ${req.user.sub})`);
    const doc = await Store.createConversation(req.user.sub, req.body || {});
    console.log(`✅ Created conversation ${doc._id} for user: ${req.user.email}`);
    res.status(201).json({ ok: true, conversation: doc });
  } catch (error) {
    console.error(`❌ Create conversation error for user ${req.user.email}:`, error);
    res.status(500).json({ ok: false, error: "Failed to create conversation" });
  }
});

r.get("/:id/messages", async (req, res) => {
  try {
    console.log(`📥 Fetching messages for conversation ${req.params.id}, user: ${req.user.email} (ID: ${req.user.sub})`);
    const rows = await Store.listMessages(req.user.sub, req.params.id);
    console.log(`✅ Loaded ${rows.length} messages for conversation ${req.params.id}, user: ${req.user.email}`);
    res.json({ ok: true, messages: rows });
  } catch (error) {
    console.error(`❌ List messages error for user ${req.user.email}, conversation ${req.params.id}:`, error);
    res.status(500).json({ ok: false, error: "Failed to load messages" });
  }
});

r.post("/:id/messages", async (req, res) => {
  try {
    console.log(`📝 Creating message for conversation ${req.params.id}, user: ${req.user.email} (ID: ${req.user.sub})`);
    const m = await Store.createMessage(req.user.sub, req.params.id, req.body);
    console.log(`✅ Created message ${m._id} for conversation ${req.params.id}, user: ${req.user.email}`);
    res.status(201).json({ ok: true, message: m });
  } catch (error) {
    console.error(`❌ Create message error for user ${req.user.email}, conversation ${req.params.id}:`, error);
    res.status(500).json({ ok: false, error: "Failed to create message" });
  }
});

export default r;
