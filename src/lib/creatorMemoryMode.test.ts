import { resolveCreatorMemoryState } from "./creatorMemoryMode";

describe("creatorMemoryMode", () => {
  test("defaults missing values to the single evidence-based memory mode", () => {
    expect(resolveCreatorMemoryState()).toEqual({
      hasPersistentMemory: true,
      memoryEnabled: true,
      memoryProfile: "continuitygpt",
    });
  });

  test("normalizes legacy persistent-memory-only configs to evidence-based mode", () => {
    expect(
      resolveCreatorMemoryState({
        hasPersistentMemory: true,
        memoryEnabled: false,
        memoryProfile: "off",
      }),
    ).toEqual({
      hasPersistentMemory: true,
      memoryEnabled: true,
      memoryProfile: "continuitygpt",
    });
  });

  test("keeps memory enabled when any legacy evidence flag is on", () => {
    expect(
      resolveCreatorMemoryState({
        hasPersistentMemory: false,
        memoryEnabled: true,
        memoryProfile: "off",
      }),
    ).toEqual({
      hasPersistentMemory: true,
      memoryEnabled: true,
      memoryProfile: "continuitygpt",
    });
  });

  test("turns memory fully off only when all memory flags are off", () => {
    expect(
      resolveCreatorMemoryState({
        hasPersistentMemory: false,
        memoryEnabled: false,
        memoryProfile: "off",
      }),
    ).toEqual({
      hasPersistentMemory: false,
      memoryEnabled: false,
      memoryProfile: "off",
    });
  });
});
