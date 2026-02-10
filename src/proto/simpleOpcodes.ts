// Simplified Opcode System - Combining Small Chatty's simplicity with Batty's power

export enum SimpleOP {
  // Core chat operations (from Small Chatty)
  MESSAGE = 1,
  RESPONSE = 2,
  ERROR = 3,
  STATUS = 4,
  
  // File operations
  FILE_UPLOAD = 5,
  FILE_PROCESS = 6,
  
  // Memory operations
  MEMORY_CREATE = 7,
  MEMORY_RETRIEVE = 8,
  
  // System operations
  SYSTEM_INFO = 9,
  SYSTEM_CONFIG = 10,
}

export interface SimplePacket {
  op: SimpleOP;
  ts: number;
  uid?: string;
  cid?: string;
  payload: Uint8Array;
}

// Payload types for each opcode
export interface MessagePayload {
  content: string;
  role: 'user' | 'assistant' | 'system';
  conversationId: string;
  metadata?: Record<string, any>;
}

export interface ResponsePayload {
  content: string;
  conversationId: string;
  metadata?: Record<string, any>;
  reasoning?: string;
  memories?: string[];
}

export interface ErrorPayload {
  message: string;
  code: string;
  context?: string;
  conversationId?: string;
}

export interface StatusPayload {
  status: 'idle' | 'processing' | 'error' | 'ready';
  message?: string;
  progress?: number;
}

export interface FileUploadPayload {
  fileName: string;
  fileSize: number;
  mimeType: string;
  conversationId: string;
}

export interface FileProcessPayload {
  fileId: string;
  chunks: number;
  tokens: number;
  insights: string[];
  conversationId: string;
}

export interface MemoryCreatePayload {
  content: string;
  type: 'conversation' | 'fact' | 'preference' | 'context';
  userId: string;
  conversationId: string;
  metadata?: Record<string, any>;
}

export interface MemoryRetrievePayload {
  query: string;
  userId: string;
  conversationId: string;
  limit?: number;
  threshold?: number;
}

export interface SystemInfoPayload {
  version: string;
  features: string[];
  status: 'healthy' | 'degraded' | 'error';
  uptime: number;
}

export interface SystemConfigPayload {
  settings: Record<string, any>;
  userId: string;
  conversationId?: string;
}

// Union type for all payloads
export type SimplePayload = 
  | MessagePayload
  | ResponsePayload
  | ErrorPayload
  | StatusPayload
  | FileUploadPayload
  | FileProcessPayload
  | MemoryCreatePayload
  | MemoryRetrievePayload
  | SystemInfoPayload
  | SystemConfigPayload;

// Helper functions
const enc = new TextEncoder();
const now = () => Date.now();

export function createSimplePacket(
  op: SimpleOP, 
  payload: SimplePayload, 
  uid?: string, 
  cid?: string
): SimplePacket {
  return {
    op,
    ts: now(),
    uid,
    cid,
    payload: enc.encode(JSON.stringify(payload))
  };
}

export function parseSimplePacket(packet: SimplePacket): SimplePayload {
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(packet.payload));
}

// Opcode to payload type mapping
export const OPCODE_PAYLOAD_TYPES: Record<SimpleOP, string> = {
  [SimpleOP.MESSAGE]: 'MessagePayload',
  [SimpleOP.RESPONSE]: 'ResponsePayload',
  [SimpleOP.ERROR]: 'ErrorPayload',
  [SimpleOP.STATUS]: 'StatusPayload',
  [SimpleOP.FILE_UPLOAD]: 'FileUploadPayload',
  [SimpleOP.FILE_PROCESS]: 'FileProcessPayload',
  [SimpleOP.MEMORY_CREATE]: 'MemoryCreatePayload',
  [SimpleOP.MEMORY_RETRIEVE]: 'MemoryRetrievePayload',
  [SimpleOP.SYSTEM_INFO]: 'SystemInfoPayload',
  [SimpleOP.SYSTEM_CONFIG]: 'SystemConfigPayload',
};

// Validation functions
export function validateSimplePacket(packet: any): packet is SimplePacket {
  return (
    packet &&
    typeof packet === 'object' &&
    typeof packet.op === 'number' &&
    typeof packet.ts === 'number' &&
    packet.payload instanceof Uint8Array &&
    (packet.uid === undefined || typeof packet.uid === 'string') &&
    (packet.cid === undefined || typeof packet.cid === 'string')
  );
}

export function validatePayload(op: SimpleOP, payload: any): boolean {
  try {
    switch (op) {
      case SimpleOP.MESSAGE:
        return payload && typeof payload.content === 'string' && typeof payload.role === 'string';
      case SimpleOP.RESPONSE:
        return payload && typeof payload.content === 'string';
      case SimpleOP.ERROR:
        return payload && typeof payload.message === 'string';
      case SimpleOP.STATUS:
        return payload && typeof payload.status === 'string';
      case SimpleOP.FILE_UPLOAD:
        return payload && typeof payload.fileName === 'string' && typeof payload.fileSize === 'number';
      case SimpleOP.FILE_PROCESS:
        return payload && typeof payload.fileId === 'string' && typeof payload.chunks === 'number';
      case SimpleOP.MEMORY_CREATE:
        return payload && typeof payload.content === 'string' && typeof payload.type === 'string';
      case SimpleOP.MEMORY_RETRIEVE:
        return payload && typeof payload.query === 'string';
      case SimpleOP.SYSTEM_INFO:
        return payload && typeof payload.version === 'string';
      case SimpleOP.SYSTEM_CONFIG:
        return payload && typeof payload.settings === 'object';
      default:
        return false;
    }
  } catch {
    return false;
  }
}
