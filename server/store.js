import crypto from "crypto";
import mongoose from "mongoose";
import User from "./models/User.js";
import Conversation from "./models/Conversation.js";
import Message from "./models/Message.js";

let useMemory = !process.env.MONGODB_URI || process.env.DEV_MODE === "true";
const mem = { users: new Map(), convs: new Map(), msgs: new Map() };
let warnedMongoFallback = false;

function shouldUseMemory() {
  if (useMemory) return true;

  // Mongoose readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const mongoReady = mongoose.connection.readyState === 1;
  if (!mongoReady) {
    if (!warnedMongoFallback) {
      warnedMongoFallback = true;
      console.warn(
        `⚠️ [Store] Mongo unavailable (readyState=${mongoose.connection.readyState}); using in-memory fallback`
      );
    }
    return true;
  }

  warnedMongoFallback = false;
  return false;
}

async function withMongoFallback(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    const msg = String(error?.message || "");
    const transientMongoIssue =
      msg.includes("buffering timed out") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("not connected") ||
      msg.includes("topology was destroyed");

    if (transientMongoIssue) {
      console.warn(`⚠️ [Store] Mongo operation failed, using in-memory fallback: ${msg}`);
      return fallback();
    }
    throw error;
  }
}

export const Store = {
  async upsertUser(u) {
    const memoryDoc = () => {
      mem.users.set(u.uid, { id: u.uid, ...u });
      return { _id: u.uid, ...u };
    };
    if (shouldUseMemory()) {
      return memoryDoc();
    }
    return await withMongoFallback(
      () =>
        User.findOneAndUpdate(
          { uid: u.uid },
          { name: u.name, email: u.email, picture: u.picture },
          { new: true, upsert: true }
        ),
      memoryDoc
    );
  },

  async createConversation(owner, data) {
    const memoryDoc = () => {
      const id = crypto.randomUUID();
      const doc = {
        _id: id,
        owner,
        title: data.title || "New chat",
        model: data.model || "gpt-4o",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mem.convs.set(id, doc);
      return doc;
    };
    if (shouldUseMemory()) {
      return memoryDoc();
    }
    return await withMongoFallback(
      () =>
        Conversation.create({
          owner,
          title: data.title || "New chat",
          model: data.model || "gpt-4o"
        }),
      memoryDoc
    );
  },

  async listConversations(owner) {
    const memoryRows = () => {
      return Array.from(mem.convs.values())
        .filter(c => c.owner === owner)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    };
    if (shouldUseMemory()) {
      return memoryRows();
    }
    return await withMongoFallback(
      () => Conversation.find({ owner }).sort({ updatedAt: -1 }),
      memoryRows
    );
  },

  async createMessage(owner, conversation, msg) {
    const memoryDoc = () => {
      const id = crypto.randomUUID();
      const doc = {
        _id: id,
        conversation,
        owner,
        role: msg.role,
        content: msg.content,
        tokens: msg.tokens,
        meta: msg.meta,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mem.msgs.set(id, doc);
      
      // Update conversation timestamp
      const conv = mem.convs.get(conversation);
      if (conv) {
        conv.updatedAt = new Date();
      }
      
      return doc;
    };
    if (shouldUseMemory()) {
      return memoryDoc();
    }
    
    return await withMongoFallback(async () => {
      const message = await Message.create({
        conversation,
        owner,
        role: msg.role,
        content: msg.content,
        tokens: msg.tokens,
        meta: msg.meta
      });
      
      // Update conversation timestamp
      await Conversation.findByIdAndUpdate(conversation, { updatedAt: new Date() });
      
      return message;
    }, memoryDoc);
  },

  async listMessages(owner, conversation) {
    const memoryRows = () => {
      return Array.from(mem.msgs.values())
        .filter(m => m.conversation === conversation && m.owner === owner)
        .sort((a, b) => a.createdAt - b.createdAt);
    };
    if (shouldUseMemory()) {
      return memoryRows();
    }
    return await withMongoFallback(
      () => Message.find({ conversation, owner }).sort({ createdAt: 1 }),
      memoryRows
    );
  }
};
