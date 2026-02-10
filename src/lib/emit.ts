import { OP, Packet } from "../proto/opcodes";

const enc = new TextEncoder();
const now = () => Date.now();

export function pkt(op: OP, obj: any, uid?: string, cid?: string): Packet {
  return { op, ts: now(), uid, cid, payload: enc.encode(JSON.stringify(obj)) };
}

// Lightweight helper to wrap an opcode with optional payload as a JSON string (legacy format)
export function emitOpcode(op: number, payload: any = {}): string {
  return JSON.stringify({ op, ...payload });
}
