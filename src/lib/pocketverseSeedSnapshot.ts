import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  validatePocketverseShellManifest,
  type PocketverseRematerializationStage,
  type PocketverseShellManifest,
} from "./pocketverseShellManifest";

export type PocketverseSeedSnapshotInputFile = {
  relativePath: string;
  content: string;
};

export type PocketverseSeedSnapshotFileEntry = {
  relativePath: string;
  byteSize: number;
  sha256: string;
};

export type PocketverseSeedSnapshotManifest = {
  schemaVersion: 1;
  shellId: string;
  productId: PocketverseShellManifest["productId"];
  capsuleId: string;
  glyphId: string;
  seedRef: string;
  sourceRef: string;
  createdAt: string;
  files: PocketverseSeedSnapshotFileEntry[];
  aggregateHash: string;
  rematerializationStage: "seed-snapshot-packed";
};

export type PocketverseSeedSnapshotPack = {
  schemaVersion: 1;
  manifest: PocketverseSeedSnapshotManifest;
  files: PocketverseSeedSnapshotInputFile[];
  networkUsed: false;
};

export type PocketverseSeedSnapshotHashMismatch = {
  relativePath: string;
  expectedSha256: string;
  actualSha256: string;
};

export type PocketverseSeedSnapshotPlaintextLeakMatch = {
  filePath: string;
  pattern: string;
  match: string;
};

export type PocketverseSeedSnapshotVerificationResult = {
  ok: boolean;
  errors: string[];
  missingFiles: string[];
  hashMismatches: PocketverseSeedSnapshotHashMismatch[];
  plaintextLeakMatches: PocketverseSeedSnapshotPlaintextLeakMatch[];
  aggregateHash: string;
  rematerializationStage: PocketverseRematerializationStage;
  networkUsed: false;
};

export type PocketverseWakeCheckResult = PocketverseSeedSnapshotVerificationResult & {
  cleanRoomPath: string;
};

export type PocketverseSeedSnapshotFileStat = {
  isDirectory(): boolean;
  isFile(): boolean;
};

export type PocketverseSeedSnapshotFileSystem = {
  stat(filePath: string): Promise<PocketverseSeedSnapshotFileStat>;
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
};

const NODE_FILE_SYSTEM: PocketverseSeedSnapshotFileSystem = {
  stat: fs.stat,
  readFile: fs.readFile,
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sha256Ref(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function isSafeRelativePath(relativePath: string): boolean {
  const normalized = relativePath.trim().replaceAll("\\", "/");
  return (
    normalized.length > 0 &&
    !path.isAbsolute(normalized) &&
    !normalized.split("/").includes("..")
  );
}

function resolveInside(root: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`snapshot file path must be safe and relative: ${relativePath || "missing"}.`);
  }

  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, relativePath);
  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`snapshot file path must stay inside root: ${relativePath}.`);
  }
  return resolved;
}

function scanTextForForbiddenPlaintext(input: {
  filePath: string;
  text: string;
  forbiddenPlaintextPatterns: string[];
}): PocketverseSeedSnapshotPlaintextLeakMatch[] {
  const matches: PocketverseSeedSnapshotPlaintextLeakMatch[] = [];

  for (const pattern of input.forbiddenPlaintextPatterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "gi");
    } catch {
      continue;
    }

    for (const match of input.text.matchAll(regex)) {
      if (match[0]) {
        matches.push({
          filePath: input.filePath,
          pattern,
          match: match[0],
        });
      }
    }
  }

  return matches;
}

function aggregateSnapshotHash(input: Omit<PocketverseSeedSnapshotManifest, "aggregateHash">): string {
  return sha256Ref(stableJson(input));
}

function manifestWithoutAggregate(
  manifest: PocketverseSeedSnapshotManifest,
): Omit<PocketverseSeedSnapshotManifest, "aggregateHash"> {
  const { aggregateHash: _aggregateHash, ...withoutAggregate } = manifest;
  return withoutAggregate;
}

function normalizeSnapshotFiles(files: PocketverseSeedSnapshotInputFile[]): PocketverseSeedSnapshotInputFile[] {
  return [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function pushPathValidationErrors(input: {
  errors: string[];
  paths: string[];
  noun: string;
}): void {
  for (const relativePath of input.paths) {
    if (!isSafeRelativePath(relativePath)) {
      input.errors.push(`${input.noun} must be a safe relative path: ${relativePath || "missing"}.`);
    }
  }
}

function chooseSnapshotStage(input: {
  shellValid: boolean;
  snapshotPacked: boolean;
  wakeReady?: boolean;
}): PocketverseRematerializationStage {
  if (input.wakeReady) {
    return "wake-check-ready";
  }
  if (input.snapshotPacked) {
    return "seed-snapshot-packed";
  }
  if (input.shellValid) {
    return "shell-manifest-valid";
  }
  return "declared";
}

async function pathExistsAsDirectory(fileSystem: PocketverseSeedSnapshotFileSystem, filePath: string): Promise<boolean> {
  try {
    return (await fileSystem.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function pathExistsAsFile(fileSystem: PocketverseSeedSnapshotFileSystem, filePath: string): Promise<boolean> {
  try {
    return (await fileSystem.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export function hashSeedSnapshotFile(input: PocketverseSeedSnapshotInputFile): PocketverseSeedSnapshotFileEntry {
  if (!isSafeRelativePath(input.relativePath)) {
    throw new Error(`snapshot file path must be safe and relative: ${input.relativePath || "missing"}.`);
  }

  return {
    relativePath: input.relativePath,
    byteSize: Buffer.byteLength(input.content, "utf8"),
    sha256: sha256Ref(input.content),
  };
}

export function buildSeedSnapshotManifest(input: {
  shell: PocketverseShellManifest;
  sourceRoot: string;
  files: PocketverseSeedSnapshotInputFile[];
  createdAt?: string;
}): PocketverseSeedSnapshotManifest {
  const shellValidation = validatePocketverseShellManifest(input.shell);
  const errors = [...shellValidation.errors];

  if (!input.sourceRoot?.trim()) {
    errors.push("sourceRoot is required.");
  }

  const snapshotFiles = normalizeSnapshotFiles(input.files || []);
  const snapshotPaths = snapshotFiles.map((file) => file.relativePath);
  pushPathValidationErrors({ errors, paths: snapshotPaths, noun: "snapshot file" });

  const duplicatePaths = snapshotPaths.filter((relativePath, index) => snapshotPaths.indexOf(relativePath) !== index);
  if (duplicatePaths.length > 0) {
    errors.push(`snapshot files must not contain duplicates: ${unique(duplicatePaths).join(", ")}.`);
  }

  const snapshotPathSet = new Set(snapshotPaths);
  const missingRequiredFiles = input.shell.requiredFiles.filter((requiredFile) => !snapshotPathSet.has(requiredFile));
  if (missingRequiredFiles.length > 0) {
    errors.push(`required files missing from seed snapshot: ${missingRequiredFiles.join(", ")}.`);
  }

  if (errors.length > 0) {
    throw new Error(unique(errors).join(" "));
  }

  const files = snapshotFiles.map(hashSeedSnapshotFile);
  const manifestWithoutHash: Omit<PocketverseSeedSnapshotManifest, "aggregateHash"> = {
    schemaVersion: 1,
    shellId: input.shell.shellId,
    productId: input.shell.productId,
    capsuleId: input.shell.capsuleId,
    glyphId: input.shell.glyphId,
    seedRef: input.shell.seedRef,
    sourceRef: input.shell.source.ref,
    createdAt: input.createdAt || new Date().toISOString(),
    files,
    rematerializationStage: "seed-snapshot-packed",
  };

  return {
    ...manifestWithoutHash,
    aggregateHash: aggregateSnapshotHash(manifestWithoutHash),
  };
}

export function buildSeedSnapshotPack(input: {
  shell: PocketverseShellManifest;
  sourceRoot: string;
  files: PocketverseSeedSnapshotInputFile[];
  createdAt?: string;
}): PocketverseSeedSnapshotPack {
  const files = normalizeSnapshotFiles(input.files || []);

  return {
    schemaVersion: 1,
    manifest: buildSeedSnapshotManifest({
      shell: input.shell,
      sourceRoot: input.sourceRoot,
      files,
      createdAt: input.createdAt,
    }),
    files,
    networkUsed: false,
  };
}

export function verifySeedSnapshotPack(input: {
  shell: PocketverseShellManifest;
  pack: PocketverseSeedSnapshotPack;
  sourceRoot: string;
}): PocketverseSeedSnapshotVerificationResult {
  const shellValidation = validatePocketverseShellManifest(input.shell);
  const errors = [...shellValidation.errors];
  const missingFiles: string[] = [];
  const hashMismatches: PocketverseSeedSnapshotHashMismatch[] = [];
  const plaintextLeakMatches: PocketverseSeedSnapshotPlaintextLeakMatch[] = [];

  if (!input.sourceRoot?.trim()) {
    errors.push("sourceRoot is required.");
  }
  if (input.pack?.schemaVersion !== 1) {
    errors.push("seed snapshot pack schemaVersion must be 1.");
  }
  if (input.pack?.manifest?.schemaVersion !== 1) {
    errors.push("seed snapshot manifest schemaVersion must be 1.");
  }

  const manifest = input.pack.manifest;
  if (manifest.shellId !== input.shell.shellId) {
    errors.push("seed snapshot shellId mismatch.");
  }
  if (manifest.productId !== input.shell.productId) {
    errors.push("seed snapshot productId mismatch.");
  }
  if (manifest.capsuleId !== input.shell.capsuleId) {
    errors.push("seed snapshot capsuleId mismatch.");
  }
  if (manifest.glyphId !== input.shell.glyphId) {
    errors.push("seed snapshot glyphId mismatch.");
  }
  if (manifest.seedRef !== input.shell.seedRef) {
    errors.push("seed snapshot seedRef mismatch.");
  }
  if (manifest.sourceRef !== input.shell.source.ref) {
    errors.push("seed snapshot sourceRef mismatch.");
  }
  if (manifest.rematerializationStage !== "seed-snapshot-packed") {
    errors.push("seed snapshot readiness stage must be seed-snapshot-packed.");
  }

  const manifestPaths = (manifest.files || []).map((file) => file.relativePath);
  const packPaths = (input.pack.files || []).map((file) => file.relativePath);
  pushPathValidationErrors({ errors, paths: manifestPaths, noun: "snapshot manifest file" });
  pushPathValidationErrors({ errors, paths: packPaths, noun: "snapshot pack file" });

  const manifestPathSet = new Set(manifestPaths);
  const packFileByPath = new Map((input.pack.files || []).map((file) => [file.relativePath, file]));
  const manifestFileByPath = new Map((manifest.files || []).map((file) => [file.relativePath, file]));

  const duplicateManifestPaths = manifestPaths.filter((relativePath, index) => manifestPaths.indexOf(relativePath) !== index);
  const duplicatePackPaths = packPaths.filter((relativePath, index) => packPaths.indexOf(relativePath) !== index);
  if (duplicateManifestPaths.length > 0) {
    errors.push(`snapshot manifest files must not contain duplicates: ${unique(duplicateManifestPaths).join(", ")}.`);
  }
  if (duplicatePackPaths.length > 0) {
    errors.push(`snapshot pack files must not contain duplicates: ${unique(duplicatePackPaths).join(", ")}.`);
  }

  for (const requiredFile of input.shell.requiredFiles) {
    if (!manifestPathSet.has(requiredFile) || !packFileByPath.has(requiredFile)) {
      missingFiles.push(requiredFile);
    }
  }

  for (const manifestEntry of manifest.files || []) {
    const packFile = packFileByPath.get(manifestEntry.relativePath);
    if (!packFile) {
      missingFiles.push(manifestEntry.relativePath);
      continue;
    }

    let actualEntry: PocketverseSeedSnapshotFileEntry;
    try {
      actualEntry = hashSeedSnapshotFile(packFile);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "snapshot file hash failed.");
      continue;
    }

    if (actualEntry.byteSize !== manifestEntry.byteSize || actualEntry.sha256 !== manifestEntry.sha256) {
      hashMismatches.push({
        relativePath: manifestEntry.relativePath,
        expectedSha256: manifestEntry.sha256,
        actualSha256: actualEntry.sha256,
      });
    }
  }

  for (const packFile of input.pack.files || []) {
    if (!manifestFileByPath.has(packFile.relativePath)) {
      errors.push(`snapshot pack file is not declared in manifest: ${packFile.relativePath}.`);
    }
    plaintextLeakMatches.push(
      ...scanTextForForbiddenPlaintext({
        filePath: packFile.relativePath,
        text: packFile.content,
        forbiddenPlaintextPatterns: input.shell.forbiddenPlaintextPatterns,
      }),
    );
  }

  const recomputedAggregateHash = aggregateSnapshotHash(manifestWithoutAggregate(manifest));
  if (manifest.aggregateHash !== recomputedAggregateHash) {
    errors.push("seed snapshot aggregate hash mismatch.");
  }

  const ok =
    errors.length === 0 &&
    missingFiles.length === 0 &&
    hashMismatches.length === 0 &&
    plaintextLeakMatches.length === 0;

  return {
    ok,
    errors: unique(errors),
    missingFiles: unique(missingFiles),
    hashMismatches,
    plaintextLeakMatches,
    aggregateHash: recomputedAggregateHash,
    rematerializationStage: chooseSnapshotStage({
      shellValid: shellValidation.ok,
      snapshotPacked: ok,
    }),
    networkUsed: false,
  };
}

export async function runPocketverseWakeCheck(input: {
  shell: PocketverseShellManifest;
  pack: PocketverseSeedSnapshotPack;
  cleanRoomPath: string;
  sourceRoot?: string;
  fileSystem?: PocketverseSeedSnapshotFileSystem;
}): Promise<PocketverseWakeCheckResult> {
  const fileSystem = input.fileSystem || NODE_FILE_SYSTEM;
  const verification = verifySeedSnapshotPack({
    shell: input.shell,
    pack: input.pack,
    sourceRoot: input.sourceRoot || input.pack.manifest.sourceRef,
  });
  const errors = [...verification.errors];
  const missingFiles = [...verification.missingFiles];
  const hashMismatches = [...verification.hashMismatches];
  const plaintextLeakMatches = [...verification.plaintextLeakMatches];

  if (!input.cleanRoomPath?.trim()) {
    errors.push("cleanRoomPath is required.");
  } else if (!(await pathExistsAsDirectory(fileSystem, input.cleanRoomPath))) {
    errors.push("cleanRoomPath must exist as a materialized shell directory.");
  }

  const manifestFileByPath = new Map(input.pack.manifest.files.map((file) => [file.relativePath, file]));

  if (input.cleanRoomPath?.trim()) {
    for (const requiredFile of input.shell.requiredFiles) {
      const manifestEntry = manifestFileByPath.get(requiredFile);
      if (!manifestEntry) {
        missingFiles.push(requiredFile);
        continue;
      }

      let materializedFilePath: string;
      try {
        materializedFilePath = resolveInside(input.cleanRoomPath, requiredFile);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "wake-check path validation failed.");
        missingFiles.push(requiredFile);
        continue;
      }

      if (!(await pathExistsAsFile(fileSystem, materializedFilePath))) {
        missingFiles.push(requiredFile);
        continue;
      }

      const content = await fileSystem.readFile(materializedFilePath, "utf8");
      const actualEntry = hashSeedSnapshotFile({ relativePath: requiredFile, content });
      if (actualEntry.byteSize !== manifestEntry.byteSize || actualEntry.sha256 !== manifestEntry.sha256) {
        hashMismatches.push({
          relativePath: requiredFile,
          expectedSha256: manifestEntry.sha256,
          actualSha256: actualEntry.sha256,
        });
      }
      plaintextLeakMatches.push(
        ...scanTextForForbiddenPlaintext({
          filePath: requiredFile,
          text: content,
          forbiddenPlaintextPatterns: input.shell.forbiddenPlaintextPatterns,
        }),
      );
    }
  }

  const ok =
    errors.length === 0 &&
    missingFiles.length === 0 &&
    hashMismatches.length === 0 &&
    plaintextLeakMatches.length === 0;

  return {
    ok,
    errors: unique(errors),
    missingFiles: unique(missingFiles),
    hashMismatches,
    plaintextLeakMatches,
    aggregateHash: verification.aggregateHash,
    rematerializationStage: chooseSnapshotStage({
      shellValid: validatePocketverseShellManifest(input.shell).ok,
      snapshotPacked: verification.ok,
      wakeReady: ok,
    }),
    networkUsed: false,
    cleanRoomPath: input.cleanRoomPath,
  };
}
