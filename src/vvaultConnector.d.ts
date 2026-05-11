declare module '../../../vvaultConnector/config.js' {
  export const VVAULT_ROOT: string | null;
  export function getBasePath(): string | null;
  export function getShard(): string | null;
  export function getUserId(): string | null;
  export function isAvailable(): boolean;
}

declare module '../../vvaultConnector/index.js' {
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
}

declare module '../../vvaultConnector/readConversations.js' {
  export function readConversations(userId: string, constructId?: string): Promise<any[]>;
}

declare module '../../vvaultConnector/readCharacterProfile.js' {
  export function readCharacterProfile(constructId: string, callsign?: string | number): Promise<any>;
}

declare module '../../vvaultConnector/writeTranscript.js' {
  export function writeTranscript(params: {
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
  }): Promise<unknown>;
}
