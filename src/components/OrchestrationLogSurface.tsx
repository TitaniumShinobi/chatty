import React from "react";
import OrchestrationInspector, {
  type OrchestrationChecklist,
} from "./OrchestrationInspector";
import { Z_LAYERS } from "../lib/zLayers";

export default function OrchestrationLogSurface({
  checklist,
  pageChecklist,
  visible,
  onToggleVisibility,
  diagnosticSendArmed = false,
  onToggleDiagnosticSend,
}: {
  checklist?: OrchestrationChecklist | null;
  pageChecklist?: OrchestrationChecklist | null;
  visible: boolean;
  onToggleVisibility: () => void;
  diagnosticSendArmed?: boolean;
  onToggleDiagnosticSend?: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute bottom-full right-0 mb-3 flex max-w-[calc(100vw-2rem)] justify-end"
      style={{ zIndex: Z_LAYERS.floatingPanel }}
      aria-live="polite"
    >
      <div className="pointer-events-auto">
        <OrchestrationInspector
          checklist={pageChecklist || checklist}
          runtimeChecklist={pageChecklist ? checklist : null}
          onHide={onToggleVisibility}
          diagnosticSendArmed={diagnosticSendArmed}
          onToggleDiagnosticSend={onToggleDiagnosticSend}
        />
      </div>
    </div>
  );
}
