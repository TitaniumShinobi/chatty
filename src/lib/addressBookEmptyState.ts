export function getAddressBookEmptyMessage({
  isVVAULTConnected = true,
  hasAddressBookLoadError = false,
}: {
  isVVAULTConnected?: boolean;
  hasAddressBookLoadError?: boolean;
} = {}): string {
  if (!isVVAULTConnected) {
    return "VVAULT contacts unavailable";
  }

  if (hasAddressBookLoadError) {
    return "Address book unavailable";
  }

  return "No contacts yet";
}
