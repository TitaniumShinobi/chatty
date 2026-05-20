import React, { useState } from "react";

type ChecklistStage = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "skipped" | string;
  why: string;
  owner?: string;
  details?: Record<string, unknown>;
};

export type OrchestrationChecklist = {
  title?: string;
  subtitle?: string;
  version?: string;
  generatedAt?: string;
  constructId?: string;
  threadId?: string;
  overallStatus?: "pass" | "partial" | "warn" | "fail" | string;
  summary?: Record<string, number>;
  stages?: ChecklistStage[];
};

const STATUS_STYLES: Record<string, { label: string; color: string; background: string; border: string }> = {
  pass: { label: "PASS", color: "#bbf7d0", background: "rgba(22, 101, 52, 0.28)", border: "rgba(34, 197, 94, 0.48)" },
  partial: { label: "PARTIAL", color: "#fde68a", background: "rgba(146, 64, 14, 0.26)", border: "rgba(245, 158, 11, 0.52)" },
  warn: { label: "WARN", color: "#fed7aa", background: "rgba(154, 52, 18, 0.30)", border: "rgba(249, 115, 22, 0.58)" },
  fail: { label: "FAIL", color: "#fecaca", background: "rgba(127, 29, 29, 0.34)", border: "rgba(239, 68, 68, 0.62)" },
  skipped: { label: "SKIP", color: "#cbd5e1", background: "rgba(51, 65, 85, 0.44)", border: "rgba(148, 163, 184, 0.36)" },
};

function styleFor(status?: string) {
  return STATUS_STYLES[status || ""] || STATUS_STYLES.skipped;
}

function summarize(checklist: OrchestrationChecklist) {
  const summary = checklist.summary || {};
  const bits = [
    summary.pass ? `${summary.pass} pass` : null,
    summary.warn ? `${summary.warn} warn` : null,
    summary.fail ? `${summary.fail} fail` : null,
    summary.skipped ? `${summary.skipped} skipped` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" / ") : "No stages yet";
}

function formatDetails(details?: Record<string, unknown>) {
  if (!details) return "";
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return "";
  const focused = Object.fromEntries(entries.slice(0, 16));
  const text = JSON.stringify(focused, null, 2);
  return text.length > 1400 ? `${text.slice(0, 1400)}\n...` : text;
}

type RuntimeTruthItem = {
  id: string;
  label: string;
  value: string;
  status: "pass" | "warn" | "fail" | "skipped";
};

const TRUTH_STYLE: Record<string, { dot: string; bg: string; border: string; text: string }> = {
  pass: { dot: "bg-emerald-400", bg: "rgba(22, 101, 52, 0.20)", border: "rgba(34, 197, 94, 0.35)", text: "text-emerald-300" },
  warn: { dot: "bg-amber-400", bg: "rgba(146, 64, 14, 0.20)", border: "rgba(245, 158, 11, 0.40)", text: "text-amber-300" },
  fail: { dot: "bg-rose-400", bg: "rgba(127, 29, 29, 0.24)", border: "rgba(239, 68, 68, 0.45)", text: "text-rose-300" },
  skipped: { dot: "bg-slate-500", bg: "rgba(51, 65, 85, 0.30)", border: "rgba(148, 163, 184, 0.25)", text: "text-slate-400" },
};

function extractRuntimeTruth(stages: ChecklistStage[]): RuntimeTruthItem[] {
  const items: RuntimeTruthItem[] = [];
  const map: Record<string, { label: string; extract: (s: ChecklistStage) => string }> = {
    "chat-provider-model": { label: "Provider", extract: (s) => {
      const p = s.details?.providerName as string;
      const m = s.details?.modelId as string;
      return p && m ? `${p} / ${m}` : p || "unset";
    }},
    "chat-canonical-route": { label: "Route", extract: (s) => s.details?.canonical ? "canonical" : "noncanonical" },
    "persistence": { label: "Persistence", extract: (s) => s.status === "pass" ? "active" : s.status === "fail" ? "failed" : "pending" },
    "chat-persistence": { label: "Persistence", extract: (s) => s.status === "pass" ? "active" : s.status === "fail" ? "failed" : "pending" },
    "chat-fallback": { label: "Fallback", extract: (s) => s.status === "warn" ? "active" : "none" },
    "chat-hydration": { label: "Hydration", extract: (s) => (s.details?.hydrationSource as string) || s.status },
    "chat-identity-coherence": { label: "Identity", extract: (s) => s.status === "pass" ? "coherent" : s.status === "fail" ? "drifted" : "unchecked" },
    "provider": { label: "Provider", extract: (s) => s.status === "pass" ? "resolved" : s.status === "fail" ? "failed" : "pending" },
  };

  const handled = new Set<string>();
  for (const stage of stages) {
    const entry = map[stage.id];
    if (!entry || handled.has(stage.id)) continue;
    handled.add(stage.id);
    items.push({
      id: stage.id,
      label: entry.label,
      value: entry.extract(stage),
      status: stage.status as RuntimeTruthItem["status"],
    });
  }

  return items;
}

function RuntimeTruthGrid({ stages }: { stages: ChecklistStage[] }) {
  const items = extractRuntimeTruth(stages);
  if (items.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.025] p-2.5">
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">Runtime Truth</div>
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((item) => {
          const style = TRUTH_STYLE[item.status] || TRUTH_STYLE.skipped;
          return (
            <div
              key={item.id}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px]"
              style={{ background: style.bg, border: `1px solid ${style.border}` }}
              title={`${item.label}: ${item.value}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
              <span className="truncate text-slate-300">{item.label}</span>
              <span className={`ml-auto shrink-0 font-semibold ${style.text}`}>{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistStages({
  stages,
  expanded,
}: {
  stages: ChecklistStage[];
  expanded: boolean;
}) {
  return (
    <ol className="space-y-2">
      {stages.map((item) => {
        const itemStyle = styleFor(item.status);
        const detailText = expanded ? formatDetails(item.details) : "";
        return (
          <li key={item.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">{item.label}</div>
                <p className="mt-1 text-xs leading-5 text-slate-300">{item.why}</p>
              </div>
              <span
                className="shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold"
                style={{ color: itemStyle.color, background: itemStyle.background, borderColor: itemStyle.border }}
              >
                {itemStyle.label}
              </span>
            </div>
            {item.owner && (
              <div className="mt-2 break-all rounded-lg bg-black/25 px-2 py-1 font-mono text-[11px] text-slate-400">
                {item.owner}
              </div>
            )}
            {detailText && (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 px-2 py-2 font-mono text-[11px] leading-4 text-slate-300">
                {detailText}
              </pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function sectionLabelFor(checklist?: OrchestrationChecklist | null) {
  if (checklist?.title && /page checklist|checklist$/i.test(checklist.title)) {
    return "Page Checklist";
  }
  return "Checklist";
}

export default function OrchestrationInspector({
  checklist,
  runtimeChecklist,
  onHide,
  diagnosticSendArmed = false,
  onToggleDiagnosticSend,
}: {
  checklist?: OrchestrationChecklist | null;
  runtimeChecklist?: OrchestrationChecklist | null;
  onHide?: () => void;
  diagnosticSendArmed?: boolean;
  onToggleDiagnosticSend?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChecklist =
    !!checklist && Array.isArray(checklist.stages) && checklist.stages.length > 0;

  if (!hasChecklist && !onToggleDiagnosticSend) {
    return null;
  }

  const overall = hasChecklist ? styleFor(checklist?.overallStatus) : null;
  const visibleStages = hasChecklist ? checklist.stages : [];
  const runtimeStages =
    runtimeChecklist && Array.isArray(runtimeChecklist.stages)
      ? runtimeChecklist.stages
      : [];
  const hasRuntimeChecklist = runtimeStages.length > 0;

  return (
    <section
      className="w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border shadow-2xl backdrop-blur-xl"
      style={{
        background: "linear-gradient(145deg, rgba(9, 12, 20, 0.94), rgba(21, 27, 38, 0.91))",
        borderColor: "rgba(148, 163, 184, 0.24)",
        color: "var(--chatty-text, #f8fafc)",
      }}
      data-testid="orchestration-inspector"
    >
        <div className="flex items-start gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              if (hasChecklist) {
                setExpanded((value) => !value);
              }
            }}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            aria-expanded={hasChecklist ? expanded : undefined}
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Diagnosis</div>
              <div className="mt-1 text-sm font-semibold text-slate-50">
                {hasChecklist
                  ? checklist?.title || `${checklist?.constructId || "construct"} runtime checklist`
                  : "Runtime controls"}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {hasChecklist
                  ? checklist?.subtitle || summarize(checklist as OrchestrationChecklist)
                  : "Live orchestration visibility and probe-send options"}
              </div>
            </div>
            {overall && (
              <span
                className="shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold tracking-wide"
                style={{ color: overall.color, background: overall.background, borderColor: overall.border }}
              >
                {overall.label}
              </span>
            )}
          </button>
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-slate-50"
              style={{
                borderColor: "rgba(148, 163, 184, 0.18)",
                background: "rgba(15, 23, 42, 0.42)",
              }}
              aria-label="Hide orchestration log"
            >
              Hide
            </button>
          )}
        </div>

        <div className="max-h-[52vh] overflow-auto border-t border-white/10 px-3 pb-3 pt-2">
          {hasChecklist && <RuntimeTruthGrid stages={visibleStages} />}
          {onToggleDiagnosticSend && (
            <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-100">Probe send</div>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    The next text-only send runs as a Codex/Zen probe and skips conversation persistence.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleDiagnosticSend}
                  className="shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-white/10"
                  style={{
                    color: diagnosticSendArmed ? "#bbf7d0" : "#e2e8f0",
                    background: diagnosticSendArmed
                      ? "rgba(22, 101, 52, 0.28)"
                      : "rgba(15, 23, 42, 0.42)",
                    borderColor: diagnosticSendArmed
                      ? "rgba(34, 197, 94, 0.48)"
                      : "rgba(148, 163, 184, 0.18)",
                  }}
                >
                  {diagnosticSendArmed ? "Cancel probe" : "Arm next send"}
                </button>
              </div>
            </div>
          )}
          {hasChecklist ? (
            <>
              <div className="mb-2 px-1">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {sectionLabelFor(checklist)}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Route/page health definition and current page proof state.
                </div>
              </div>
              <ChecklistStages stages={visibleStages} expanded={expanded} />
              {hasRuntimeChecklist && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="mb-2 px-1">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Latest Chat Runtime Receipt
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {summarize(runtimeChecklist as OrchestrationChecklist)}
                    </div>
                  </div>
                  <ChecklistStages stages={runtimeStages} expanded={expanded} />
                </div>
              )}
            </>
          ) : (
            <div className="px-1 py-2 text-xs text-slate-500">
              The live runtime checklist appears here after this conversation produces orchestration data.
            </div>
          )}
        </div>
    </section>
  );
}
