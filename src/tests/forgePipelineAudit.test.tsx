/**
 * @jest-environment jsdom
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("../lib/simForge", () => ({
  simForgeClient: {
    preview: jest.fn(),
    forge: jest.fn(),
    forgeAndSave: jest.fn(),
    startZenBuild: jest.fn(),
    getZenBuildStatus: jest.fn(),
    startConstructSimBuild: jest.fn(),
    getConstructSimBuildStatus: jest.fn(),
  },
}));

import { deriveForgeConstructCallsign } from "../lib/forgeCallsign";
import PersonalityForge from "../components/PersonalityForge";
import { simForgeClient } from "../lib/simForge";

const mockSimForgeClient = simForgeClient as jest.Mocked<typeof simForgeClient>;

function makePreview(readyToForge: boolean, messageCount: number) {
  return {
    constructCallsign: "nova-001",
    transcriptCount: 2,
    messageCount,
    sampleMessages: Array.from({ length: Math.min(10, messageCount) }, (_, i) => ({
      role: i % 2 === 0 ? "assistant" : "user",
      preview: `message-${i}`,
    })),
    readyToForge,
  };
}

describe("Forge pipeline audit: callsign derivation", () => {
  test("deriveForgeConstructCallsign is deterministic when explicit callsign exists", () => {
    const a = deriveForgeConstructCallsign(" katana-001 ", "Ignored Name");
    const b = deriveForgeConstructCallsign(" katana-001 ", "Another Name");
    expect(a).toBe("katana-001");
    expect(b).toBe("katana-001");
  });

  test("deriveForgeConstructCallsign is deterministic when only name exists", () => {
    const a = deriveForgeConstructCallsign(null, "My Forge Bot");
    const b = deriveForgeConstructCallsign(undefined, "My Forge Bot");
    expect(a).toBe("my-forge-bot-001");
    expect(b).toBe("my-forge-bot-001");
  });
});

describe("Forge pipeline audit: GPTCreator mount/gating source checks", () => {
  const gptCreatorPath = path.join(process.cwd(), "src/components/GPTCreator.tsx");

  test("PersonalityForge is eagerly imported (not lazy)", () => {
    const source = fs.readFileSync(gptCreatorPath, "utf8");
    expect(source).toContain('import PersonalityForge from "./PersonalityForge";');
    expect(source).not.toMatch(/React\.lazy\(\(\)\s*=>\s*import\(["']\.\/PersonalityForge["']\)\)/);
  });

  test("Forge tab renders setup card when callsign missing, else mounts PersonalityForge", () => {
    const source = fs.readFileSync(gptCreatorPath, "utf8");

    expect(source).toContain("const isForgeDraftReady = forgeConstructCallsign !== null;");
    expect(source).toMatch(/\{isForgeDraftReady\s*\?\s*\([\s\S]*?<PersonalityForge[\s\S]*?\)\s*:\s*\([\s\S]*?Forge Setup Needed[\s\S]*?\)\s*\}/m);
  });

  test("onIdentityForged reads prompt.json as canonical before prompt.txt fallback", () => {
    const source = fs.readFileSync(gptCreatorPath, "utf8");

    expect(source).toContain('const promptJson = result.identityFiles?.["prompt.json"];');
    expect(source).toContain('const promptTxt = result.identityFiles?.["prompt.txt"];');
    expect(source).toContain("parsed.system_prompt");
    expect(source).toContain("parsed.instructions");
  });

  test("Forged Ollama sims hide mode tabs and present a locked artifact state", () => {
    const source = fs.readFileSync(gptCreatorPath, "utf8");
    const creatorModelModeSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/creatorModelMode.ts"),
      "utf8",
    );

    expect(creatorModelModeSource).toContain("export type OrchestrationMode = 'lin' | 'custom' | 'sim';");
    expect(creatorModelModeSource).toContain("export const CREATOR_MODE_SECTION_TITLE = 'Tone & Orchestration';");
    expect(creatorModelModeSource).toContain("export const FORGED_OLLAMA_SECTION_TITLE = 'Ollama Model Forged';");
    expect(source).toContain("const isSimModeAvailable =");
    expect(source).toContain("const creatorModeSectionTitle = getCreatorModeSectionTitle(isSimModeLocked);");
    expect(source).toContain("{creatorModeSectionTitle}");
    expect(source).toContain("Mode switching is no longer available here.");
    expect(source).toContain("applySimModeLock();");
    expect(source).toContain('if (isSimModeLocked && nextMode !== "sim")');
  });

  test("Sim lock derivation is declared before the first effect that depends on isSimModeLocked", () => {
    const source = fs.readFileSync(gptCreatorPath, "utf8");
    const simLockStateIndex = source.indexOf("const simLockState = resolveCreatorSimLock(");
    const simModeLockIndex = source.indexOf("const isSimModeLocked = simLockState.locked;");
    const firstConsumerEffectIndex = source.indexOf("useEffect(() => {\n    if (isSimModeLocked && orchestrationMode !== \"sim\") {");

    expect(simLockStateIndex).toBeGreaterThan(-1);
    expect(simModeLockIndex).toBeGreaterThan(simLockStateIndex);
    expect(firstConsumerEffectIndex).toBeGreaterThan(simModeLockIndex);
  });

  test("Custom conversation/creative model lists exclude Ollama optgroups", () => {
    const source = fs.readFileSync(gptCreatorPath, "utf8");
    const ollamaGroups = source.match(/🖥️ Ollama \(Self-Hosted\)/g) || [];

    // Legacy custom dropdown Ollama optgroups should stay removed; sims live in Sim mode.
    expect(ollamaGroups.length).toBe(0);
    expect(source).toContain("Local Ollama Sims are handled in Sim mode.");
  });
});

describe("Forge pipeline audit: PersonalityForge Build Sim visibility and handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSimForgeClient.forge.mockResolvedValue({ success: true } as any);
    mockSimForgeClient.forgeAndSave.mockResolvedValue({ success: true } as any);
  });

  test("Build Sim is hidden for platform constructs even when readyToForge=true", async () => {
    mockSimForgeClient.preview.mockResolvedValue({
      ...makePreview(true, 10),
      constructCallsign: "lin-001",
    } as any);

    render(
      <PersonalityForge
        constructCallsign="lin-001"
        constructName="Lin"
      />,
    );

    await screen.findByText("Personality Forge");
    expect(screen.getByText(/System Construct: Sim lane is platform-managed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Build Sim/i })).not.toBeInTheDocument();
  });

  test("Build Sim is shown only when readyToForge=true and construct is non-platform", async () => {
    mockSimForgeClient.preview.mockResolvedValue(makePreview(true, 10) as any);

    render(
      <PersonalityForge
        constructCallsign="nova-001"
        constructName="Nova"
      />,
    );

    await screen.findByText("Personality Forge");
    expect(screen.getByRole("button", { name: /Build Sim/i })).toBeInTheDocument();
  });

  test("Build Sim is hidden when readyToForge=false", async () => {
    mockSimForgeClient.preview.mockResolvedValue(makePreview(false, 9) as any);

    render(
      <PersonalityForge
        constructCallsign="nova-001"
        constructName="Nova"
      />,
    );

    await screen.findByText(/Need at least 10 messages to forge identity\./i);
    expect(screen.queryByRole("button", { name: /Build Sim/i })).not.toBeInTheDocument();
  });

  test("Build Sim button triggers construct sim build client call with expected payload", async () => {
    mockSimForgeClient.preview.mockResolvedValue(makePreview(true, 12) as any);
    mockSimForgeClient.startConstructSimBuild.mockResolvedValue({
      ok: true,
      jobId: "job-001",
      normalizedCallsign: "nova-001",
      status: "queued",
    } as any);
    mockSimForgeClient.getConstructSimBuildStatus.mockResolvedValue({
      ok: true,
      jobId: "job-001",
      normalizedCallsign: "nova-001",
      status: "succeeded",
    } as any);

    const user = userEvent.setup();
    render(
      <PersonalityForge
        constructCallsign="nova-001"
        constructName="Nova"
      />,
    );

    const button = await screen.findByRole("button", { name: /Build Sim/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockSimForgeClient.startConstructSimBuild).toHaveBeenCalledWith({
        callsign: "nova-001",
        dryRun: true,
        includeCapsuleSummary: true,
      });
    });
  });
});
