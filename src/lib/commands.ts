// Single source of truth for Chatty slash commands
// Extend the COMMANDS object whenever you add a new command.
import { getPickupPendingReceiptText } from "./pickupDiagnostics";

export type ReceiptStatus = "pending" | "ok" | "error" | "blocked";

export type ReceiptMessage = {
  id: string;
  role: "system";
  text: string;
  content?: string;
  timestamp?: string;
  ts?: number;
  status?: ReceiptStatus;
};

type CommandHandler = (raw: string, push?: (m: ReceiptMessage) => void) => void;

export const COMMANDS: Record<string, CommandHandler> = {
  "/creator": (raw: string, push?: (m: ReceiptMessage) => void) => {
    const initialMessage = raw.replace(/^\/creator\s*/, "").trim();
    if (push) {
      const ts = Date.now();
      push({
        id: `receipt-creator-${ts}`,
        role: "system",
        text: "Opening GPT Creator…",
        content: "Opening GPT Creator…",
        timestamp: new Date().toISOString(),
        ts,
        status: "pending",
      });
    }
    window.dispatchEvent(
      new CustomEvent("chatty:open-gpt-creator", {
        detail: initialMessage ? { initialMessage } : {},
      })
    );
  },
  "/help": (_raw: string, _push?: (m: ReceiptMessage) => void) =>
    window.dispatchEvent(new CustomEvent("chatty:open-help")),
  "/pickup": (_raw: string, push?: (m: ReceiptMessage) => void) => {
    if (push) {
      const ts = Date.now();
      const text = getPickupPendingReceiptText();
      push({
        id: `receipt-pickup-${ts}`,
        role: "system",
        text,
        content: text,
        timestamp: new Date().toISOString(),
        ts,
        status: "pending",
      });
    }
    window.dispatchEvent(new CustomEvent("chatty:pickup-codex"));
  },
  "/reset": (_raw: string, _push?: (m: ReceiptMessage) => void) =>
    window.dispatchEvent(new CustomEvent("chatty:reset-conversation")),
};

// Returns true -> command matched & dispatched, false -> regular message
export const handleSlash = (
  raw: string,
  push?: (m: ReceiptMessage) => void
): boolean => {
  const trimmed = raw.trim();
  const command = trimmed.split(/\s+/)[0];
  const handler = COMMANDS[command];
  if (handler) {
    handler(trimmed, push);
    return true;
  }
  return false;
};

// For renderers needing the list (e.g., styling in Message.tsx)
export const slashKeys = Object.keys(COMMANDS);
