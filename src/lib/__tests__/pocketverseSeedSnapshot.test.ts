import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  CHATTY_POCKETVERSE_SHELL_MANIFEST,
  type PocketverseShellManifest,
} from "../pocketverseShellManifest";
import {
  buildSeedSnapshotPack,
  hashSeedSnapshotFile,
  runPocketverseWakeCheck,
  verifySeedSnapshotPack,
  type PocketverseSeedSnapshotInputFile,
  type PocketverseSeedSnapshotPack,
} from "../pocketverseSeedSnapshot";

function cloneShell(shell: PocketverseShellManifest): PocketverseShellManifest {
  return JSON.parse(JSON.stringify(shell));
}

async function readRealChattySnapshotFiles(shell: PocketverseShellManifest): Promise<PocketverseSeedSnapshotInputFile[]> {
  const sourceRoot = process.cwd();
  return Promise.all(
    shell.requiredFiles.map(async (relativePath) => ({
      relativePath,
      content: await fs.readFile(path.join(sourceRoot, relativePath), "utf8"),
    })),
  );
}

async function writePackToCleanRoom(pack: PocketverseSeedSnapshotPack, cleanRoomPath: string): Promise<void> {
  for (const snapshotFile of pack.files) {
    const destinationPath = path.join(cleanRoomPath, snapshotFile.relativePath);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.writeFile(destinationPath, snapshotFile.content, "utf8");
  }
}

describe("pocketverseSeedSnapshot", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it("builds a real Chatty shell snapshot pack from approved repo files", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({
      shell,
      sourceRoot: process.cwd(),
      files,
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    const verification = verifySeedSnapshotPack({ shell, pack, sourceRoot: process.cwd() });

    expect(pack).toMatchObject({
      schemaVersion: 1,
      networkUsed: false,
      manifest: {
        shellId: shell.shellId,
        productId: "chatty",
        capsuleId: shell.capsuleId,
        glyphId: shell.glyphId,
        seedRef: shell.seedRef,
        sourceRef: shell.source.ref,
        rematerializationStage: "seed-snapshot-packed",
      },
    });
    expect(pack.manifest.aggregateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(pack.manifest.files.map((file) => file.relativePath).sort()).toEqual([...shell.requiredFiles].sort());
    for (const fileEntry of pack.manifest.files) {
      expect(fileEntry.byteSize).toBeGreaterThan(0);
      expect(fileEntry.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(verification).toMatchObject({
      ok: true,
      errors: [],
      missingFiles: [],
      hashMismatches: [],
      plaintextLeakMatches: [],
      rematerializationStage: "seed-snapshot-packed",
      networkUsed: false,
    });
  });

  it("fails verification when a packed file is tampered", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files });
    const tamperedPack: PocketverseSeedSnapshotPack = {
      ...pack,
      files: pack.files.map((file) =>
        file.relativePath === shell.requiredFiles[0] ? { ...file, content: `${file.content}\ntampered\n` } : file,
      ),
    };

    const verification = verifySeedSnapshotPack({ shell, pack: tamperedPack, sourceRoot: process.cwd() });

    expect(verification.ok).toBe(false);
    expect(verification.hashMismatches).toEqual([
      expect.objectContaining({ relativePath: shell.requiredFiles[0] }),
    ]);
  });

  it("fails verification when the aggregate hash is tampered", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files });
    const tamperedPack: PocketverseSeedSnapshotPack = {
      ...pack,
      manifest: {
        ...pack.manifest,
        aggregateHash: `sha256:${"0".repeat(64)}`,
      },
    };

    const verification = verifySeedSnapshotPack({ shell, pack: tamperedPack, sourceRoot: process.cwd() });

    expect(verification.ok).toBe(false);
    expect(verification.errors).toContain("seed snapshot aggregate hash mismatch.");
  });

  it("rejects missing source roots and required files", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files });
    const missingFilePack: PocketverseSeedSnapshotPack = {
      ...pack,
      files: pack.files.filter((file) => file.relativePath !== shell.requiredFiles[0]),
    };

    const verification = verifySeedSnapshotPack({ shell, pack: missingFilePack, sourceRoot: "" });

    expect(verification.ok).toBe(false);
    expect(verification.errors).toContain("sourceRoot is required.");
    expect(verification.missingFiles).toContain(shell.requiredFiles[0]);
  });

  it("rejects absolute paths and path traversal attempts", async () => {
    expect(() =>
      hashSeedSnapshotFile({
        relativePath: "../escape.txt",
        content: "escape",
      }),
    ).toThrow("snapshot file path must be safe and relative");

    expect(() =>
      hashSeedSnapshotFile({
        relativePath: "/tmp/escape.txt",
        content: "escape",
      }),
    ).toThrow("snapshot file path must be safe and relative");
  });

  it("fails verification when checked public files contain plaintext contact leaks", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const syntheticContact = ["wake", "invalid.test"].join("@");
    const syntheticReachability = ["555", "010", "9999"].join("-");
    const leakFiles = files.map((file, index) =>
      index === 0
        ? { ...file, content: `${file.content}\n${syntheticContact}\n${syntheticReachability}\n` }
        : file,
    );
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files: leakFiles });

    const verification = verifySeedSnapshotPack({ shell, pack, sourceRoot: process.cwd() });

    expect(verification.ok).toBe(false);
    expect(verification.plaintextLeakMatches.map((match) => match.match)).toEqual(
      expect.arrayContaining([syntheticContact, syntheticReachability]),
    );
  });

  it("fails wake check when a materialized required file is missing", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files });
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-pocketverse-wake-missing-"));
    tempRoots.push(tempRoot);
    const cleanRoomPath = path.join(tempRoot, "materialized-shell");
    await writePackToCleanRoom(pack, cleanRoomPath);
    await fs.rm(path.join(cleanRoomPath, shell.requiredFiles[0]));

    const wakeCheck = await runPocketverseWakeCheck({
      shell,
      pack,
      cleanRoomPath,
      sourceRoot: process.cwd(),
    });

    expect(wakeCheck.ok).toBe(false);
    expect(wakeCheck.rematerializationStage).toBe("seed-snapshot-packed");
    expect(wakeCheck.missingFiles).toContain(shell.requiredFiles[0]);
  });

  it("fails wake check when a materialized file is tampered", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files });
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-pocketverse-wake-tamper-"));
    tempRoots.push(tempRoot);
    const cleanRoomPath = path.join(tempRoot, "materialized-shell");
    await writePackToCleanRoom(pack, cleanRoomPath);
    await fs.writeFile(path.join(cleanRoomPath, shell.requiredFiles[0]), "tampered\n", "utf8");

    const wakeCheck = await runPocketverseWakeCheck({
      shell,
      pack,
      cleanRoomPath,
      sourceRoot: process.cwd(),
    });

    expect(wakeCheck.ok).toBe(false);
    expect(wakeCheck.hashMismatches).toEqual([
      expect.objectContaining({ relativePath: shell.requiredFiles[0] }),
    ]);
  });

  it("reaches wake-check-ready after clean-room materialization from the snapshot pack", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files });
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-pocketverse-wake-ready-"));
    tempRoots.push(tempRoot);
    const cleanRoomPath = path.join(tempRoot, "materialized-shell");
    await writePackToCleanRoom(pack, cleanRoomPath);

    const wakeCheck = await runPocketverseWakeCheck({
      shell,
      pack,
      cleanRoomPath,
      sourceRoot: process.cwd(),
    });

    expect(wakeCheck).toMatchObject({
      ok: true,
      errors: [],
      missingFiles: [],
      hashMismatches: [],
      plaintextLeakMatches: [],
      rematerializationStage: "wake-check-ready",
      networkUsed: false,
    });
  });

  it("does not mutate sibling repos while packing and wake-checking Chatty", async () => {
    const shell = cloneShell(CHATTY_POCKETVERSE_SHELL_MANIFEST);
    const siblingRoot = path.resolve(process.cwd(), "..");
    const siblingFiles = [
      path.join(siblingRoot, "quantum", "package.json"),
      path.join(siblingRoot, "code", "package.json"),
      path.join(siblingRoot, "vvault", "package.json"),
    ];
    const before = await Promise.all(siblingFiles.map((filePath) => fs.stat(filePath)));
    const files = await readRealChattySnapshotFiles(shell);
    const pack = buildSeedSnapshotPack({ shell, sourceRoot: process.cwd(), files });
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-pocketverse-sibling-safe-"));
    tempRoots.push(tempRoot);
    const cleanRoomPath = path.join(tempRoot, "materialized-shell");
    await writePackToCleanRoom(pack, cleanRoomPath);
    await runPocketverseWakeCheck({ shell, pack, cleanRoomPath, sourceRoot: process.cwd() });
    const after = await Promise.all(siblingFiles.map((filePath) => fs.stat(filePath)));

    expect(after.map((stat) => stat.mtimeMs)).toEqual(before.map((stat) => stat.mtimeMs));
    expect(after.map((stat) => stat.size)).toEqual(before.map((stat) => stat.size));
  });
});
