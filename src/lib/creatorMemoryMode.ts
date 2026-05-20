export type CreatorMemoryProfile = "continuitygpt" | "off";

type CreatorMemoryInput = {
  hasPersistentMemory?: boolean;
  memoryEnabled?: boolean;
  memoryProfile?: CreatorMemoryProfile | string | null;
};

export type CreatorMemoryState = {
  hasPersistentMemory: boolean;
  memoryEnabled: boolean;
  memoryProfile: CreatorMemoryProfile;
};

export function resolveCreatorMemoryState(
  input: CreatorMemoryInput = {},
): CreatorMemoryState {
  const enabled =
    input.hasPersistentMemory !== false ||
    input.memoryEnabled === true ||
    input.memoryProfile === "continuitygpt";

  return {
    hasPersistentMemory: enabled,
    memoryEnabled: enabled,
    memoryProfile: enabled ? "continuitygpt" : "off",
  };
}
