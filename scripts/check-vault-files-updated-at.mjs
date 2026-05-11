#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const writeCallPattern = /(?:\.from\(['"]vault_files['"]\)|\.table\(['"]vault_files['"]\))\.(?:update|insert|upsert)\(/;
const updatedAtPattern = /\bupdated_at\b/;

const targets = [
  {
    kind: "dir",
    root: path.join(repoRoot, "server"),
    exts: new Set([".js", ".ts", ".mjs", ".cjs"]),
  },
  {
    kind: "file",
    file: path.join(repoRoot, "../vvault/vvault/server/vvault_web_server.py"),
  },
];

async function walk(dir, exts, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, exts, out);
      continue;
    }
    if (exts.has(path.extname(entry.name))) out.push(fullPath);
  }
  return out;
}

function isAllowedHelperContext(file, lines, lineIndex) {
  if (!file.endsWith("vvault_web_server.py")) return false;

  for (let i = lineIndex; i >= 0 && i >= lineIndex - 200; i -= 1) {
    const line = lines[i];
    if (line.startsWith("def ")) {
      return line.includes("_vault_files_write_with_optional_updated_at");
    }
  }
  return false;
}

function rel(file) {
  return path.relative(repoRoot, file) || file;
}

async function getFilesToScan() {
  const files = [];
  for (const target of targets) {
    if (target.kind === "dir") {
      try {
        await fs.access(target.root);
        files.push(...(await walk(target.root, target.exts)));
      } catch {
        // Ignore missing folders in partial environments.
      }
      continue;
    }
    try {
      await fs.access(target.file);
      files.push(target.file);
    } catch {
      // Ignore missing sibling repo in partial environments.
    }
  }
  return files;
}

async function main() {
  const violations = [];
  const files = await getFilesToScan();

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      if (!writeCallPattern.test(lines[i])) continue;

      const windowEnd = Math.min(lines.length, i + 26);
      const windowLines = lines.slice(i, windowEnd);
      const hasUpdatedAt = windowLines.some((line) => updatedAtPattern.test(line));
      if (!hasUpdatedAt) continue;
      if (isAllowedHelperContext(file, lines, i)) continue;

      violations.push({
        file,
        line: i + 1,
        call: lines[i].trim(),
      });
    }
  }

  if (violations.length > 0) {
    console.error("Found disallowed vault_files writes that reference updated_at:");
    for (const hit of violations) {
      console.error(`- ${rel(hit.file)}:${hit.line} ${hit.call}`);
    }
    process.exit(1);
  }

  console.log("OK: no disallowed vault_files updated_at write patterns found.");
}

main().catch((err) => {
  console.error("check-vault-files-updated-at failed:", err);
  process.exit(1);
});
