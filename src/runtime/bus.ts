import { OP, Packet } from "../proto/opcodes";
import { P_HELLO, P_FILE_UP, P_IDLE, P_QA, P_CODE, P_SUM, P_AUTH, P_ERR } from "../proto/payloads";
import { R } from "./render";
import { lexicon as lex } from "../data/lexicon";

type Handler = (p: Packet) => Promise<string>;

const H: Record<OP, Handler> = {
  [OP.HELLO]: async (p) => {
    const data = P_HELLO.parse(decode(p.payload));
    return R({ join: [lex.tokens.hello, data.userNameId] });
  },
  [OP.FILE_UPLOADED]: async (p) => {
    const d = P_FILE_UP.parse(decode(p.payload));
    return R(
      { join: [lex.tokens.file, d.nameId, lex.tokens.uploaded] },
      { br: true },
      lex.tokens.askNext
    );
  },
  [OP.IDLE_TIMEOUT]: async (p) => {
    P_IDLE.parse(decode(p.payload));
    return R(lex.tokens.idlePing);
  },
  [OP.INTENT_QA]: async (p) => {
    P_QA.parse(decode(p.payload));
    return R(lex.tokens.qaReady);
  },
  [OP.INTENT_CODE]: async (p) => {
    const d = P_CODE.parse(decode(p.payload));
    return R({ join: [lex.tokens.codeReady, d.langId, d.taskId] });
  },
  [OP.INTENT_SUMMARY]: async (p) => {
    P_SUM.parse(decode(p.payload));
    return R(lex.tokens.summaryReady);
  },
  [OP.AUTH_SUCCESS]: async (p) => {
    const d = P_AUTH.parse(decode(p.payload));
    return R({ join: [lex.tokens.authOk, d.displayNameId] });
  },
  [OP.ERROR]: async (p) => {
    P_ERR.parse(decode(p.payload));
    return R(lex.tokens.errGeneric);
  }
};

export async function dispatch(packet: Packet) {
  const h = H[packet.op];
  return h ? h(packet) : "⟂op";
}

// Export emitOpcode function for conversationAI integration
export function emitOpcode(code: number, payload?: any): Packet {
  const enc = new TextEncoder();
  const now = () => Date.now();
  
  return { 
    op: code as OP, 
    ts: now(), 
    payload: payload ? enc.encode(JSON.stringify(payload)) : undefined 
  };
}

// trivial CBOR replacement for demo (expect JSON bytes)
function decode(b?: Uint8Array) {
  if (!b) return {};
  return JSON.parse(new TextDecoder().decode(b));
}
