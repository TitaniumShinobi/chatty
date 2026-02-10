import fs from "node:fs";
import path from "node:path";
import type { AssistantPacket } from "../types";
import type { ContextFrame } from "../brain/reasoner.js";

const PSL_PATH = path.resolve(process.cwd(), "commits.md");

// Writes a Project State Ledger (PSL) entry to commits.md
export async function vaultLog(entry: {
  input: string;
  ctx: Partial<ContextFrame>;
  packets: AssistantPacket[];
  filesEdited?: string[];
  type?: string;
  summary?: string;
}) {
  const timestamp = new Date().toISOString().replace("T", " — ").split(".")[0];
  const projectName = "Chatty";

  // Derive a simple note from first assistant packet or input
  const firstPacket = entry.packets?.[0];
  const note = firstPacket && "payload" in firstPacket && (firstPacket.payload as any).content
    ? String((firstPacket.payload as any).content).slice(0, 120)
    : entry.summary ?? entry.input.slice(0, 120);

  const block = [
    `### [${timestamp}]`,
    `**Project:** ${projectName}`,
    entry.filesEdited ? `**Files Edited:** ${entry.filesEdited.join(", ")}` : "**Files Edited:** (auto)",
    `**Type:** ${entry.type ?? "Automated Log"}`,
    `**Summary:** ${note}`,
    `**Reason for Change:** Automated vault log`,
    `**Impact:**`,
    "- ✅ Recorded interaction", 
    "- ❌ No manual review yet",
    "\n---\n",
  ].join("\n");

  await fs.promises.appendFile(PSL_PATH, block).catch(() => {});
}
