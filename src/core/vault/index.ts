// Vault Core: Central export for all vault-related functionality
// Provides unified interface for STM/LTM memory management

export { VaultStore, createVaultStore } from './VaultStore';
export { VaultSummarizer, vaultSummarizer } from './VaultSummarizer';

// Re-export types for convenience
export type { VaultEntry, VaultSearchOptions, VaultSummary } from './VaultStore';
export type { SummaryConfig, SummaryResult } from './VaultSummarizer';
