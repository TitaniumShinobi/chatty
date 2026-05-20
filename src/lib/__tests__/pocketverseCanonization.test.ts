import {
  POCKETVERSE_CANON_FILE_SET,
  buildPocketverseCanonizationReport,
  parsePocketverseGitStatus,
  type PocketverseCanonFileInput,
} from "../pocketverseCanonization";

function fixtureFiles(
  overrides: Partial<Record<string, string | null>> = {},
): PocketverseCanonFileInput[] {
  return POCKETVERSE_CANON_FILE_SET.map((filePath) => ({
    path: filePath,
    content:
      Object.prototype.hasOwnProperty.call(overrides, filePath)
        ? overrides[filePath]
        : `canon fixture for ${filePath}\n`,
  }));
}

describe("pocketverseCanonization", () => {
  it("passes a complete canon file set with nonempty fixture files", () => {
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles(),
      gitStatusText: "",
    });

    expect(report).toMatchObject({
      ok: true,
      errors: [],
      missingFiles: [],
      emptyFiles: [],
      untrackedFiles: [],
      modifiedFiles: [],
      addedFiles: [],
      plaintextLeakMatches: [],
      tmpAuthorityReferences: [],
      unexpectedPocketverseFiles: [],
    });
    expect(report.cleanFiles.sort()).toEqual([...POCKETVERSE_CANON_FILE_SET].sort());
    expect(report.trackedFiles.sort()).toEqual([...POCKETVERSE_CANON_FILE_SET].sort());
  });

  it("fails when a required canon file is missing", () => {
    const missingPath = POCKETVERSE_CANON_FILE_SET[0];
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles().filter((file) => file.path !== missingPath),
      gitStatusText: "",
    });

    expect(report.ok).toBe(false);
    expect(report.missingFiles).toContain(missingPath);
    expect(report.errors.join(" ")).toContain("Missing Pocketverse canon files");
  });

  it("fails when a required canon file is empty", () => {
    const emptyPath = POCKETVERSE_CANON_FILE_SET[1];
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles({ [emptyPath]: "   " }),
      gitStatusText: "",
    });

    expect(report.ok).toBe(false);
    expect(report.emptyFiles).toContain(emptyPath);
    expect(report.errors.join(" ")).toContain("Empty Pocketverse canon files");
  });

  it("reports untracked git status clearly", () => {
    const untrackedPath = POCKETVERSE_CANON_FILE_SET[2];
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles(),
      gitStatusText: `?? ${untrackedPath}\n`,
    });

    expect(report.ok).toBe(true);
    expect(report.untrackedFiles).toEqual([untrackedPath]);
    expect(report.trackedFiles).not.toContain(untrackedPath);
  });

  it("reports tracked clean status clearly", () => {
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles(),
      gitStatusText: "",
    });

    expect(report.ok).toBe(true);
    expect(report.cleanFiles.sort()).toEqual([...POCKETVERSE_CANON_FILE_SET].sort());
    expect(report.untrackedFiles).toEqual([]);
  });

  it("parses untracked, modified, added, and clean git status cases", () => {
    expect(parsePocketverseGitStatus("?? src/lib/pocketverseCanonization.ts")).toEqual([
      {
        path: "src/lib/pocketverseCanonization.ts",
        status: "??",
        classification: "untracked",
      },
    ]);
    expect(parsePocketverseGitStatus(" M src/lib/pocketverseSeedClone.ts")).toEqual([
      {
        path: "src/lib/pocketverseSeedClone.ts",
        status: " M",
        classification: "modified",
      },
    ]);
    expect(parsePocketverseGitStatus("A  src/lib/pocketverseSeedSnapshot.ts")).toEqual([
      {
        path: "src/lib/pocketverseSeedSnapshot.ts",
        status: "A ",
        classification: "added",
      },
    ]);
    expect(parsePocketverseGitStatus("")).toEqual([]);
  });

  it("fails when canon files contain synthetic plaintext contact leaks", () => {
    const leakPath = POCKETVERSE_CANON_FILE_SET[3];
    const syntheticContact = ["canon", "invalid.test"].join("@");
    const syntheticReachability = ["555", "010", "9999"].join("-");
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles({
        [leakPath]: `leak ${syntheticContact} ${syntheticReachability}\n`,
      }),
      gitStatusText: "",
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("Pocketverse canon files contain plaintext contact details.");
    expect(report.plaintextLeakMatches.map((leak) => leak.match)).toEqual(
      expect.arrayContaining([syntheticContact, syntheticReachability]),
    );
  });

  it("fails when a generated tmp backup artifact is referenced as authority", () => {
    const authorityPath = POCKETVERSE_CANON_FILE_SET[4];
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles({
        [authorityPath]: "authority seed source is /tmp/chatty-pocketverse-canonization-v2-fixture.tar.gz\n",
      }),
      gitStatusText: "",
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain(
      "Pocketverse canon files must not reference generated /tmp backup artifacts as authority.",
    );
    expect(report.tmpAuthorityReferences).toEqual([
      {
        filePath: authorityPath,
        reference: "/tmp/chatty-pocketverse-canonization-v2-fixture.tar.gz",
      },
    ]);
  });

  it("fails when the expected file set omits required canon files", () => {
    const omittedPath = POCKETVERSE_CANON_FILE_SET[5];
    const report = buildPocketverseCanonizationReport({
      files: fixtureFiles(),
      gitStatusText: "",
      expectedFiles: POCKETVERSE_CANON_FILE_SET.filter((filePath) => filePath !== omittedPath),
    });

    expect(report.ok).toBe(false);
    expect(report.missingFromExpectedFileSet).toContain(omittedPath);
    expect(report.errors.join(" ")).toContain("Expected canon file set omits required files");
  });

  it("reports unexpected Pocketverse files without failing the required canon set", () => {
    const unexpectedPath = "src/lib/pocketverseLooseExperiment.ts";
    const report = buildPocketverseCanonizationReport({
      files: [
        ...fixtureFiles(),
        {
          path: unexpectedPath,
          content: "loose experiment\n",
        },
      ],
      gitStatusText: `?? ${unexpectedPath}\n`,
    });

    expect(report.ok).toBe(true);
    expect(report.unexpectedPocketverseFiles).toEqual([unexpectedPath]);
  });
});
