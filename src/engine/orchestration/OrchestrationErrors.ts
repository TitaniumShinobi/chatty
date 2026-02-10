/**
 * Orchestration Error Types
 *
 * Typed error classes for different orchestration failure modes.
 * Each error includes error codes, user-friendly messages, technical details, and recovery suggestions.
 */

export interface ErrorDetails {
  code: string;
  userMessage: string;
  technicalDetails?: string;
  recoverySuggestion?: string;
  context?: Record<string, any>;
}

/**
 * Base class for orchestration errors
 */
export class OrchestrationError extends Error {
  public readonly errorCode: string;
  public readonly userMessage: string;
  public readonly technicalDetails?: string;
  public readonly recoverySuggestion?: string;
  public readonly context?: Record<string, any>;

  constructor(details: ErrorDetails) {
    super(details.technicalDetails || details.userMessage);
    this.name = this.constructor.name;
    this.errorCode = details.code;
    this.userMessage = details.userMessage;
    this.technicalDetails = details.technicalDetails;
    this.recoverySuggestion = details.recoverySuggestion;
    this.context = details.context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a formatted error message for logging
   */
  toLogString(): string {
    const parts = [
      `[${this.errorCode}] ${this.userMessage}`,
      this.technicalDetails && `Technical: ${this.technicalDetails}`,
      this.recoverySuggestion && `Recovery: ${this.recoverySuggestion}`,
      this.context && `Context: ${JSON.stringify(this.context)}`,
    ].filter(Boolean);
    return parts.join("\n");
  }
}

/**
 * Triad failure - when required models are unavailable
 */
export class TriadFailureError extends OrchestrationError {
  constructor(failedSeats: string[], context?: Record<string, any>) {
    super({
      code: "TRIAD_FAILURE",
      userMessage: `Some AI models are currently unavailable (${failedSeats.join(", ")}). Please check that Ollama is running and all required models are installed.`,
      technicalDetails: `Triad validation failed. Unavailable models: ${failedSeats.join(", ")}`,
      recoverySuggestion:
        "Ensure Ollama is running and the required models (deepseek-coder:6.7b, phi3:latest, mistral:latest) are installed.",
      context: { failedSeats, ...context },
    });
  }
}

/**
 * Memory retrieval failure - when memory retrieval fails after all retries
 */
export class MemoryRetrievalError extends OrchestrationError {
  constructor(
    reason: string,
    retryAttempts: number = 3,
    context?: Record<string, any>,
  ) {
    super({
      code: "MEMORY_RETRIEVAL_FAILURE",
      userMessage:
        "Memory retrieval is temporarily unavailable. Your request will continue without memory context.",
      technicalDetails: `Memory retrieval failed after ${retryAttempts} attempts. Reason: ${reason}`,
      recoverySuggestion:
        "The system will continue with blueprint-only context. Memory should be available shortly.",
      context: { reason, retryAttempts, ...context },
    });
  }
}

/**
 * Capsule loading failure - when capsule fails to load
 */
export class CapsuleLoadError extends OrchestrationError {
  constructor(callsign: string, reason: string, context?: Record<string, any>) {
    super({
      code: "CAPSULE_LOAD_FAILURE",
      userMessage: `Unable to load identity capsule for ${callsign}. Continuing with blueprint fallback.`,
      technicalDetails: `Failed to load capsule for ${callsign}: ${reason}`,
      recoverySuggestion:
        "The system will use blueprint identity instead. Capsule may be unavailable or corrupted.",
      context: { callsign, reason, ...context },
    });
  }
}

/**
 * Blueprint loading failure - when blueprint fails to load
 */
export class BlueprintLoadError extends OrchestrationError {
  constructor(
    constructId: string,
    callsign: string,
    reason: string,
    context?: Record<string, any>,
  ) {
    super({
      code: "BLUEPRINT_LOAD_FAILURE",
      userMessage: `Unable to load personality blueprint for ${constructId}-${callsign}. Continuing with basic context.`,
      technicalDetails: `Failed to load blueprint for ${constructId}-${callsign}: ${reason}`,
      recoverySuggestion:
        "The system will continue with basic context. Blueprint may be missing or corrupted.",
      context: { constructId, callsign, reason, ...context },
    });
  }
}

/**
 * Prompt assembly failure - when prompt building fails
 */
export class PromptAssemblyError extends OrchestrationError {
  constructor(reason: string, context?: Record<string, any>) {
    super({
      code: "PROMPT_ASSEMBLY_FAILURE",
      userMessage: "Failed to build system prompt. Please try again.",
      technicalDetails: `Prompt assembly failed: ${reason}`,
      recoverySuggestion:
        "This may be a temporary issue. Please try your request again.",
      context: { reason, ...context },
    });
  }
}

/**
 * Workspace context loading failure
 */
export class WorkspaceContextError extends OrchestrationError {
  constructor(reason: string, context?: Record<string, any>) {
    super({
      code: "WORKSPACE_CONTEXT_FAILURE",
      userMessage:
        "Unable to load workspace context. Continuing without file awareness.",
      technicalDetails: `Workspace context loading failed: ${reason}`,
      recoverySuggestion:
        "The system will continue without workspace file context. This is non-critical.",
      context: { reason, ...context },
    });
  }
}

/**
 * Helper function to check if an error is an OrchestrationError
 */
export function isOrchestrationError(
  error: unknown,
): error is OrchestrationError {
  return error instanceof OrchestrationError;
}

/**
 * Helper function to extract user-friendly error message from any error
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (isOrchestrationError(error)) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes("ModelNotAvailable")) {
      return "The AI model is not available. Please check that Ollama is running and the model is installed.";
    }

    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    ) {
      return "Unable to connect to the AI service. Please check that Ollama is running and reachable (configure OLLAMA_HOST/OLLAMA_PORT if needed).";
    }

    if (error.message.includes("Ollama error")) {
      return `Ollama service error: ${error.message}`;
    }

    if (error.message.includes("TRIAD BROKEN")) {
      const failedSeatsMatch = error.message.match(
        /unavailable\. Conversation PAUSED\./,
      );
      return "Some AI models are currently unavailable. Please check that Ollama is running and all required models are installed.";
    }

    // Fallback to error message
    return error.message || "An unexpected error occurred. Please try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Helper function to extract error code from any error
 */
export function getErrorCode(error: unknown): string {
  if (isOrchestrationError(error)) {
    return error.errorCode;
  }

  if (error instanceof Error) {
    // Extract error codes from common patterns
    if (error.message.includes("TRIAD BROKEN")) {
      return "TRIAD_FAILURE";
    }
    if (error.message.includes("ModelNotAvailable")) {
      return "MODEL_NOT_AVAILABLE";
    }
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    ) {
      return "NETWORK_ERROR";
    }
    if (error.message.includes("Ollama error")) {
      return "OLLAMA_ERROR";
    }
  }

  return "UNKNOWN_ERROR";
}
