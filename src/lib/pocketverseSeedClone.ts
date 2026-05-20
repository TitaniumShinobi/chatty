import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  validatePocketverseShellManifest,
  type PocketverseRematerializationStage,
  type PocketverseShellManifest,
} from "./pocketverseShellManifest";
import {
  runPocketverseWakeCheck,
  verifySeedSnapshotPack,
  type PocketverseSeedSnapshotPack,
} from "./pocketverseSeedSnapshot";

export type PocketverseSeedCloneFileStat = {
  isDirectory(): boolean;
  isFile(): boolean;
};

export type PocketverseSeedCloneDirent = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

export type PocketverseSeedCloneFileSystem = {
  stat(filePath: string): Promise<PocketverseSeedCloneFileStat>;
  readdir(filePath: string, options: { withFileTypes: true }): Promise<PocketverseSeedCloneDirent[]>;
  mkdir(filePath: string, options: { recursive: true }): Promise<unknown>;
  copyFile(sourcePath: string, destinationPath: string): Promise<unknown>;
  writeFile(filePath: string, content: string, encoding: "utf8"): Promise<unknown>;
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
};

export type PocketverseSeedClonePlan = {
  ok: boolean;
  shellId: string;
  productId: PocketverseShellManifest["productId"];
  sourceSnapshotPath: string;
  cleanRoomRoot: string;
  materializedShellPath: string;
  requiredFiles: string[];
  errors: string[];
  rematerializationStages: PocketverseRematerializationStage[];
};

export type PocketversePlaintextLeakMatch = {
  filePath: string;
  pattern: string;
  match: string;
};

export type PocketverseSeedCloneEvidenceReport = {
  shellId: string;
  productId: PocketverseShellManifest["productId"];
  cleanRoomPath: string;
  sourceRef: string;
  requiredFilesChecked: string[];
  missingFiles: string[];
  plaintextLeakMatches: PocketversePlaintextLeakMatch[];
  materialized: boolean;
  rematerializationStage: PocketverseRematerializationStage;
  errors: string[];
  networkUsed: false;
};

export type PocketverseSeedCloneInput = {
  shell: PocketverseShellManifest;
  sourceSnapshotPath: string;
  cleanRoomRoot: string;
  fileSystem?: PocketverseSeedCloneFileSystem;
};

export type PocketverseSeedSnapshotCloneInput = {
  shell: PocketverseShellManifest;
  pack: PocketverseSeedSnapshotPack;
  cleanRoomRoot: string;
  fileSystem?: PocketverseSeedCloneFileSystem;
};

const NODE_FILE_SYSTEM: PocketverseSeedCloneFileSystem = {
  stat: fs.stat,
  readdir: (filePath, options) => fs.readdir(filePath, options) as Promise<PocketverseSeedCloneDirent[]>,
  mkdir: fs.mkdir,
  copyFile: fs.copyFile,
  writeFile: fs.writeFile,
  readFile: fs.readFile,
};

const SKIPPED_COPY_NAMES = new Set([".git", "node_modules", "dist", "build"]);

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function safeShellPathSegment(shellId: string): string {
  return shellId.trim().replace(/[^a-z0-9._-]/gi, "_") || "shell";
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
    throw new Error(`required file must stay inside materialized shell: ${relativePath || "missing"}.`);
  }

  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, relativePath);
  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`required file must stay inside materialized shell: ${relativePath}.`);
  }
  return resolved;
}

function chooseStage(input: {
  manifestValid: boolean;
  seedVerified: boolean;
  materialized: boolean;
}): PocketverseRematerializationStage {
  if (input.materialized) {
    return "shell-materialized";
  }
  if (input.seedVerified) {
    return "seed-verified";
  }
  if (input.manifestValid) {
    return "shell-manifest-valid";
  }
  return "declared";
}

async function pathExistsAsDirectory(fileSystem: PocketverseSeedCloneFileSystem, filePath: string): Promise<boolean> {
  try {
    return (await fileSystem.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function pathExistsAsFile(fileSystem: PocketverseSeedCloneFileSystem, filePath: string): Promise<boolean> {
  try {
    return (await fileSystem.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function copyDirectoryContents(input: {
  fileSystem: PocketverseSeedCloneFileSystem;
  sourcePath: string;
  destinationPath: string;
}): Promise<void> {
  await input.fileSystem.mkdir(input.destinationPath, { recursive: true });
  const entries = await input.fileSystem.readdir(input.sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIPPED_COPY_NAMES.has(entry.name)) {
      continue;
    }

    const sourceEntryPath = path.join(input.sourcePath, entry.name);
    const destinationEntryPath = path.join(input.destinationPath, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryContents({
        fileSystem: input.fileSystem,
        sourcePath: sourceEntryPath,
        destinationPath: destinationEntryPath,
      });
      continue;
    }

    if (entry.isFile()) {
      await input.fileSystem.mkdir(path.dirname(destinationEntryPath), { recursive: true });
      await input.fileSystem.copyFile(sourceEntryPath, destinationEntryPath);
    }
  }
}

export function buildSeedClonePlan(input: {
  shell: PocketverseShellManifest;
  sourceSnapshotPath: string;
  cleanRoomRoot: string;
}): PocketverseSeedClonePlan {
  const shellValidation = validatePocketverseShellManifest(input.shell);
  const errors = [...shellValidation.errors];

  if (!input.sourceSnapshotPath?.trim()) {
    errors.push("sourceSnapshotPath is required.");
  }
  if (!input.cleanRoomRoot?.trim()) {
    errors.push("cleanRoomRoot is required.");
  }

  const materializedShellPath = input.cleanRoomRoot?.trim()
    ? path.join(input.cleanRoomRoot, safeShellPathSegment(input.shell.shellId))
    : "";

  return {
    ok: errors.length === 0,
    shellId: input.shell.shellId,
    productId: input.shell.productId,
    sourceSnapshotPath: input.sourceSnapshotPath,
    cleanRoomRoot: input.cleanRoomRoot,
    materializedShellPath,
    requiredFiles: [...input.shell.requiredFiles],
    errors: unique(errors),
    rematerializationStages: shellValidation.rematerializationStages,
  };
}

export function scanTextForForbiddenPlaintext(input: {
  filePath: string;
  text: string;
  forbiddenPlaintextPatterns: string[];
}): PocketversePlaintextLeakMatch[] {
  const matches: PocketversePlaintextLeakMatch[] = [];

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

export function buildSeedCloneEvidenceReport(input: {
  shell: PocketverseShellManifest;
  cleanRoomPath: string;
  requiredFilesChecked: string[];
  missingFiles: string[];
  plaintextLeakMatches: PocketversePlaintextLeakMatch[];
  errors?: string[];
  manifestValid: boolean;
  seedVerified: boolean;
}): PocketverseSeedCloneEvidenceReport {
  const errors = unique(input.errors || []);
  const materialized =
    errors.length === 0 &&
    input.missingFiles.length === 0 &&
    input.plaintextLeakMatches.length === 0 &&
    input.seedVerified;

  return {
    shellId: input.shell.shellId,
    productId: input.shell.productId,
    cleanRoomPath: input.cleanRoomPath,
    sourceRef: input.shell.source.ref,
    requiredFilesChecked: [...input.requiredFilesChecked],
    missingFiles: [...input.missingFiles],
    plaintextLeakMatches: [...input.plaintextLeakMatches],
    materialized,
    rematerializationStage: chooseStage({
      manifestValid: input.manifestValid,
      seedVerified: input.seedVerified,
      materialized,
    }),
    errors,
    networkUsed: false,
  };
}

export async function runSeedCloneDrillForLocalSnapshot(
  input: PocketverseSeedCloneInput,
): Promise<PocketverseSeedCloneEvidenceReport> {
  const fileSystem = input.fileSystem || NODE_FILE_SYSTEM;
  const plan = buildSeedClonePlan(input);
  const shellValidation = validatePocketverseShellManifest(input.shell);
  const errors = [...plan.errors];
  let seedVerified = false;

  if (!plan.ok) {
    return buildSeedCloneEvidenceReport({
      shell: input.shell,
      cleanRoomPath: plan.materializedShellPath,
      requiredFilesChecked: input.shell.requiredFiles,
      missingFiles: [],
      plaintextLeakMatches: [],
      errors,
      manifestValid: shellValidation.ok,
      seedVerified,
    });
  }

  const sourceIsDirectory = await pathExistsAsDirectory(fileSystem, input.sourceSnapshotPath);
  if (!sourceIsDirectory) {
    errors.push("sourceSnapshotPath must exist as a local snapshot directory.");
    return buildSeedCloneEvidenceReport({
      shell: input.shell,
      cleanRoomPath: plan.materializedShellPath,
      requiredFilesChecked: input.shell.requiredFiles,
      missingFiles: [...input.shell.requiredFiles],
      plaintextLeakMatches: [],
      errors,
      manifestValid: shellValidation.ok,
      seedVerified,
    });
  }

  seedVerified = true;
  await fileSystem.mkdir(input.cleanRoomRoot, { recursive: true });
  await copyDirectoryContents({
    fileSystem,
    sourcePath: input.sourceSnapshotPath,
    destinationPath: plan.materializedShellPath,
  });

  const missingFiles: string[] = [];
  const plaintextLeakMatches: PocketversePlaintextLeakMatch[] = [];

  for (const requiredFile of input.shell.requiredFiles) {
    let materializedFilePath: string;
    try {
      materializedFilePath = resolveInside(plan.materializedShellPath, requiredFile);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "required file path is invalid.");
      missingFiles.push(requiredFile);
      continue;
    }

    if (!(await pathExistsAsFile(fileSystem, materializedFilePath))) {
      missingFiles.push(requiredFile);
      continue;
    }

    const text = await fileSystem.readFile(materializedFilePath, "utf8");
    plaintextLeakMatches.push(
      ...scanTextForForbiddenPlaintext({
        filePath: requiredFile,
        text,
        forbiddenPlaintextPatterns: input.shell.forbiddenPlaintextPatterns,
      }),
    );
  }

  return buildSeedCloneEvidenceReport({
    shell: input.shell,
    cleanRoomPath: plan.materializedShellPath,
    requiredFilesChecked: input.shell.requiredFiles,
    missingFiles,
    plaintextLeakMatches,
    errors,
    manifestValid: shellValidation.ok,
    seedVerified,
  });
}

export async function runSeedCloneDrillForSeedSnapshotPack(
  input: PocketverseSeedSnapshotCloneInput,
): Promise<PocketverseSeedCloneEvidenceReport> {
  const fileSystem = input.fileSystem || NODE_FILE_SYSTEM;
  const shellValidation = validatePocketverseShellManifest(input.shell);
  const errors = [...shellValidation.errors];
  const cleanRoomPath = input.cleanRoomRoot?.trim()
    ? path.join(input.cleanRoomRoot, safeShellPathSegment(input.shell.shellId))
    : "";

  if (!input.cleanRoomRoot?.trim()) {
    errors.push("cleanRoomRoot is required.");
  }

  const packVerification = verifySeedSnapshotPack({
    shell: input.shell,
    pack: input.pack,
    sourceRoot: input.pack.manifest.sourceRef,
  });
  errors.push(...packVerification.errors);

  if (errors.length > 0 || !packVerification.ok) {
    return {
      shellId: input.shell.shellId,
      productId: input.shell.productId,
      cleanRoomPath,
      sourceRef: input.shell.source.ref,
      requiredFilesChecked: [...input.shell.requiredFiles],
      missingFiles: [...packVerification.missingFiles],
      plaintextLeakMatches: [...packVerification.plaintextLeakMatches],
      materialized: false,
      rematerializationStage: packVerification.rematerializationStage,
      errors: unique(errors),
      networkUsed: false,
    };
  }

  await fileSystem.mkdir(cleanRoomPath, { recursive: true });
  for (const snapshotFile of input.pack.files) {
    let destinationPath: string;
    try {
      destinationPath = resolveInside(cleanRoomPath, snapshotFile.relativePath);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "snapshot file path is invalid.");
      continue;
    }

    await fileSystem.mkdir(path.dirname(destinationPath), { recursive: true });
    await fileSystem.writeFile(destinationPath, snapshotFile.content, "utf8");
  }

  if (errors.length > 0) {
    return {
      shellId: input.shell.shellId,
      productId: input.shell.productId,
      cleanRoomPath,
      sourceRef: input.shell.source.ref,
      requiredFilesChecked: [...input.shell.requiredFiles],
      missingFiles: [],
      plaintextLeakMatches: [],
      materialized: false,
      rematerializationStage: "seed-snapshot-packed",
      errors: unique(errors),
      networkUsed: false,
    };
  }

  const wakeCheck = await runPocketverseWakeCheck({
    shell: input.shell,
    pack: input.pack,
    cleanRoomPath,
    sourceRoot: input.pack.manifest.sourceRef,
    fileSystem,
  });

  return {
    shellId: input.shell.shellId,
    productId: input.shell.productId,
    cleanRoomPath,
    sourceRef: input.shell.source.ref,
    requiredFilesChecked: [...input.shell.requiredFiles],
    missingFiles: [...wakeCheck.missingFiles],
    plaintextLeakMatches: [...wakeCheck.plaintextLeakMatches],
    materialized: wakeCheck.ok,
    rematerializationStage: wakeCheck.rematerializationStage,
    errors: unique(wakeCheck.errors),
    networkUsed: false,
  };
}
