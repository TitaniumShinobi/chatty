import { ConversationCore } from "@/engine/ConversationCore";
import { MemoryStore } from "@/engine/memory/MemoryStore";

export function makeCliAI() {
  const memory = new MemoryStore();
  const core = new ConversationCore({ memory });
  return {
    async process(msg: string) {
      memory.append("cli", msg);
      const ctx = memory.getContext("cli");
      return core.process(msg, ctx);
    }
  };
}
