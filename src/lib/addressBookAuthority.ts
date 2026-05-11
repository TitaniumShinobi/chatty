import type { VvaultFrontendFailureInfo } from "./vvaultConversationManager";

export type AddressBookHydrationMode =
  | "none"
  | "snapshot"
  | "index"
  | "full";

export function hasLiveVvaultAddressBookAuthority({
  conversationHydrationMode,
  vvaultFailureInfo,
  hasAddressBookVvaultLoadError,
}: {
  conversationHydrationMode: AddressBookHydrationMode;
  vvaultFailureInfo: VvaultFrontendFailureInfo | null;
  hasAddressBookVvaultLoadError: boolean;
}): boolean {
  const hasLiveVvaultHydration =
    conversationHydrationMode === "index" ||
    conversationHydrationMode === "full";

  return (
    hasLiveVvaultHydration &&
    !vvaultFailureInfo &&
    !hasAddressBookVvaultLoadError
  );
}
