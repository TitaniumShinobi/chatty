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
