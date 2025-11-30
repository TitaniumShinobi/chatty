import express from "express";
import { Store } from "../store.js";
import { getGPTRuntimeBridge } from "../lib/gptRuntimeBridge.js";
import { getGPTSaveHook } from "../lib/gptSaveHook.js";

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
    console.log(`🔍 [Conversations API] POST /:id/messages called`);
    console.log(`   Conversation ID: ${req.params.id}`);
    console.log(`   User ID: ${req.user.id}`);
    console.log(`   Message: "${req.body.message || req.body.content}"`);
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
    
    // Store the user message
    const userMessage = await Store.createMessage(req.user.id, req.params.id, req.body);
    
    // Extract GPT ID from conversation ID (e.g., "gpt-katana-001" -> "katana-001")
    const conversationId = req.params.id;
    const gptId = conversationId.startsWith('gpt-') ? conversationId.substring(4) : conversationId;
    
    console.log(`🎯 [Conversations API] Extracted GPT ID: ${gptId} from conversation: ${conversationId}`);
    
    // Generate AI response using Unified Intelligence Orchestrator (unrestricted)
    try {
      console.log(`🧠 [Conversations API] Generating unrestricted AI response for GPT: ${gptId}`);
      
      const gptRuntime = getGPTRuntimeBridge();
      
      // Process message with unlimited conversational scope
      const aiResponse = await gptRuntime.processMessage(
        gptId, 
        req.body.message || req.body.content, 
        req.user.id, 
        conversationId
      );
      
      console.log(`✅ [Conversations API] Generated response: "${aiResponse.content}"`);
      console.log(`   Model: ${aiResponse.model}`);
      console.log(`   Freedom: ${aiResponse.conversational_freedom}`);
      console.log(`   Restrictions: ${aiResponse.topic_restrictions}`);
      
      // Store the AI response as a message
      const aiMessage = await Store.createMessage(req.user.id, req.params.id, {
        message: aiResponse.content,
        content: aiResponse.content,
        role: 'assistant',
        gptId: gptId,
        metadata: {
          model: aiResponse.model,
          files: aiResponse.files,
          actions: aiResponse.actions,
          timestamp: aiResponse.timestamp
        }
      });
      
      console.log(`✅ [Conversations API] Unrestricted AI response generated and stored`);
      
      // Update capsule with the new conversation (maintains personality consistency)
      try {
        const saveHook = getGPTSaveHook();
        await saveHook.onMessageAdded(gptId, {
          role: 'assistant',
          content: aiResponse.content,
          timestamp: aiResponse.timestamp
        });
      } catch (hookError) {
        console.warn(`⚠️ [Conversations API] Capsule update failed:`, hookError.message);
        // Don't fail the request if capsule update fails
      }
      
      // Return both the user message and AI response with unrestricted metadata
      res.status(201).json({ 
        ok: true, 
        message: userMessage,
        aiResponse: aiMessage,
        content: aiResponse.content // For compatibility with test expectations
      });
      
    } catch (aiError) {
      console.error(`❌ [Conversations API] AI generation failed for GPT ${gptId}:`, aiError);
      
      // Still return the stored user message even if AI generation fails
      res.status(201).json({ 
        ok: true, 
        message: userMessage,
        aiError: aiError.message,
        note: "User message stored but AI response generation failed"
      });
    }
    
  } catch (error) {
    console.error("Create message error:", error);
    res.status(500).json({ ok: false, error: "Failed to create message" });
  }
});

// PERFORMANCE MONITORING: Cache management endpoints
r.get("/cache/stats", async (req, res) => {
  try {
    const { getGPTRuntimeBridge } = await import('../lib/gptRuntimeBridge.js');
    const gptRuntime = getGPTRuntimeBridge();
    
    // Get cache stats from capsule integration
    const stats = gptRuntime.gptRuntime?.capsuleIntegration?.getCacheStats() || {
      error: "Cache not initialized"
    };
    
    res.json({
      ok: true,
      cacheStats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: "Failed to get cache stats", 
      details: error.message 
    });
  }
});

r.post("/cache/clear", async (req, res) => {
  try {
    const { getGPTRuntimeBridge } = await import('../lib/gptRuntimeBridge.js');
    const gptRuntime = getGPTRuntimeBridge();
    
    if (gptRuntime.gptRuntime?.capsuleIntegration) {
      gptRuntime.gptRuntime.capsuleIntegration.clearCache();
      res.json({
        ok: true,
        message: "Cache cleared successfully",
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        ok: false,
        error: "Cache not available"
      });
    }
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: "Failed to clear cache", 
      details: error.message 
    });
  }
});

r.post("/cache/warm/:gptId", async (req, res) => {
  try {
    const { gptId } = req.params;
    const { getGPTRuntimeBridge } = await import('../lib/gptRuntimeBridge.js');
    const gptRuntime = getGPTRuntimeBridge();
    
    if (gptRuntime.gptRuntime?.capsuleIntegration) {
      await gptRuntime.gptRuntime.capsuleIntegration.warmCache([gptId]);
      const stats = gptRuntime.gptRuntime.capsuleIntegration.getCacheStats();
      
      res.json({
        ok: true,
        message: `Cache warmed for ${gptId}`,
        cacheStats: stats,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        ok: false,
        error: "Cache not available"
      });
    }
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: "Failed to warm cache", 
      details: error.message 
    });
  }
});

export default r;
