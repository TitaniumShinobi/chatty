import crypto from "crypto";
import { generateUserId } from "./lib/userIdGenerator.js";
import mongoose from "mongoose";
import { userRegistryEvents } from './lib/userRegistryEvents.js';

const FORCE_MEMORY_STORE = process.env.FORCE_MEMORY_STORE === "true";
const DB_WAIT_TIMEOUT_MS = 10_000;

// In-memory store used only when explicitly forced or when MongoDB
// is unavailable during boot.
const mem = {
  users: new Map(),
  convs: new Map(),
  msgs: new Map(),
  conversations: new Map(),
};

let cachedModels = null;
let modelsInitPromise = null;

function shouldUseMemoryStore() {
  if (FORCE_MEMORY_STORE) {
    console.log('⚠️ [Store] FORCE_MEMORY_STORE=true - Using memory mode');
    return true;
  }
  const useMemory = process.env.MONGODB_AVAILABLE !== "true";
  if (useMemory) {
    console.log('⚠️ [Store] MONGODB_AVAILABLE is not "true" - Falling back to memory mode');
    console.log(`⚠️ [Store] MONGODB_AVAILABLE=${process.env.MONGODB_AVAILABLE}`);
    console.log(`⚠️ [Store] Mongoose readyState=${mongoose.connection.readyState}`);
  }
  return useMemory;
}

async function waitForConnectionReady(timeoutMs = DB_WAIT_TIMEOUT_MS) {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (mongoose.connection.readyState === 0) {
    throw new Error(
      "[Store] Mongoose is not initialized. Call initMongoose() before importing the Store."
    );
  }

  if (mongoose.connection.readyState === 3) {
    throw new Error("[Store] Mongoose is disconnecting; cannot initialize models.");
  }

  await Promise.race([
    new Promise((resolve, reject) => {
      const onConnected = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onDisconnected = () => {
        cleanup();
        reject(new Error("Mongoose disconnected while waiting for readiness."));
      };
      const cleanup = () => {
        mongoose.connection.off("connected", onConnected);
        mongoose.connection.off("error", onError);
        mongoose.connection.off("disconnected", onDisconnected);
      };

      mongoose.connection.once("connected", onConnected);
      mongoose.connection.once("error", onError);
      mongoose.connection.once("disconnected", onDisconnected);
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for mongoose connection.")), timeoutMs)
    ),
  ]);

  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      `[Store] Expected mongoose readyState=1 after waiting, got ${mongoose.connection.readyState}.`
    );
  }
}

async function initModels() {
  if (cachedModels) {
    return cachedModels;
  }

  if (!modelsInitPromise) {
    modelsInitPromise = (async () => {
      await waitForConnectionReady();

      const [
        { default: User },
        { default: Conversation },
        { default: Message },
        { default: DeletionRegistry },
      ] = await Promise.all([
        import("./models/User.js"),
        import("./models/Conversation.js"),
        import("./models/Message.js"),
        import("./models/DeletionRegistry.js"),
      ]);

      cachedModels = { User, Conversation, Message, DeletionRegistry };
      return cachedModels;
    })();
  }

  try {
    const models = await modelsInitPromise;
    modelsInitPromise = null;
    return models;
  } catch (error) {
    modelsInitPromise = null;
    cachedModels = null;
    throw error;
  }
}

async function maybeGetModels() {
  if (shouldUseMemoryStore()) {
    return null;
  }

  console.log('✅ [Store] Using database mode - Initializing Mongoose models...');
  const models = await initModels();
  console.log('✅ [Store] Mongoose models loaded successfully');
  return models;
}

export const Store = {
  async upsertUser(u) {
    const models = await maybeGetModels();
    if (!models) {
      console.log(`⚠️ [Store] upsertUser: Using memory mode for uid=${u.uid}, email=${u.email}`);
      const user = { id: u.uid, ...u };
      mem.users.set(u.uid, user);
      return { _id: u.uid, ...user };
    }

    console.log(`📥 [Store] upsertUser: Using MongoDB - uid=${u.uid}, email=${u.email}`);
    const { User } = models;
    
    // First, try to find existing user by uid (OAuth sub)
    let existingUser = await User.findOne({ uid: u.uid });
    
    // If not found by uid, try to find by email (for OAuth users who might have different uids)
    if (!existingUser && u.email) {
      existingUser = await User.findOne({ email: u.email, status: "active" });
    }
    
    if (existingUser) {
      console.log(`🔄 [Store] upsertUser: Updating existing user in MongoDB - _id=${existingUser._id}, email=${existingUser.email}`);
      // Update existing user - preserve all identity fields, only update mutable fields
      const updatedUser = await User.findOneAndUpdate(
        { _id: existingUser._id }, // Use the found user's ID
        {
          name: u.name,
          email: u.email,
          picture: u.picture,
          password: u.password,
          provider: u.provider,
          lastLoginAt: new Date(),
          loginCount: (existingUser.loginCount || 0) + 1,
          // Update uid if it's different (OAuth sub might change)
          uid: u.uid || existingUser.uid,
        },
        { new: true }
      );
      
      console.log(`✅ [Store] upsertUser: User updated in MongoDB - _id=${updatedUser._id}`);
      
      // Emit user update event for cross-system sync
      userRegistryEvents.emitUserUpdated(updatedUser);
      
      return updatedUser;
    } else {
      // Create new user - generate all required identity fields
      // NOTE: VVAULT account linking is separate - users must link their VVAULT account manually
      // Generate user ID in format: {{name}}_{{auto_gen_number}}
      const userId = generateUserId(u.name);
      const constructId = `HUMAN-${u.name.toUpperCase().replace(/\s+/g, "-")}-${Date.now()}`;
      // vvaultPath is null by default - user must link VVAULT account separately
      const vvaultPath = null;

      const userData = {
        id: userId,
        uid: u.uid,
        email: u.email,
        name: u.name,
        password: u.password,
        provider: u.provider || "email",
        status: "active",
        constructId,
        vvaultPath, // null until user links VVAULT account
        createdAt: new Date(),
        lastLoginAt: new Date(),
        loginCount: 1,
        picture: u.picture,
        emailVerified: u.emailVerified || false,
        phoneE164: u.phoneE164,
        phoneVerifiedAt: u.phoneVerifiedAt,
        tier: u.tier || "free",
      };

      console.log(`🏗️ [Store] upsertUser: Creating new user in MongoDB with construct ID: ${constructId}`);
      console.log(`📁 [Store] upsertUser: VVAULT path: ${vvaultPath} (user must link VVAULT account separately)`);
      console.log(`📥 [Store] upsertUser: User data: email=${userData.email}, uid=${userData.uid}`);

      const newUser = await User.create(userData);
      
      console.log(`✅ [Store] upsertUser: User created in MongoDB - _id=${newUser._id}, email=${newUser.email}`);
      console.log(`ℹ️  [Store] upsertUser: User must link VVAULT account separately - no auto-creation`);
      
      // Do NOT emit user creation event for VVAULT sync - VVAULT is a separate service
      // userRegistryEvents.emitUserCreated(userData);
      
      return newUser;
    }
  },

  async createUser(u) {
    const models = await maybeGetModels();
    if (!models) {
      console.log(`⚠️ [Store] createUser: Using memory mode for uid=${u.uid}, email=${u.email}`);
      const user = { id: u.uid, ...u };
      mem.users.set(u.uid, user);
      return { _id: u.uid, ...user };
    }

    console.log(`📥 [Store] createUser: Using MongoDB - uid=${u.uid}, email=${u.email}`);
    const { User } = models;
    // Generate user ID in format: {{name}}_{{auto_gen_number}}
    const userId = u.id || generateUserId(u.name);
    const constructId = `HUMAN-${u.name.toUpperCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const vvaultPath = `/vvault/users/${userId}/`;

    const userData = {
      id: userId,
      email: u.email,
      name: u.name,
      password: u.password,
      provider: u.provider || "email",
      status: "active",
      constructId,
      vvaultPath,
      createdAt: new Date(),
      lastLoginAt: new Date(),
      loginCount: 1,
      uid: u.uid || userId,
      picture: u.picture,
      emailVerified: u.emailVerified || false,
      phoneE164: u.phoneE164,
      phoneVerifiedAt: u.phoneVerifiedAt,
      tier: u.tier || "free",
    };

    console.log(`🏗️ [Store] createUser: Creating user in MongoDB with construct ID: ${constructId}`);
    console.log(`📁 [Store] createUser: VVAULT path: ${vvaultPath}`);
    console.log(`📥 [Store] createUser: User data: email=${userData.email}, uid=${userData.uid}`);

    const newUser = await User.create(userData);
    console.log(`✅ [Store] createUser: User created in MongoDB - _id=${newUser._id}, email=${newUser.email}`);
    return newUser;
  },

  async findUserByEmail(email) {
    const models = await maybeGetModels();
    if (!models) {
      console.log(`⚠️ [Store] findUserByEmail: Using memory mode for email=${email}`);
      return (
        Array.from(mem.users.values()).find((user) => user.email === email) || null
      );
    }

    console.log(`📥 [Store] findUserByEmail: Querying MongoDB for email=${email}`);
    const { User } = models;
    const user = await User.findOne({ email, status: "active" });
    if (user) {
      console.log(`✅ [Store] findUserByEmail: Found user in MongoDB - _id=${user._id}`);
    } else {
      console.log(`❌ [Store] findUserByEmail: User not found in MongoDB for email=${email}`);
    }
    return user;
  },

  async updateUserPassword(userId, newPasswordHash) {
    const models = await maybeGetModels();
    if (!models) {
      const user = mem.users.get(userId);
      if (user) {
        user.password = newPasswordHash;
        mem.users.set(userId, user);
        return { _id: userId, ...user };
      }
      return null;
    }

    const { User } = models;
    return User.findByIdAndUpdate(
      userId,
      { password: newPasswordHash },
      { new: true }
    );
  },

  async updateUser(userId, updateData) {
    const models = await maybeGetModels();
    if (!models) {
      const user = mem.users.get(userId);
      if (user) {
        Object.assign(user, updateData);
        mem.users.set(userId, user);
        return { _id: userId, ...user };
      }
      return null;
    }

    const { User } = models;
    return User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );
  },

  async scheduleAccountDeletion(userId, reason = "user_requested", metadata = {}) {
    const models = await maybeGetModels();
    if (!models) {
      console.log(
        `⚠️ Account deletion not supported in memory mode for user: ${userId}`
      );
      return { success: false, error: "Account deletion not supported in memory mode" };
    }

    const { User, DeletionRegistry, Conversation, Message } = models;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      if (user.isDeleted) {
        return { success: false, error: "Account already deleted" };
      }

      const now = new Date();
      const canRestoreUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await User.findByIdAndUpdate(userId, {
        isDeleted: true,
        deletedAt: now,
        deletionScheduledAt: now,
        deletionReason: reason,
        canRestoreUntil,
      });

      await DeletionRegistry.findOneAndUpdate(
        { email: user.email },
        {
          email: user.email,
          originalUserId: userId,
          deletedAt: now,
          deletionReason: reason,
          canRestoreUntil,
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
          deletionMethod: metadata.deletionMethod || "self_service",
        },
        { upsert: true, new: true }
      );

      console.log(`🗑️ Account deletion scheduled for user: ${user.email} (ID: ${userId})`);
      return {
        success: true,
        message: "Account deletion scheduled. You have 30 days to restore your account.",
        canRestoreUntil,
      };
    } catch (error) {
      console.error(`❌ Failed to schedule account deletion for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  },

  async restoreAccount(userId) {
    const models = await maybeGetModels();
    if (!models) {
      console.log(
        `⚠️ Account restoration not supported in memory mode for user: ${userId}`
      );
      return { success: false, error: "Account restoration not supported in memory mode" };
    }

    const { User, DeletionRegistry } = models;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      if (!user.isDeleted) {
        return { success: false, error: "Account is not deleted" };
      }

      if (user.canRestoreUntil && new Date() > user.canRestoreUntil) {
        return { success: false, error: "Restoration period has expired" };
      }

      await User.findByIdAndUpdate(userId, {
        isDeleted: false,
        deletedAt: null,
        deletionScheduledAt: null,
        deletionReason: null,
        canRestoreUntil: null,
      });

      await DeletionRegistry.findOneAndDelete({ email: user.email });

      console.log(`✅ Account restored for user: ${user.email} (ID: ${userId})`);
      return { success: true, message: "Account restored successfully" };
    } catch (error) {
      console.error(`❌ Failed to restore account for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  },

  async permanentlyDeleteAccount(userId) {
    const models = await maybeGetModels();
    if (!models) {
      console.log(
        `⚠️ Permanent account deletion not supported in memory mode for user: ${userId}`
      );
      return {
        success: false,
        error: "Permanent account deletion not supported in memory mode",
      };
    }

    const { User, Conversation, Message, DeletionRegistry } = models;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      const now = new Date();

      await User.findByIdAndDelete(userId);
      await Conversation.deleteMany({ userId });
      await Message.deleteMany({ userId });

      await DeletionRegistry.findOneAndUpdate(
        { email: user.email },
        {
          isPermanentlyDeleted: true,
          permanentlyDeletedAt: now,
        }
      );

      console.log(`🗑️ Account permanently deleted for user: ${user.email} (ID: ${userId})`);
      return { success: true, message: "Account permanently deleted" };
    } catch (error) {
      console.error(`❌ Failed to permanently delete account for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  },

  async isEmailDeleted(email) {
    const models = await maybeGetModels();
    if (!models) {
      return false;
    }

    const { DeletionRegistry } = models;
    try {
      const registryEntry = await DeletionRegistry.findOne({ email });
      return registryEntry && !registryEntry.isPermanentlyDeleted;
    } catch (error) {
      console.error(`❌ Failed to check deletion status for email ${email}:`, error);
      return false;
    }
  },

  async cleanupExpiredDeletions() {
    const models = await maybeGetModels();
    if (!models) {
      return { cleaned: 0 };
    }

    const { DeletionRegistry } = models;

    try {
      const now = new Date();
      const expiredDeletions = await DeletionRegistry.find({
        canRestoreUntil: { $lt: now },
        isPermanentlyDeleted: false,
      });

      let cleaned = 0;
      for (const deletion of expiredDeletions) {
        const result = await this.permanentlyDeleteAccount(deletion.originalUserId);
        if (result.success) {
          cleaned++;
        }
      }

      console.log(`🧹 Cleaned up ${cleaned} expired account deletions`);
      return { cleaned };
    } catch (error) {
      console.error("❌ Failed to cleanup expired deletions:", error);
      return { cleaned: 0, error: error.message };
    }
  },

  async getUserConversations(userId) {
    const models = await maybeGetModels();
    if (!models) {
      console.debug(`[Store][dev] getUserConversations userId=${userId} (memory-mode)`);
      const data = mem.conversations.get(userId) || [];
      console.debug(
        `[Store][dev] returning ${Array.isArray(data) ? data.length : 0} conversations for user=${userId}`
      );
      return data;
    }

    const { User } = models;
    const user = await User.findOne({ sub: userId });
    return user ? user.conversations || [] : [];
  },

  async saveUserConversations(userId, conversations) {
    const models = await maybeGetModels();
    if (!models) {
      try {
        console.debug(
          `[Store][dev] saveUserConversations userId=${userId} conversations=${
            Array.isArray(conversations) ? conversations.length : "unknown"
          }`
        );
        mem.conversations.set(userId, conversations);
        console.debug(`[Store][dev] saved conversations for user=${userId}`);
      } catch (err) {
        console.error("[Store][dev] error saving conversations", err);
        throw err;
      }
      return;
    }

    const { User } = models;
    await User.findOneAndUpdate({ sub: userId }, { conversations }, { upsert: true });
  },

  async createConversation(owner, data) {
    const models = await maybeGetModels();
    if (!models) {
      const id = crypto.randomUUID();
      const doc = {
        _id: id,
        owner,
        title: data.title || "New chat",
        model: data.model || "gpt-4o",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mem.convs.set(id, doc);
      return doc;
    }

    const { Conversation } = models;
    return Conversation.create({
      owner,
      title: data.title || "New chat",
      model: data.model || "gpt-4o",
    });
  },

  async listConversations(owner) {
    const models = await maybeGetModels();
    if (!models) {
      return Array.from(mem.convs.values())
        .filter((c) => c.owner === owner)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const { Conversation } = models;
    return Conversation.find({ owner }).sort({ updatedAt: -1 });
  },

  async createMessage(owner, conversation, msg) {
    const models = await maybeGetModels();
    if (!models) {
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
        updatedAt: new Date(),
      };
      mem.msgs.set(id, doc);

      const conv = mem.convs.get(conversation);
      if (conv) {
        conv.updatedAt = new Date();
      }

      return doc;
    }

    const { Message, Conversation } = models;
    const message = await Message.create({
      conversation,
      owner,
      role: msg.role,
      content: msg.content,
      tokens: msg.tokens,
      meta: msg.meta,
    });

    await Conversation.findByIdAndUpdate(conversation, { updatedAt: new Date() });
    return message;
  },

  async listMessages(owner, conversation) {
    const models = await maybeGetModels();
    if (!models) {
      return Array.from(mem.msgs.values())
        .filter((m) => m.conversation === conversation && m.owner === owner)
        .sort((a, b) => a.createdAt - b.createdAt);
    }

    const { Message } = models;
    return Message.find({ conversation, owner }).sort({ createdAt: 1 });
  },
};
