import type { AssistantPacket } from "../types";
import { getMemoryStore, Triple } from "../lib/MemoryStore";
import { getVVAULTTranscriptLoader } from "../lib/VVAULTTranscriptLoader";

// Enhanced Reasoner with memory persistence and transcript retrieval
// Queries stored triples and transcript fragments before LLM calls
export class Reasoner {
  private memoryStore = getMemoryStore();
  private transcriptLoader = getVVAULTTranscriptLoader();

  constructor(private ctx: { 
    history: { role: "user" | "assistant"; text: string }[]; 
    userId?: string;
    constructCallsign?: string;
    [k: string]: any 
  }) {}

  /**
   * Search stored triples for relevant facts
   */
  async searchTriples(userId: string, query: string): Promise<Triple[]> {
    try {
      return await this.memoryStore.searchTriples(userId, query);
    } catch (error) {
      console.warn('[Reasoner] Failed to search triples:', error);
      return [];
    }
  }

  /**
   * Search transcript fragments for relevant context
   */
  async searchTranscripts(constructCallsign: string, query: string): Promise<string[]> {
    try {
      const fragments = await this.transcriptLoader.getRelevantFragments(constructCallsign, query, 5);
      return fragments.map(f => `"${f.content}" (context: ${f.context})`);
    } catch (error) {
      console.warn('[Reasoner] Failed to search transcripts:', error);
      return [];
    }
  }

  /**
   * Enhance system prompt with memory context
   */
  async enhancePromptWithMemory(systemPrompt: string, userMessage: string, userId: string, constructCallsign?: string): Promise<string> {
    let enhancedPrompt = systemPrompt;

    // Search for relevant triples
    if (userId) {
      const relevantTriples = await this.searchTriples(userId, userMessage);
      if (relevantTriples.length > 0) {
        const tripleContext = relevantTriples
          .map(t => `${t.subject} ${t.predicate} ${t.object}`)
          .join('\n');
        
        enhancedPrompt += `\n\nRELEVANT STORED FACTS:\n${tripleContext}`;
      }
    }

    // Search for relevant transcript fragments
    if (constructCallsign) {
      const transcriptContext = await this.searchTranscripts(constructCallsign, userMessage);
      if (transcriptContext.length > 0) {
        enhancedPrompt += `\n\nRELEVANT TRANSCRIPT MEMORIES:\n${transcriptContext.join('\n')}`;
      }
    }

    return enhancedPrompt;
  }

  private buildPrompt(userText: string): string {
    const historyLines = this.ctx.history
      .map((m: any) => {
        const ts = m.timestamp ? `[${m.timestamp}] ` : '';
        return `${ts}${m.role === "user" ? "User" : "Assistant"}: ${m.text}`;
      })
      .join("\n");
    const now = new Date().toLocaleString();
    return `${historyLines}${historyLines ? "\n" : ""}[${now}] User: ${userText}\nAssistant:`;
  }

  async run(userText: string): Promise<AssistantPacket[]> {
    // Build base prompt
    let prompt = this.buildPrompt(userText);

    // Enhance with memory if context available
    if (this.ctx.userId || this.ctx.constructCallsign) {
      try {
        prompt = await this.enhancePromptWithMemory(
          prompt, 
          userText, 
          this.ctx.userId || 'anonymous',
          this.ctx.constructCallsign
        );
        console.log(`🧠 [Reasoner] Enhanced prompt with memory context`);
      } catch (error) {
        console.warn('[Reasoner] Failed to enhance prompt with memory:', error);
      }
    }

    try {
      const host = (process.env.OLLAMA_HOST || 'http://localhost').replace(/\/$/, '');
      const port = process.env.OLLAMA_PORT || '8003';
      const url = `${host}:${port}/api/generate`;
      const model = process.env.OLLAMA_MODEL || 'phi3:latest';
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false }),
      });
      if (!res.ok) {
        throw new Error(`Phi-3 HTTP ${res.status}`);
      }
      let text = "";
      try {
        const data = await res.json();
        text = (data.response ?? "").toString().trim();
      } catch {
        text = (await res.text()).trim();
      }

      // Store the interaction in memory if context available
      if (this.ctx.userId) {
        try {
          await this.memoryStore.persistMessage(
            this.ctx.userId,
            this.ctx.constructCallsign || 'default',
            userText,
            'user'
          );
          await this.memoryStore.persistMessage(
            this.ctx.userId,
            this.ctx.constructCallsign || 'default',
            text,
            'assistant'
          );
        } catch (error) {
          console.warn('[Reasoner] Failed to persist messages:', error);
        }
      }

      return [{ op: "answer.v1", payload: { content: text } }];
    } catch (err: any) {
      return [
        {
          op: "error.v1",
          payload: { message: err?.message ?? "Unknown Phi-3 error" },
        },
      ];
    }
  }

  /**
   * Store a triple in memory
   */
  async storeTriple(userId: string, subject: string, predicate: string, object: string, sourceFile?: string): Promise<void> {
    try {
      await this.memoryStore.storeTriple(userId, subject, predicate, object, sourceFile);
    } catch (error) {
      console.warn('[Reasoner] Failed to store triple:', error);
    }
  }
}
