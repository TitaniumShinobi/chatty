export const CREATOR_READY_TIMEOUT_MS = 5000;

export type CreatorReceiptStatus = "ok" | "error";

type FlipPending = (nextStatus: CreatorReceiptStatus, nextText: string) => void;

type TelemetrySender = (
  event: "creator_receipt_ok" | "creator_receipt_error"
) => Promise<void>;

const sendCreatorReceiptTelemetry: TelemetrySender = async () => {
  // Intentionally no-op by default.
  // The telemetry storage endpoint is not guaranteed in local/dev environments,
  // and receipt state transitions must never depend on it.
};

export const createCreatorReceiptHandshake = ({
  flipPending,
  timeoutMs = CREATOR_READY_TIMEOUT_MS,
  telemetry = sendCreatorReceiptTelemetry,
}: {
  flipPending: FlipPending;
  timeoutMs?: number;
  telemetry?: TelemetrySender;
}) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimeout = () => {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  };

  const onCreatorOpened = () => {
    clearPendingTimeout();
    timeoutId = setTimeout(() => {
      flipPending("error", "GPT Creator connection failed ❌ - Retry");
      void telemetry("creator_receipt_error");
    }, timeoutMs);
  };

  const onReady = (e: { data?: { type?: string } }) => {
    if (e.data?.type !== "gpt-creator:ready") return;
    clearPendingTimeout();
    flipPending("ok", "Connected to GPT Creator ✅");
    void telemetry("creator_receipt_ok");
  };

  const cleanup = () => {
    clearPendingTimeout();
  };

  return {
    onCreatorOpened,
    onReady,
    cleanup,
  };
};
