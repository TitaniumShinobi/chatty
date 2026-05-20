export const POCKETVERSE_CANON_FILE_SET = [
  "docs/standards/README.md",
  "docs/standards/pocketverse-architecture.md",
  "docs/standards/pocketverse-shells.md",
  "src/lib/pocketverseManifest.ts",
  "src/lib/pocketverseVerifier.ts",
  "src/lib/pocketverseShellManifest.ts",
  "src/lib/pocketverseSeedClone.ts",
  "src/lib/pocketverseSeedSnapshot.ts",
  "src/lib/pocketverseCanonization.ts",
  "src/lib/__tests__/pocketverseManifest.test.ts",
  "src/lib/__tests__/pocketverseVerifier.test.ts",
  "src/lib/__tests__/pocketverseShellManifest.test.ts",
  "src/lib/__tests__/pocketverseSeedClone.test.ts",
  "src/lib/__tests__/pocketverseSeedSnapshot.test.ts",
  "src/lib/__tests__/pocketverseCanonization.test.ts",
] as const;

export type PocketverseGitStatusClassification =
  | "untracked"
  | "modified"
  | "added"
  | "clean"
  | "unknown";

export type PocketverseGitStatusEntry = {
  path: string;
  status: string;
  classification: PocketverseGitStatusClassification;
};

export type PocketverseCanonFileInput = {
  path: string;
  content?: string | null;
  exists?: boolean;
};

export type PocketverseCanonPlaintextLeak = {
  filePath: string;
  match: string;
};

export type PocketverseTmpAuthorityReference = {
  filePath: string;
  reference: string;
};

export type PocketverseCanonizationReport = {
  ok: boolean;
  errors: string[];
  requiredFiles: string[];
  missingFiles: string[];
  emptyFiles: string[];
  trackedFiles: string[];
  untrackedFiles: string[];
  modifiedFiles: string[];
  addedFiles: string[];
  cleanFiles: string[];
  plaintextLeakMatches: PocketverseCanonPlaintextLeak[];
  tmpAuthorityReferences: PocketverseTmpAuthorityReference[];
  unexpectedPocketverseFiles: string[];
  missingFromExpectedFileSet: string[];
  gitStatusEntries: PocketverseGitStatusEntry[];
};

const EMAIL_PATTERN = new RegExp(String.raw`[a-z0-9._%+-]+[@][a-z0-9.-]+[.][a-z]{2,}`, "gi");
const PHONE_PATTERN = new RegExp(String.raw`(?:[+]?1[\s.-]?)?(?:[(]?\d{3}[)]?[\s.-]?)\d{3}[\s.-]?\d{4}`, "g");
const TMP_BACKUP_AUTHORITY_PATTERN = /\/tmp\/[^\s"'`<>]+[.]tar[.]gz/g;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizePath(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/");
}

function isPresent(file: PocketverseCanonFileInput | undefined): boolean {
  return Boolean(file && file.exists !== false && file.content !== null && file.content !== undefined);
}

function isPocketversePath(filePath: string): boolean {
  return normalizePath(filePath).toLowerCase().includes("pocketverse");
}

function classifyStatus(status: string): PocketverseGitStatusClassification {
  if (status === "??") {
    return "untracked";
  }
  if (status.trim() === "") {
    return "clean";
  }
  if (status.includes("A")) {
    return "added";
  }
  if (status.includes("M")) {
    return "modified";
  }
  return "unknown";
}

export function parsePocketverseGitStatus(statusText: string): PocketverseGitStatusEntry[] {
  return statusText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.length > 0)
    .map((line) => {
      const status = line.slice(0, 2);
      const filePath = normalizePath(line.length > 3 ? line.slice(3) : line.slice(2));

      return {
        path: filePath,
        status,
        classification: classifyStatus(status),
      };
    });
}

function findPlaintextLeaks(file: PocketverseCanonFileInput): PocketverseCanonPlaintextLeak[] {
  const content = file.content || "";
  return [
    ...(content.match(EMAIL_PATTERN) || []),
    ...(content.match(PHONE_PATTERN) || []),
  ].map((match) => ({
    filePath: file.path,
    match,
  }));
}

function findTmpAuthorityReferences(file: PocketverseCanonFileInput): PocketverseTmpAuthorityReference[] {
  const content = file.content || "";
  return (content.match(TMP_BACKUP_AUTHORITY_PATTERN) || []).map((reference) => ({
    filePath: file.path,
    reference,
  }));
}

export function buildPocketverseCanonizationReport(input: {
  files: PocketverseCanonFileInput[];
  gitStatusText: string;
  expectedFiles?: string[];
}): PocketverseCanonizationReport {
  const expectedFiles = unique((input.expectedFiles || [...POCKETVERSE_CANON_FILE_SET]).map(normalizePath));
  const baselineFiles = [...POCKETVERSE_CANON_FILE_SET];
  const missingFromExpectedFileSet = baselineFiles.filter((filePath) => !expectedFiles.includes(filePath));
  const fileByPath = new Map(input.files.map((file) => [normalizePath(file.path), { ...file, path: normalizePath(file.path) }]));
  const gitStatusEntries = parsePocketverseGitStatus(input.gitStatusText);
  const statusByPath = new Map(gitStatusEntries.map((entry) => [entry.path, entry]));
  const errors: string[] = [];

  const missingFiles = expectedFiles.filter((filePath) => !isPresent(fileByPath.get(filePath)));
  const emptyFiles = expectedFiles.filter((filePath) => {
    const file = fileByPath.get(filePath);
    return isPresent(file) && String(file?.content || "").trim().length === 0;
  });

  const plaintextLeakMatches = expectedFiles.flatMap((filePath) => {
    const file = fileByPath.get(filePath);
    return isPresent(file) ? findPlaintextLeaks(file as PocketverseCanonFileInput) : [];
  });
  const tmpAuthorityReferences = expectedFiles.flatMap((filePath) => {
    const file = fileByPath.get(filePath);
    return isPresent(file) ? findTmpAuthorityReferences(file as PocketverseCanonFileInput) : [];
  });

  const untrackedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const addedFiles: string[] = [];
  const cleanFiles: string[] = [];
  const unknownStatusFiles: string[] = [];

  for (const filePath of expectedFiles) {
    const statusEntry = statusByPath.get(filePath);
    const classification = statusEntry?.classification || "clean";

    if (classification === "untracked") {
      untrackedFiles.push(filePath);
    } else if (classification === "modified") {
      modifiedFiles.push(filePath);
    } else if (classification === "added") {
      addedFiles.push(filePath);
    } else if (classification === "clean") {
      cleanFiles.push(filePath);
    } else {
      unknownStatusFiles.push(filePath);
    }
  }

  const trackedFiles = unique([...cleanFiles, ...modifiedFiles, ...addedFiles]);
  const unexpectedPocketverseFiles = unique([
    ...input.files
      .map((file) => normalizePath(file.path))
      .filter((filePath) => isPocketversePath(filePath) && !expectedFiles.includes(filePath)),
    ...gitStatusEntries
      .map((entry) => entry.path)
      .filter((filePath) => isPocketversePath(filePath) && !expectedFiles.includes(filePath)),
  ]);

  if (missingFromExpectedFileSet.length > 0) {
    errors.push(`Expected canon file set omits required files: ${missingFromExpectedFileSet.join(", ")}.`);
  }
  if (missingFiles.length > 0) {
    errors.push(`Missing Pocketverse canon files: ${missingFiles.join(", ")}.`);
  }
  if (emptyFiles.length > 0) {
    errors.push(`Empty Pocketverse canon files: ${emptyFiles.join(", ")}.`);
  }
  if (plaintextLeakMatches.length > 0) {
    errors.push("Pocketverse canon files contain plaintext contact details.");
  }
  if (tmpAuthorityReferences.length > 0) {
    errors.push("Pocketverse canon files must not reference generated /tmp backup artifacts as authority.");
  }
  if (unknownStatusFiles.length > 0) {
    errors.push(`Pocketverse canon files have unsafe git status classifications: ${unknownStatusFiles.join(", ")}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    requiredFiles: expectedFiles,
    missingFiles,
    emptyFiles,
    trackedFiles,
    untrackedFiles,
    modifiedFiles,
    addedFiles,
    cleanFiles,
    plaintextLeakMatches,
    tmpAuthorityReferences,
    unexpectedPocketverseFiles,
    missingFromExpectedFileSet,
    gitStatusEntries,
  };
}
