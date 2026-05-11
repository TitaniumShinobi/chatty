export const ORCHESTRATION_LOG_VISIBILITY_STORAGE_KEY =
  "chatty:orchestration-log-visible";

function getStorage() {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage;
}

export function readOrchestrationLogVisibility(): boolean {
  const storage = getStorage();
  if (!storage) return true;
  try {
    const stored = storage.getItem(ORCHESTRATION_LOG_VISIBILITY_STORAGE_KEY);
    if (stored === "hidden" || stored === "false" || stored === "0") {
      return false;
    }
    if (stored === "visible" || stored === "true" || stored === "1") {
      return true;
    }
  } catch (error) {
    console.warn(
      "[orchestrationLogVisibility] Failed to read visibility preference:",
      error,
    );
  }
  return false;
}

export function writeOrchestrationLogVisibility(visible: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      ORCHESTRATION_LOG_VISIBILITY_STORAGE_KEY,
      visible ? "visible" : "hidden",
    );
  } catch (error) {
    console.warn(
      "[orchestrationLogVisibility] Failed to persist visibility preference:",
      error,
    );
  }
}
