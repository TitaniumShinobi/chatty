import crypto from "crypto";
import User from "./models/User.js";
import Conversation from "./models/Conversation.js";
import Message from "./models/Message.js";

let useMemory = !process.env.MONGODB_URI;
const mem = { users: new Map(), convs: new Map(), msgs: new Map() };

export const Store = {
  async upsertUser(u) {
    if (useMemory) {
      mem.users.set(u.uid, { id: u.uid, ...u });
      return { _id: u.uid, ...u };
    }
    return await User.findOneAndUpdate(
      { uid: u.uid },
      { name: u.name, email: u.email, picture: u.picture },
      { new: true, upsert: true }
    );
  },

  async createConversation(owner, data) {
    if (useMemory) {
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
    }
    return await Conversation.create({
      owner,
      title: data.title || "New chat",
      model: data.model || "gpt-4o"
    });
  },

  async listConversations(owner) {
    if (useMemory) {
      return Array.from(mem.convs.values())
        .filter(c => c.owner === owner)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return await Conversation.find({ owner }).sort({ updatedAt: -1 });
  },

  async createMessage(owner, conversation, msg) {
    if (useMemory) {
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
    }
    
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
  },

  async listMessages(owner, conversation) {
    if (useMemory) {
      return Array.from(mem.msgs.values())
        .filter(m => m.conversation === conversation && m.owner === owner)
        .sort((a, b) => a.createdAt - b.createdAt);
    }
    return await Message.find({ conversation, owner }).sort({ createdAt: 1 });
  }
};
