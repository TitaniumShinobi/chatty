// config.ts – runtime configuration helpers
export const MAX_HISTORY = parseInt(process.env.MAX_HISTORY ?? '200', 10);
export const MAX_TRIPLES = parseInt(process.env.MAX_TRIPLES ?? '400', 10);
export const TTL_HOURS   = parseInt(process.env.MEM_TTL_HOURS ?? '168', 10); // 7 days
