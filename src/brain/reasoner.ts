import type { AssistantPacket } from "../types";

// Simplified Reasoner for Chatty v1: always call Phi-3 via Ollama on localhost:8003.
// Assumes all inputs are smalltalk – no intent detection, no council logic.
export class Reasoner {
  constructor(private ctx: { history: { role: "user" | "assistant"; text: string }[]; [k: string]: any }) {}

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
    const prompt = this.buildPrompt(userText);

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
}
