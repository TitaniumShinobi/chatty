import { OP, Packet } from "../proto/opcodes";

const enc = new TextEncoder();
const now = () => Date.now();

export function pkt(op: OP, obj: any, uid?: string, cid?: string): Packet {
  return { op, ts: now(), uid, cid, payload: enc.encode(JSON.stringify(obj)) };
}
