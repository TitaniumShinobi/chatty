#!/usr/bin/env node
import { runZenVvaultTruthProof } from "../lib/vvaultTruthProof.js";

function printReport(report = {}) {
  const keys = [
    "STATUS",
    "THREAD_ID",
    "VVAULT_CANONICAL_TAIL",
    "BACKEND_READ_TAIL",
    "MESSAGE_COUNT_COMPARISON",
    "DIVERGENCE_POINT",
    "ROOT_CAUSE",
    "CORRECTIVE_ACTIONS",
    "FILES_CHANGED",
    "VALIDATION_COMMANDS",
    "FINAL_VERDICT",
  ];
  for (const key of keys) {
    const value = report[key];
    if (value && typeof value === "object") {
      console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
    } else {
      console.log(`${key}: ${value ?? ""}`);
    }
  }
}

try {
  const report = await runZenVvaultTruthProof();
  printReport(report);
  if (report.STATUS === "BLOCKED_AUTHORITY_ENV" || report.STATUS === "DIVERGED") {
    process.exitCode = 2;
  }
} catch (error) {
  printReport({
    STATUS: "FAILED",
    THREAD_ID: "zen-001_chat_with_zen-001",
    VVAULT_CANONICAL_TAIL: null,
    BACKEND_READ_TAIL: null,
    MESSAGE_COUNT_COMPARISON: null,
    DIVERGENCE_POINT: null,
    ROOT_CAUSE: error?.message || String(error),
    CORRECTIVE_ACTIONS: [],
    FILES_CHANGED: [],
    VALIDATION_COMMANDS: [],
    FINAL_VERDICT: "Truth proof failed before comparison completed.",
  });
  process.exitCode = 1;
}
