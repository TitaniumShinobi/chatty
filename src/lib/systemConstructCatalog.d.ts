export interface SystemConstructCatalogEntry {
  name?: string;
  displayName?: string;
  fullName?: string;
  description?: string;
  instructions?: string;
  conversationStarters?: readonly string[];
}

export function getSystemConstructCatalogEntry(constructId: string): SystemConstructCatalogEntry | null;

