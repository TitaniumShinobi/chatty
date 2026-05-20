import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  CHATTY_POCKETVERSE_SHELL_MANIFEST,
  type PocketverseShellManifest,
} from "../pocketverseShellManifest";
import {
  buildSeedClonePlan,
  runSeedCloneDrillForLocalSnapshot,
  runSeedCloneDrillForSeedSnapshotPack,
} from "../pocketverseSeedClone";
import { buildSeedSnapshotPack } from "../pocketverseSeedSnapshot";

function cloneShell(shell: PocketverseShellManifest): PocketverseShellManifest {
  return JSON.parse(JSON.stringify(shell));
}

async function writeFixtureFile(root: string, relativePath: string, content = "public fixture\n"): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function createFixtureSnapshot(shell: PocketverseShellManifest): Promise<{
  tempRoot: string;
  sourceSnapshotPath: string;
  cleanRoomRoot: string;
}> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-pocketverse-seed-clone-"));
  const sourceSnapshotPath = path.join(tempRoot, "source-snapshot");
  const cleanRoomRoot = path.join(tempRoot, "clean-room");
  await fs.mkdir(sourceSnapshotPath, { recursive: true });

  for (const requiredFile of shell.requiredFiles) {
    await writeFixtureFile(sourceSnapshotPath, requiredFile);
  }

  return { tempRoot, sourceSnapshotPath, cleanRoomRoot };
}

async function readFixtureSnapshotFiles(
  sourceSnapshotPath: string,
  shell: PocketverseShellManifest,
): Promise<Array<{ relativePath: string; content: string }>> {
  return Promise.all(
    shell.requiredFiles.map(async (relativePath) => ({
      relativePath,
      content: await fs.readFile(path.join(sourceSnapshotPath, relativePath), "utf8"),
    })),
  );
}

describe("pocketverseSeedClone", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it("materializes a Chatty fixture shell into a temp clean room", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const fixture = await createFixtureSnapshot(shell);
    tempRoots.push(fixture.tempRoot);

    const evidence = await runSeedCloneDrillForLocalSnapshot({
      shell,
      sourceSnapshotPath: fixture.sourceSnapshotPath,
      cleanRoomRoot: fixture.cleanRoomRoot,
    });

    expect(evidence).toMatchObject({
      shellId: shell.shellId,
      productId: "chatty",
      sourceRef: shell.source.ref,
      requiredFilesChecked: shell.requiredFiles,
      missingFiles: [],
      plaintextLeakMatches: [],
      materialized: true,
      rematerializationStage: "shell-materialized",
      networkUsed: false,
    });
    expect(evidence.cleanRoomPath.startsWith(fixture.cleanRoomRoot)).toBe(true);

    for (const requiredFile of shell.requiredFiles) {
      await expect(fs.stat(path.join(evidence.cleanRoomPath, requiredFile))).resolves.toMatchObject({});
    }
  });

  it("reports missing required files without claiming shell materialization", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const fixture = await createFixtureSnapshot(shell);
    tempRoots.push(fixture.tempRoot);
    await fs.rm(path.join(fixture.sourceSnapshotPath, shell.requiredFiles[0]));

    const evidence = await runSeedCloneDrillForLocalSnapshot({
      shell,
      sourceSnapshotPath: fixture.sourceSnapshotPath,
      cleanRoomRoot: fixture.cleanRoomRoot,
    });

    expect(evidence.materialized).toBe(false);
    expect(evidence.rematerializationStage).toBe("seed-verified");
    expect(evidence.missingFiles).toContain(shell.requiredFiles[0]);
  });

  it("reports plaintext contact leaks in checked public files", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const fixture = await createFixtureSnapshot(shell);
    tempRoots.push(fixture.tempRoot);
    const syntheticContact = ["owner", "invalid.test"].join("@");
    const syntheticReachability = ["555", "010", "9999"].join("-");
    await writeFixtureFile(
      fixture.sourceSnapshotPath,
      shell.requiredFiles[1],
      `public leak fixture ${syntheticContact} ${syntheticReachability}\n`,
    );

    const evidence = await runSeedCloneDrillForLocalSnapshot({
      shell,
      sourceSnapshotPath: fixture.sourceSnapshotPath,
      cleanRoomRoot: fixture.cleanRoomRoot,
    });

    expect(evidence.materialized).toBe(false);
    expect(evidence.rematerializationStage).toBe("seed-verified");
    expect(evidence.plaintextLeakMatches.map((match) => match.match)).toEqual(
      expect.arrayContaining([syntheticContact, syntheticReachability]),
    );
  });

  it("requires a clean-room path", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const fixture = await createFixtureSnapshot(shell);
    tempRoots.push(fixture.tempRoot);

    const evidence = await runSeedCloneDrillForLocalSnapshot({
      shell,
      sourceSnapshotPath: fixture.sourceSnapshotPath,
      cleanRoomRoot: "",
    });

    expect(evidence.materialized).toBe(false);
    expect(evidence.rematerializationStage).toBe("shell-manifest-valid");
    expect(evidence.errors).toContain("cleanRoomRoot is required.");
  });

  it("builds a local seed clone plan without network authority", () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const plan = buildSeedClonePlan({
      shell,
      sourceSnapshotPath: "/tmp/source-snapshot",
      cleanRoomRoot: "/tmp/clean-room",
    });

    expect(plan).toMatchObject({
      ok: true,
      shellId: shell.shellId,
      productId: "chatty",
      requiredFiles: shell.requiredFiles,
      errors: [],
    });
    expect(shell.clonePolicy.networkAllowed).toBe(false);
  });

  it("does not mutate the source snapshot while materializing", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const fixture = await createFixtureSnapshot(shell);
    tempRoots.push(fixture.tempRoot);
    const sourceFile = path.join(fixture.sourceSnapshotPath, shell.requiredFiles[0]);
    const before = await fs.readFile(sourceFile, "utf8");

    const evidence = await runSeedCloneDrillForLocalSnapshot({
      shell,
      sourceSnapshotPath: fixture.sourceSnapshotPath,
      cleanRoomRoot: fixture.cleanRoomRoot,
    });

    const after = await fs.readFile(sourceFile, "utf8");
    expect(evidence.materialized).toBe(true);
    expect(after).toBe(before);
  });

  it("materializes an in-memory seed snapshot pack and reaches wake-check-ready", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const fixture = await createFixtureSnapshot(shell);
    tempRoots.push(fixture.tempRoot);
    const files = await readFixtureSnapshotFiles(fixture.sourceSnapshotPath, shell);
    const pack = buildSeedSnapshotPack({
      shell,
      sourceRoot: fixture.sourceSnapshotPath,
      files,
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const evidence = await runSeedCloneDrillForSeedSnapshotPack({
      shell,
      pack,
      cleanRoomRoot: fixture.cleanRoomRoot,
    });

    expect(evidence).toMatchObject({
      shellId: shell.shellId,
      productId: "chatty",
      requiredFilesChecked: shell.requiredFiles,
      missingFiles: [],
      plaintextLeakMatches: [],
      materialized: true,
      rematerializationStage: "wake-check-ready",
      networkUsed: false,
    });
  });
});
