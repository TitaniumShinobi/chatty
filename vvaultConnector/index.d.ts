export interface VVAULTWriteTranscriptParams {
  userId?: string | null;
  userEmail?: string | null;
  sessionId: string;
  timestamp?: string;
  role?: string;
  content?: string;
  title?: string | null;
  constructId?: string | null;
  constructName?: string | null;
  constructCallsign?: string | null;
  metadata?: Record<string, unknown>;
}

export class VVAULTConnector {
  initialize(): Promise<void>;
  isAvailable(): boolean;
  getBasePath(): string | null;
  readConversations?(userId: string, constructId?: string): Promise<any[]>;
  writeTranscript?(params: VVAULTWriteTranscriptParams): Promise<unknown>;
}

export function readConversations(userId: string, constructId?: string): Promise<any[]>;
export function readCharacterProfile(constructId: string, callsign?: string | number): Promise<any>;
export function writeTranscript(params: VVAULTWriteTranscriptParams): Promise<unknown>;
export function isAvailable(): boolean;
export function getBasePath(): string | null;
