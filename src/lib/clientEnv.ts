export function getClientEnvValue(key: string): string {
  return String((import.meta as any).env?.[key] || "");
}

export function isClientDevEnv(): boolean {
  return Boolean((import.meta as any).env?.DEV);
}
