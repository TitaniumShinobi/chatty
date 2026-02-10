// Single source of truth. Returns packets only.
import { PolicyChecker } from "./safety/policy.js";
import { Tether } from "./safety/tether.js";
import { MemoryStore, type ContextWindow } from "./memory/MemoryStore.js";
import { Reasoner } from "../brain/reasoner.js";
import { getActivePersona } from "../lib/contextFrame.js";
import { ToneAdapter } from "./composers/ToneAdapter.js";
import type { AssistantPacket } from "../types";

export interface CoreConfig {
  memory: MemoryStore;
  enableLenses?: boolean;
  enableStreaming?: boolean;
}

export class ConversationCore {
  private cfg: CoreConfig;
  
  constructor(cfg: CoreConfig) {
    this.cfg = cfg;
  }

  async process(input: string, ctx: ContextWindow): Promise<AssistantPacket[]> {
    // 1) Safety gates (highest priority)
    const crisis = PolicyChecker.checkCrisis(input);
    if (crisis) return [{ op: "WARN", payload: { message: crisis, severity: "high" } }];

    // 2) Tether commands (fast path)
    const tether = Tether.match(input);
    if (tether) return [{ op: "TEXT", payload: { content: tether } }];

    // 3) Use local reasoning engine
    const reasonerCtx = {
      persona: getActivePersona(),
      history: ctx.history.map((h: any) => (
        typeof h === 'string'
          ? { role: 'user' as const, text: h }
          : { role: 'user' as const, text: h.text, timestamp: h.timestamp }
      )),
    };

    // Inject affect analysis (placeholder — can be replaced with real emotion classifier)
    const affect = {
      valence: Math.random() * 2 - 1, // -1 to +1
      arousal: Math.random() * 2 - 1,
    };
    const style = ToneAdapter.fromAffect(affect);
    reasonerCtx["style"] = style;

    const reasoner = new Reasoner(reasonerCtx);
    return await reasoner.run(input);
  }

  // Get the memory store for external access
  getMemoryStore(): MemoryStore {
    return this.cfg.memory;
  }
}
