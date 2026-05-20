import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OrchestrationLogSurface from "./OrchestrationLogSurface";

const checklist = {
  constructId: "lin-001",
  overallStatus: "partial",
  summary: { pass: 5, warn: 1, fail: 1, skipped: 0 },
  stages: [
    {
      id: "identity",
      label: "Identity coherence",
      status: "pass",
      why: "Construct alignment held through the turn.",
    },
    {
      id: "memory",
      label: "Memory retrieval",
      status: "pass",
      why: "Anchor lookup returned usable context.",
    },
    {
      id: "guard",
      label: "Guardrail check",
      status: "warn",
      why: "A soft warning remained visible to the operator.",
    },
    {
      id: "routing",
      label: "Routing choice",
      status: "pass",
      why: "The selected runtime lane matched the construct.",
    },
    {
      id: "provider",
      label: "Provider handoff",
      status: "pass",
      why: "Model provider resolved cleanly.",
    },
    {
      id: "response",
      label: "Response assembly",
      status: "pass",
      why: "Assistant packets were assembled without repair.",
    },
    {
      id: "persistence",
      label: "Persistence receipt",
      status: "fail",
      why: "Transcript persistence needs operator review.",
    },
  ],
};

const pageChecklist = {
  title: "VVAULT page checklist",
  constructId: "vvault",
  overallStatus: "partial",
  summary: { pass: 0, warn: 0, fail: 0, skipped: 2 },
  stages: [
    {
      id: "vvault-bridge",
      label: "Bridge",
      status: "skipped",
      why: "The VVAULT bridge must report reachable, degraded, or blocked explicitly.",
    },
    {
      id: "vvault-auth",
      label: "Auth",
      status: "skipped",
      why: "Shared auth identity must be present before canonical VVAULT reads/writes are trusted.",
    },
  ],
};

describe("OrchestrationLogSurface", () => {
  it("hides the live orchestration panel when visibility is off", () => {
    const html = renderToStaticMarkup(
      <OrchestrationLogSurface
        checklist={checklist}
        visible={false}
        onToggleVisibility={() => {}}
        onToggleDiagnosticSend={() => {}}
      />,
    );

    expect(html).not.toContain("data-testid=\"orchestration-inspector\"");
  });

  it("shows the live orchestration panel again when visibility is on", () => {
    const html = renderToStaticMarkup(
      <OrchestrationLogSurface
        checklist={checklist}
        visible={true}
        onToggleVisibility={() => {}}
        onToggleDiagnosticSend={() => {}}
      />,
    );

    expect(html).toContain("data-testid=\"orchestration-inspector\"");
    expect(html).toContain("Diagnosis");
    expect(html).toContain("Hide");
    expect(html).toContain("Identity coherence");
    expect(html).toContain("Persistence receipt");
    expect(html).toContain("Probe send");
    expect(html).toContain("Arm next send");
    expect(html).toContain("Runtime Truth");
    expect(html).toContain("resolved");
    expect(html).toContain("failed");
  });

  it("keeps the panel available as an options home before checklist data arrives", () => {
    const html = renderToStaticMarkup(
      <OrchestrationLogSurface
        checklist={null}
        visible={true}
        onToggleVisibility={() => {}}
        onToggleDiagnosticSend={() => {}}
      />,
    );

    expect(html).toContain("Runtime controls");
    expect(html).toContain("Probe send");
  });

  it("renders a route-aware page checklist ahead of the latest chat receipt", () => {
    const html = renderToStaticMarkup(
      <OrchestrationLogSurface
        checklist={checklist}
        pageChecklist={pageChecklist}
        visible={true}
        onToggleVisibility={() => {}}
        onToggleDiagnosticSend={() => {}}
      />,
    );

    expect(html).toContain("VVAULT page checklist");
    expect(html).toContain("Page Checklist");
    expect(html).toContain("Bridge");
    expect(html).toContain("Latest Chat Runtime Receipt");
    expect(html).toContain("Identity coherence");
  });

  it("renders runtime truth panel when checklist has stages", () => {
    const html = renderToStaticMarkup(
      <OrchestrationLogSurface
        checklist={checklist}
        visible={true}
        onToggleVisibility={() => {}}
        onToggleDiagnosticSend={() => {}}
      />,
    );

    expect(html).toContain("Runtime Truth");
  });

  it("shows provider handoff status in runtime truth from checklist stages", () => {
    const html = renderToStaticMarkup(
      <OrchestrationLogSurface
        checklist={checklist}
        visible={true}
        onToggleVisibility={() => {}}
        onToggleDiagnosticSend={() => {}}
      />,
    );

    expect(html).toContain("Provider");
    expect(html).toContain("Persistence");
  });
});
