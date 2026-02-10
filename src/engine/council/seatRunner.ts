// Deprecated seatRunner – retained only to keep legacy imports compiling.
// Chatty now routes directly to Phi-3 and no longer runs multiple council seats.

export interface CouncilPacket {
  seat: string;
  content: string;
}

// Dummy implementation that returns an empty array
export async function runCouncilSeats(): Promise<CouncilPacket[]> {
  return [];
}
