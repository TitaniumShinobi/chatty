import express from "express";
import { Store } from "../store.js";

const r = express.Router();

r.get("/", async (req, res) => {
  try {
    const rows = await Store.listConversations(req.user.id);
    res.json({ ok: true, conversations: rows });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ ok: false, error: "Failed to load conversations" });
  }
});

r.post("/", async (req, res) => {
  try {
    const doc = await Store.createConversation(req.user.id, req.body || {});
    res.status(201).json({ ok: true, conversation: doc });
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ ok: false, error: "Failed to create conversation" });
  }
});

r.get("/:id/messages", async (req, res) => {
  try {
    const rows = await Store.listMessages(req.user.id, req.params.id);
    res.json({ ok: true, messages: rows });
  } catch (error) {
    console.error("List messages error:", error);
    res.status(500).json({ ok: false, error: "Failed to load messages" });
  }
});

r.post("/:id/messages", async (req, res) => {
  try {
    const m = await Store.createMessage(req.user.id, req.params.id, req.body);
    res.status(201).json({ ok: true, message: m });
  } catch (error) {
    console.error("Create message error:", error);
    res.status(500).json({ ok: false, error: "Failed to create message" });
  }
});

export default r;
